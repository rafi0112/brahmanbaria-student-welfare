# BSWA — Brahmanbaria Student's Welfare Association, Jagannath University

Community platform for Brahmanbaria students at university. React + Vite frontend,
Go API, zero-cost hosting constraints. Full requirements: [jela_kollan_claude_project_context.md](jela_kollan_claude_project_context.md).

## Admin panel

The admin panel (`/admin`) is where the committee runs the community. Every change is saved to Supabase and shows on the
public site at once; the public pages list only published items. Light and dark themes, Bangla and English.

![Admin dashboard](docs/screenshots/admin-dashboard.png)

### What an admin can do

- **Dashboard:** counts of registered members, members awaiting approval, contact messages, published posts, places and images; a "needs attention" list (new messages, incomplete profiles, imported records awaiting review); charts of members by batch, department and upazila; the three latest activity entries; quick actions.
- **Quick search:** one search box over every admin page and record.
- **Messages:** the contact-form inbox (new / read), read and mark as read, delete. Messages are kept 30 days.
- **Students**
  - *Membership Requests:* approve or reject sign-ups, with complete and incomplete profile views. Removing a member needs a double confirmation.
  - *Membership Directory:* registered members (all / needs review / verified) and directory records for the batches still studying. Add, edit, delete and export records to CSV; save an email on a record, send or resend the activation link, verify or unverify it. Verified people get a verified mark everywhere.
  - *Alumni:* alumni records plus graduated students and members. A setting, **Alumni up to batch**, decides which batches count as alumni. Choosing a batch asks once and saves to Supabase, and the public Students and Alumni pages follow it (batch filters offer only the batches each page lists). Alumni records have the same email, invitation and verification steps as directory records.
- **Administration**
  - *Admin management:* search any member by any detail and make them an admin (double confirmation). There is no limit on the number of admins, all admins have the same abilities, and the last admin cannot leave the role.
  - *Executive Committee:* terms, seats and photos; the published term appears on `/committee`.
- **Content**
  - *Blog* and *Heritage places:* create, edit, publish, draft and archive.
  - *Events* and *FAQ:* full create, edit and delete.
  - *Upazilas & departments:* the reference lists used by registration and the filters.
  - *Gallery:* albums and images with upload progress, publish, hide and archive.
- **Activity:** an audit trail of admin actions (who changed what, and when).

| Alumni and the alumni batch setting | Membership Directory |
| --- | --- |
| ![Admin alumni](docs/screenshots/admin-alumni.png) | ![Membership Directory](docs/screenshots/admin-membership-directory.png) |

![Departments](docs/screenshots/admin-departments.png)

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
- **Supabase Auth mode (current):** when `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (frontend `.env`) and `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (backend `.env`) are set, sign-up, login, email confirmation and password reset go through Supabase Auth and the Go API verifies the bearer token. Turn **Confirm email** ON in Supabase. Roles (`member` / `admin`) live in the database. The first admin is created once with `go run . bootstrap-admin` (reads `ADMIN_EMAILS` from backend `.env`; the account must already be signed up and email-confirmed; preview by default, `--apply` to change). Later admins are promoted from `/admin` > Admin management. Approving a member never makes them an admin. Tables are locked with row level security (migration 003) so the public key cannot read them.
- **Executive committee:** admins manage terms, seats and photos in `/admin` > Executive Committee; the published panel appears on `/committee`. One-time photo storage setup (`go run . storage-setup`) and the manual test are in `docs/executive-committee.md`.
- **Admin panel:** `/admin` has a dashboard, admin management, the executive committee, students, heritage places, blog and gallery. Content is stored in PostgreSQL and the public site shows only published items. Setup (`go run . storage-setup`) and a manual test guide are in `docs/admin-manual-test.md`.
- In Supabase mode the built-in password endpoints (`/auth/register`, `/auth/login`, ...) answer 410 Gone, so Supabase is the only place passwords and confirmations live. Manual test steps: [docs/auth-manual-test.md](docs/auth-manual-test.md). Next step: [docs/google-oauth-setup.md](docs/google-oauth-setup.md).
- **Email:** Gmail SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`; an App Password) is what the project uses; `BREVO_API_KEY` and `MAIL_FROM` are an alternative. One of the two is required when `APP_ENV=production`. Sign-up, reset and invitation emails are sent by Supabase Auth; the backend sends the contact-form notification.
- **Deploying:** see [docs/deployment.md](docs/deployment.md) for the Cloudflare Pages and backend variables.
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
