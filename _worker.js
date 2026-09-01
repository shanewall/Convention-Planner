/**
 * Convention Planner — usage beacon Worker.
 *
 * Static assets serve normally (via the ASSETS binding). The only dynamic route
 * is /beacon: the app fetches it once per browser session, and we tally a
 * cookieless, city-level visit count in KV. Location comes from Cloudflare's
 * request metadata (request.cf) — the client never sends it, and we store no
 * IPs, no cookies, and nothing personally identifying.
 *
 * KV layout (namespace binding: USAGE):
 *   count|<COUNTRY>|<REGION>|<CITY>  -> integer, total unique-ish session visits
 *   last|<COUNTRY>|<REGION>|<CITY>   -> ISO timestamp of the most recent visit
 *   total                            -> integer, all visits across all locations
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/beacon") {
      return handleBeacon(request, env, ctx);
    }

    // Everything else is a static file — hand off to the assets binding.
    return env.ASSETS.fetch(request);
  },
};

async function handleBeacon(request, env, ctx) {
  // Only accept same-origin POSTs from the app itself.
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const cf = request.cf || {};
  // Cloudflare-provided, server-side location. Fall back gracefully.
  // cf.region is the state/province (e.g. "Wisconsin").
  const country = sanitize(cf.country) || "??";
  const region = sanitize(cf.region) || "Unknown";
  const city = sanitize(cf.city) || "Unknown";

  // If KV isn't bound yet (e.g. first deploy before the namespace exists),
  // don't error the request — just no-op so the app never sees a failure.
  if (!env.USAGE) {
    return new Response(null, { status: 204 });
  }

  const loc = `${country}|${region}|${city}`;
  const key = `count|${loc}`;
  const lastKey = `last|${loc}`;

  // Do the read-modify-write off the critical path so the beacon returns fast.
  ctx.waitUntil(
    (async () => {
      try {
        const current = parseInt((await env.USAGE.get(key)) || "0", 10) || 0;
        await env.USAGE.put(key, String(current + 1));
        await env.USAGE.put(lastKey, new Date().toISOString());

        const total = parseInt((await env.USAGE.get("total")) || "0", 10) || 0;
        await env.USAGE.put("total", String(total + 1));
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

/** Keep KV keys clean: strip separators/control chars, cap length. */
function sanitize(v) {
  if (typeof v !== "string") return "";
  return v.replace(/[|\r\n\t]/g, " ").trim().slice(0, 64);
}