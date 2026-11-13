const DEAL_PREFIX = "deal:";
const RUN_PREFIX = "run:";
const MAX_RUNS = 100;
const STORE_ID = "cazaofert0aea-20";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function validAmazonUrl(value) {
  try {
    const url = new URL(value);
    return (url.hostname === "amazon.com" || url.hostname.endsWith(".amazon.com")) &&
      url.searchParams.get("tag") === STORE_ID;
  } catch {
    return false;
  }
}

async function listDeals(env) {
  const listed = await env.DEALS.list({ prefix: DEAL_PREFIX, limit: 1000 });
  const now = Date.now();
  const items = [];
  for (const key of listed.keys) {
    const item = await env.DEALS.get(key.name, "json");
    if (!item) continue;
    if (Date.parse(item.expiresAt) > now) items.push(item);
  }
  return items.sort((a, b) => Date.parse(b.verifiedAt) - Date.parse(a.verifiedAt));
}

async function logRun(env, record) {
  const id = String(record.at).padStart(13, "0");
  await env.DEALS.put(RUN_PREFIX + id, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 45 });
  const old = await env.DEALS.list({ prefix: RUN_PREFIX, limit: 1000 });
  if (old.keys.length > MAX_RUNS) {
    const remove = old.keys.slice(0, old.keys.length - MAX_RUNS);
    await Promise.all(remove.map((key) => env.DEALS.delete(key.name)));
  }
}

async function expireDeals(env) {
  const listed = await env.DEALS.list({ prefix: DEAL_PREFIX, limit: 1000 });
  const now = Date.now();
  let expired = 0;
  for (const key of listed.keys) {
    const deal = await env.DEALS.get(key.name, "json");
    if (!deal || !Number.isFinite(Date.parse(deal.expiresAt)) || Date.parse(deal.expiresAt) <= now) {
      await env.DEALS.delete(key.name);
      expired++;
    }
  }
  return expired;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const latest = await env.DEALS.list({ prefix: RUN_PREFIX, limit: 1, reverse: true });
      const lastRun = latest.keys.length ? await env.DEALS.get(latest.keys[0].name, "json") : null;
      return json({ ok: true, service: "cazaofertas", schedule: "0 */3 * * * (UTC)", lastRun });
    }

    if (url.pathname === "/api/deals" && request.method === "GET") {
      return json({ updatedAt: new Date().toISOString(), deals: await listDeals(env) });
    }

    if (url.pathname === "/api/admin/deals" && request.method === "POST") {
      const expected = env.ADMIN_TOKEN;
      if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
        return json({ error: "Unauthorized" }, 401);
      }
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      if (!Array.isArray(body.deals) || body.deals.length > 100) {
        return json({ error: "Send a deals array with at most 100 entries" }, 400);
      }
      const saved = [];
      for (const deal of body.deals) {
        if (!deal || typeof deal.title !== "string" || deal.title.length > 140 ||
            typeof deal.category !== "string" || deal.category.length > 60 ||
            !validAmazonUrl(deal.url) ||
            !Number.isFinite(Date.parse(deal.expiresAt)) ||
            !Number.isFinite(Date.parse(deal.verifiedAt)) ||
            typeof deal.verificationSource !== "string" || deal.verificationSource.length < 5) {
          return json({ error: "Each deal needs title, category, Amazon URL tagged with the Store ID, expiresAt, verifiedAt and verificationSource. Price fields are not accepted." }, 400);
        }
        const id = crypto.randomUUID();
        const record = {
          id,
          title: deal.title.trim(),
          category: deal.category.trim(),
          url: deal.url,
          expiresAt: new Date(deal.expiresAt).toISOString(),
          verifiedAt: new Date(deal.verifiedAt).toISOString(),
          verificationSource: deal.verificationSource.trim(),
          createdAt: new Date().toISOString(),
        };
        await env.DEALS.put(DEAL_PREFIX + id, JSON.stringify(record));
        saved.push(id);
      }
      return json({ ok: true, saved: saved.length, ids: saved }, 201);
    }

    if (url.pathname === "/api/admin/runs" && request.method === "GET") {
      if (!env.ADMIN_TOKEN || request.headers.get("authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
        return json({ error: "Unauthorized" }, 401);
      }
      const listed = await env.DEALS.list({ prefix: RUN_PREFIX, limit: MAX_RUNS, reverse: true });
      const runs = await Promise.all(listed.keys.map((key) => env.DEALS.get(key.name, "json")));
      return json({ runs: runs.filter(Boolean) });
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("CazaOfertas", { status: 200 });
  },

  async scheduled(controller, env, ctx) {
    const startedAt = Date.now();
    try {
      const expired = await expireDeals(env);
      const record = {
        at: startedAt,
        scheduledTime: controller.scheduledTime,
        cron: controller.cron,
        status: "ok",
        expiredDeals: expired,
        activeDeals: (await listDeals(env)).length,
        sourceRefresh: "not_configured",
        note: "Amazon Creators API credentials/access are not configured; no prices or stock claims were fetched.",
      };
      await logRun(env, record);
      console.log("CazaOfertas cron completed", record);
    } catch (error) {
      const record = {
        at: startedAt,
        scheduledTime: controller.scheduledTime,
        cron: controller.cron,
        status: "error",
        error: String(error?.message || error),
      };
      try { await logRun(env, record); } catch (logError) {
        console.error("Could not persist cron failure", logError);
      }
      console.error("CazaOfertas cron failed", error);
    }
  },
};
