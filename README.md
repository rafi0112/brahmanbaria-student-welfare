# BSWA — Brahmanbaria Student's Welfare Association, Jagannath University

Community platform for Brahmanbaria students at university. React + Vite frontend,
Go API, zero-cost hosting constraints. Full requirements: [jela_kollan_claude_project_context.md](jela_kollan_claude_project_context.md).

## Run locally (Windows)

Backend (port 8080):

```bash
cd backend
go run .
```

Frontend (port 5173, proxies `/api` to the backend):

```bash
cd frontend
npm install
npm run dev
```

Tests and build:

```bash
cd backend && go test ./...
cd frontend && npm run build
```

## Accounts (auth)

Copy `backend/.env.example` to `backend/.env` and fill it in (the file is git-ignored).

- **Local try-out without a database:** `AUTH_DEV_MEMORY=true`, plus optional `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters) to seed an admin. Accounts vanish on restart and emails are printed in the API log. Open the site at `http://localhost:5173` (the API only accepts that origin).
- **Real use:** set `DATABASE_URL` to the Supabase connection string (pooler, port 6543). Migrations run on start. Create the first admin once with `ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... go run . create-admin`.
- **Supabase Auth mode (current):** when `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (frontend `.env`) and `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (backend `.env`) are set, sign-up, login, email confirmation and password reset go through Supabase Auth and the Go API verifies the bearer token. Turn **Confirm email** ON in Supabase. Make someone an admin by listing their email in `ADMIN_EMAILS` (backend `.env`); they must sign up and confirm that email first. Tables are locked with row level security (migration 003) so the public key cannot read them.
- In Supabase mode the built-in password endpoints (`/auth/register`, `/auth/login`, ...) answer 410 Gone, so Supabase is the only place passwords and confirmations live. Manual test steps: [docs/auth-manual-test.md](docs/auth-manual-test.md). Next step: [docs/google-oauth-setup.md](docs/google-oauth-setup.md).
- **Email:** set `BREVO_API_KEY` and `MAIL_FROM` (a verified sender). Required when `APP_ENV=production`.
- **Different domains for site and API:** `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `CORS_ORIGIN` and `FRONTEND_URL` set to the site URL.
- Test the Postgres store against a throwaway database: `TEST_DATABASE_URL=postgres://... go test -run Postgres` (it drops the public schema).

## Data

Real exports live in `Data/` (git-ignored). Regenerate the API data and the map:

```bash
pip install openpyxl
python scripts/build_data.py
python scripts/build_map.py path/to/geoBoundaries-BGD-ADM3_simplified.geojson
```

Without `backend/data/students.json` the API serves synthetic sample students.

## Images

Photos come from Wikimedia Commons; author and licence for each are in
`frontend/src/data/images.json`. `images/download_images.py` fetches more with attribution.

## Credits

- Upazila boundaries: geoBoundaries (CC BY 4.0).
- Union names and population: Wikipedia (CC BY-SA), unverified.
- Photos: Wikimedia Commons contributors, see the gallery for each credit.
