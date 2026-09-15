import { EmailMessage } from "cloudflare:email";

/**
 * Convention Planner — usage beacon Worker.
 *
 * Static assets serve normally (via the ASSETS binding). The only dynamic route
 * is /beacon:
 *   - POST /beacon           -> a location visit (once per browser session)
 *   - POST /beacon?e=<event> -> a depth-funnel event (once per session each)
 * Cookieless; location comes from Cloudflare request metadata, the event name
 * from the client (allowlisted). No IPs, no cookies, nothing identifying.
 *
 * KV layout (namespace binding: USAGE):
 *   count|<COUNTRY>|<REGION>|<CITY>  -> integer, unique-ish session visits
 *   last|<COUNTRY>|<REGION>|<CITY>   -> ISO timestamp of the most recent visit
 *   total                            -> integer, all visits across all locations
 *   ev|<EVENT>                       -> integer, sessions where <EVENT> happened
 *   last|ev|<EVENT>                  -> ISO timestamp of the most recent <EVENT>
 */

// Only these event names are stored — anything else is ignored, so a malformed
// or malicious client can't fill KV with junk keys.
const ALLOWED_EVENTS = new Set([
  "app_loaded",
  "drew_first_area",
  "built_out",
  "exported",
  "used_attendants",
  "returned",
  "saved_project",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/beacon") {
      return handleBeacon(request, env, ctx, url);
    }
    if (url.pathname === "/feedback") {
      // The landing site (conventionplanner.org) posts here too; allow it.
      const origin = request.headers.get("Origin") || "";
      const cors = FEEDBACK_ORIGINS.has(origin) ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
      } : {};
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const res = await handleFeedback(request, env, ctx);
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    // Everything else is a static file — hand off to the assets binding.
    return env.ASSETS.fetch(request);
  },
};

async function handleBeacon(request, env, ctx, url) {
  // Only accept same-origin POSTs from the app itself.
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  // If KV isn't bound yet, no-op so the app never sees a failure.
  if (!env.USAGE) {
    return new Response(null, { status: 204 });
  }

  // ── Event beacon: POST /beacon?e=<event> ──
  const ev = (url.searchParams.get("e") || "").trim();
  if (ev) {
    if (ALLOWED_EVENTS.has(ev)) {
      const evKey = `ev|${ev}`;
      ctx.waitUntil(
        (async () => {
          try {
            await bump(env, evKey);
            await env.USAGE.put(`last|ev|${ev}`, new Date().toISOString());
          } catch (e) {
            // Swallow — analytics must never break the app.
          }
        })()
      );
    }
    // Unknown events are silently ignored (still return 204).
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  // ── Location beacon: plain POST /beacon ──
  const cf = request.cf || {};
  const country = sanitize(cf.country) || "??";
  const region = sanitize(cf.region) || "Unknown";
  const city = sanitize(cf.city) || "Unknown";

  const loc = `${country}|${region}|${city}`;
  const key = `count|${loc}`;
  const lastKey = `last|${loc}`;

  ctx.waitUntil(
    (async () => {
      try {
        await bump(env, key);
        await env.USAGE.put(lastKey, new Date().toISOString());
        await bump(env, "total");
      } catch (e) {
        // Swallow — analytics must never break the app.
      }
    })()
  );

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}


/**
 * POST /feedback  — in-app feedback form.
 * Body (JSON): { type: "bug"|"feature"|"general", message, email?, page?, version?, hp? }
 * Every submission is saved to KV (fb|<timestamp>|<id>) so nothing is lost, then
 * emailed via the FEEDBACK_MAIL send_email binding. Spam guards: honeypot field,
 * length caps, and a per-IP limit of 5 submissions per hour (KV, auto-expiring).
 */
const FEEDBACK_TO = "dev@abarca-services.com";
const FEEDBACK_ORIGINS = new Set(["https://conventionplanner.org", "https://www.conventionplanner.org"]);
const FEEDBACK_FROM = "noreply@conventionplanner.org";
const FEEDBACK_MAX_PER_HOUR = 5;

async function handleFeedback(request, env, ctx) {
  if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "bad_json" }, 400); }
  if (!body || typeof body !== "object") return json({ ok: false, error: "bad_body" }, 400);

  // Honeypot: real users never fill this hidden field. Pretend success to bots.
  if (body.hp) return json({ ok: true });

  const type = ["bug", "feature", "general"].includes(body.type) ? body.type : "general";
  const message = String(body.message || "").trim().slice(0, 4000);
  const email = String(body.email || "").trim().slice(0, 200);
  const page = String(body.page || "").trim().slice(0, 120);
  const version = String(body.version || "").trim().slice(0, 40);
  if (message.length < 3) return json({ ok: false, error: "empty" }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "bad_email" }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const cf = request.cf || {};
  const where = [sanitize(cf.city), sanitize(cf.region), sanitize(cf.country)].filter(Boolean).join(", ");
  const when = new Date().toISOString();

  // Per-IP rate limit (needs KV; if KV is missing we still accept but can't limit).
  if (env.USAGE) {
    const rlKey = "fb|rl|" + ip;
    const n = parseInt((await env.USAGE.get(rlKey)) || "0", 10) || 0;
    if (n >= FEEDBACK_MAX_PER_HOUR) return json({ ok: false, error: "rate" }, 429);
    ctx.waitUntil(env.USAGE.put(rlKey, String(n + 1), { expirationTtl: 3600 }));
  }

  const record = { when, type, message, email, page, version, where };
  const id = "fb|" + when + "|" + Math.random().toString(36).slice(2, 8);

  // 1) Persist first — the email is a courtesy copy; KV is the source of truth.
  if (env.USAGE) {
    try { await env.USAGE.put(id, JSON.stringify(record)); } catch (e) { /* keep going */ }
  }

  // 2) Email via Cloudflare Email Routing (send_email binding). Failure here
  //    never fails the request: the record is already saved.
  let mailed = false;
  if (env.FEEDBACK_MAIL) {
    try {
      const subject = `[Convention Planner] ${type} feedback` + (version ? ` (v${version})` : "");
      const text =
        `Type:     ${type}\n` +
        `When:     ${when}\n` +
        `Version:  ${version || "-"}\n` +
        `Page:     ${page || "-"}\n` +
        `From:     ${email || "(not given)"}\n` +
        `Location: ${where || "-"}\n` +
        `KV id:    ${id}\n\n` +
        message + "\n";
      const raw =
        `From: Convention Planner <${FEEDBACK_FROM}>\r\n` +
        `To: ${FEEDBACK_TO}\r\n` +
        (email ? `Reply-To: ${email}\r\n` : "") +
        `Subject: ${subject.replace(/[\r\n]/g, " ")}\r\n` +
        `Date: ${new Date().toUTCString()}\r\n` +
        `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@conventionplanner.org>\r\n` +
        `MIME-Version: 1.0\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n` +
        `Content-Transfer-Encoding: 8bit\r\n\r\n` +
        text;
      await env.FEEDBACK_MAIL.send(new EmailMessage(FEEDBACK_FROM, FEEDBACK_TO, raw));
      mailed = true;
    } catch (e) { mailed = false; }
  }
  return json({ ok: true, mailed });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** Increment an integer KV key by 1 (read-modify-write; approximate under load). */
async function bump(env, key) {
  const current = parseInt((await env.USAGE.get(key)) || "0", 10) || 0;
  await env.USAGE.put(key, String(current + 1));
}

/** Keep KV keys clean: strip separators/control chars, cap length. */
function sanitize(v) {
  if (typeof v !== "string") return "";
  return v.replace(/[|\r\n\t]/g, " ").trim().slice(0, 64);
}
