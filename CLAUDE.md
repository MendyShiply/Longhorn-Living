# Longhorn Living: notes for Claude

## Publishing changes
The owner has given standing permission: after every change, commit, push to the working branch,
then also update `main` (the live Vercel site deploys from `main`):

    git push origin HEAD:main

Only fast forward `main`; never force push it.

## Stack
Next.js (App Router) + Supabase (Postgres, auth, storage) + Claude API for product lookup and listing copy.
Database schema: `supabase/migrations/0001_init.sql`. Setup guide: `README.md`.

## Running locally in a cloud session
Node's fetch needs the proxy: `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npx next start`.
