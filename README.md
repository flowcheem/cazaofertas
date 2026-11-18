# CazaOfertas — Amazon US / Black Friday 2026

CazaOfertas is a static storefront served by a Cloudflare Worker, with a KV-backed deal catalogue and a three-hour scheduled maintenance task.

## What is implemented

- Cloudflare Worker entry point in `src/index.js`.
- Static assets served from `public/`.
- KV storage for deal records and execution history.
- Public `GET /api/deals` endpoint; expired entries are never returned.
- Protected `POST /api/admin/deals` endpoint for curated records. It accepts only Amazon.com URLs carrying the configured Associates tag, verification source and timestamps. It deliberately rejects price fields.
- Protected `GET /api/admin/runs` and public `GET /api/health`.
- Cron expression `0 */3 * * *` (every three hours, UTC).
- GitHub Actions deployment workflow. It deploys on pushes to `main` after the pull request is merged.

## Important limitation: product feed is not connected yet

The scheduled task currently expires stale records and writes an execution log. It does **not** scrape Amazon, fetch live prices, invent discounts, or automatically discover new deals.

Amazon Creators API access requires final Associates acceptance and separate API eligibility/credentials. Until those are granted, only manually verified editorial records should be published. Do not scrape Amazon pages or copy price/availability data from third-party sites as a substitute for an authorized feed.

## Cloudflare setup (one-time)

Run from the repository root with Node.js and Wrangler installed and authenticated:

```bash
npx wrangler login
npx wrangler kv namespace create cazaofertas-deals
```

Copy the returned namespace ID into `wrangler.toml`, replacing `REPLACE_WITH_CLOUDFLARE_KV_NAMESPACE_ID`.

Set a long random admin token (keep it private):

```bash
npx wrangler secret put ADMIN_TOKEN
```

Deploy:

```bash
npx wrangler deploy
```

For automatic deploys from GitHub Actions, add repository Actions secrets:
- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with permission to edit Workers and deploy assets for the target account.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.

The deployment workflow runs only from `main`; merge the reviewed pull request before expecting the workflow to deploy.

## Add a verified editorial record

Only submit a record after checking the exact product/variant, Amazon listing, seller, price and stock on Amazon itself. Price and stock are intentionally not stored or displayed by this initial version.

```bash
curl -X POST "https://YOUR-WORKER.workers.dev/api/admin/deals" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deals": [{
      "title": "Exact product name and variant",
      "category": "Electronics",
      "url": "https://www.amazon.com/dp/ASIN?tag=cazaofert0aea-20",
      "verifiedAt": "2026-11-13T12:00:00Z",
      "expiresAt": "2026-11-13T18:00:00Z",
      "verificationSource": "Manually checked on Amazon.com; exact ASIN and seller confirmed"
    }]
  }'
```

Use a short expiry and re-check the exact listing before extending it. Never use your own affiliate link to make a purchase.

## Monitoring

- `GET /api/health` reports service health and the latest scheduled execution.
- `GET /api/deals` lists current unexpired records.
- `GET /api/admin/runs` returns recent scheduled execution records (requires the admin token).

The cron currently performs expiry cleanup and logging only. Live product discovery, price/stock verification and automatic offer replacement must be added only after an authorized Amazon data source is available and integrated.
