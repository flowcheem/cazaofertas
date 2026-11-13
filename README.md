# CazaOfertas — Amazon US / Black Friday 2026

Static landing page plus a Cloudflare Worker API and scheduled maintenance job.

## Current state

- Store ID: `cazaofert0aea-20`
- Marketplace: Amazon.com (US)
- Cron configured in Wrangler: `0 */3 * * *` (every three hours, UTC)
- The scheduled handler expires stale curated offers and writes an execution log.
- The API serves active offers at `GET /api/deals`.
- Admin offer ingestion: `POST /api/admin/deals` with `Authorization: Bearer <ADMIN_TOKEN>`.
- Execution status: `GET /api/health`; run history: `GET /api/admin/runs` (admin token required).
- Product price and availability fields are deliberately not accepted by the ingestion API.

## Required Cloudflare setup before deployment

1. Create a Workers KV namespace named `CAZAOFERTAS_DEALS`.
2. Replace the placeholder `id` in `wrangler.toml` with the namespace ID.
3. From the project directory run:
   ```sh
   npx wrangler secret put ADMIN_TOKEN
   npx wrangler deploy
   ```
   Use a long random token. Never commit it to Git.
4. In the Cloudflare dashboard, verify Worker `cazaofertas` has the Cron Trigger `0 */3 * * *` and Observability enabled.
5. Verify `GET /api/health` and inspect Cron Events after the first scheduled run.

## Offer data and Amazon compliance

The Amazon Associates application is still under review. Creators API access is not currently available, so this worker does **not** scrape Amazon pages or infer prices, discounts, ratings, stock, or delivery estimates. The Cron currently performs expiry cleanup and health logging only.

When Amazon grants final Associates approval and Creators API access, implement the authenticated API client in `src/index.js` using Amazon's official API documentation and permitted fields. Until then, only enter manually reviewed editorial offers through the admin endpoint, with an Amazon.com URL tagged `cazaofert0aea-20`, a verifiable source, and a conservative expiry time. Do not include price or availability claims.

Example admin payload (replace values with a real, manually checked product and dates):
```json
{
  "deals": [{
    "title": "Example product name",
    "category": "Electronics",
    "url": "https://www.amazon.com/dp/EXAMPLE?tag=cazaofert0aea-20",
    "verifiedAt": "2026-11-13T12:00:00Z",
    "expiresAt": "2026-11-14T12:00:00Z",
    "verificationSource": "Amazon product listing checked manually"
  }]
}
```

## Test locally

```sh
npx wrangler dev --test-scheduled
curl "http://localhost:8787/api/health"
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=0+*/3+*+*+*"
```

Cloudflare Cron Triggers execute in UTC. See:
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://affiliate-program.amazon.com/creatorsapi/docs/
