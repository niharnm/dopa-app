# Dopa web app

## Local development

Copy the public browser configuration, provide the project’s Supabase
publishable key, and point the app at a reachable Dopa scoring API:

```bash
cp .env.example .env.local
# Edit NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY if it is not already configured.
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

`NEXT_PUBLIC_DOPA_API_URL` defaults to `http://localhost:8000`. The browser
sends the current Supabase access token to the API; no service-role key or JWT
signing secret belongs in this app.

Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin in production. This
origin is used for authentication callbacks and mutation-origin checks. Vercel
deployments fall back to `VERCEL_PROJECT_PRODUCTION_URL`.

Apply the checked-in Supabase migrations before deploying application code.
They enforce ownership with row-level security, remove anonymous table grants,
validate stored field limits, and provide durable per-user API quotas.

Set `GROQ_API_KEY` in `.env.local` to enable Denver, Dopa's website agent.
Denver's safe website knowledge is regenerated from current pages and
components before every `bun run dev` and `bun run build`. The development
command also watches interface files and refreshes Denver's knowledge while
the server is running.

The dashboard accepts MP4/MOV ads up to 250 MB and 60 seconds. Results are real
model responses; there is no browser mock path.

## Checks

```bash
bun run lint
bunx tsc --noEmit
bun run test:denver
bun run test:google-ads
bun run test:security
bun run build
```
