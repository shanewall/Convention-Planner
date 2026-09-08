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