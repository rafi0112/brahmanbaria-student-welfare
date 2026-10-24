# Deployment

The site is deployed as three separate services:

| Piece | Where | What it does |
| --- | --- | --- |
| Frontend (`frontend/`, React + Vite) | Cloudflare Pages | Serves static files only. There is no API on this host. |
| Backend (`backend/`, Go) | Render (web service) | Answers every `/api/v1/...` request and reads and writes Supabase Postgres. |
| Database and authentication | Supabase | PostgreSQL, Auth, and the email for sign-up, password reset and invitations. |

The browser calls the Go API for all data and Supabase Auth directly for sign-in, with the publishable key only.

## Email

- **Sign-up confirmation, password reset and invitation emails are sent by Supabase Auth** through the Gmail account configured in Supabase (Authentication → SMTP, with a Google App Password). Their HTML is in [email-templates/](email-templates/) and is pasted into Authentication → Email Templates. The Go backend never sees that password.
- **The Go backend sends one email itself:** the contact-form notification. It uses its own `SMTP_*` settings (same Gmail account and an App Password). If a host blocks outbound SMTP, the notification fails but the message is saved and shows in **Admin → Messages**.
- No other email provider is used.

## Backend: Render

Create a **Web Service** from the GitHub repository and set:

| Setting | Value |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `go build -o app .` |
| Start Command | `./app` |
| Health Check Path | `/api/v1/health` |
| Region | Closest to the Supabase project |

Render provides `PORT`; the API reads it (then `SERVER_PORT`, then 8080). Add the variables below under **Environment**. Values live only there, never in Git.

| Variable | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | Supabase pooler connection string |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Same project as the frontend |
| `SUPABASE_SECRET_KEY` | `sb_secret_...`, server only; enables invitations and member removal |
| `CORS_ORIGIN` | The exact frontend origin, for example `https://brahmanbaria-student-welfare.pages.dev` (one origin, no trailing slash) |
| `FRONTEND_URL` | Same origin; used for links in emails |
| `COOKIE_SECURE`, `COOKIE_SAMESITE` | `true` and `none`: the frontend and the API are on different sites |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `MAIL_FROM_NAME` | Gmail SMTP for the contact notification (required by the production start-up check) |
| `CONTACT_RECIPIENT_EMAIL` | Optional: where contact notifications go (default: the SMTP account) |

Optional: `ADMIN_EMAILS` (for the one-off `bootstrap-admin` command), `INVITE_*` limits, `INVITE_REDIRECT_URL`.

On start the API logs a line beginning `environment:` that lists which of these variables reached the process, with value lengths only, never the values. If a setting seems ignored, check that line first.

After a deploy, check that `https://<api-host>/api/v1/health` answers `{"status":"ok"}` and that `https://<api-host>/api/v1/stats` reports `"sample": false` with the real student and alumni counts.

## Frontend: Cloudflare Pages

Build settings: root directory `frontend`, build command `npm run build`, output directory `dist`.

Environment variables (Settings → Variables and Secrets), set for **Production** and, if you use preview deployments, for **Preview** too. Vite bakes them into the bundle at build time, so **every change needs a new deployment** (Deployments → Retry deployment, or push a commit).

| Variable | Value | Public |
| --- | --- | --- |
| `VITE_API_BASE` | The Render service origin, for example `https://<service>.onrender.com`. No trailing slash, no `/api/v1`. | Yes |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The publishable (`sb_publishable_...`) or anon key | Yes |
| `VITE_ENABLE_GOOGLE` | `true` only after Google sign-in is set up in Supabase, else `false` | Yes |

Never put `SUPABASE_SECRET_KEY`, a service-role key, `DATABASE_URL` or SMTP values in a `VITE_` variable: anything named `VITE_*` ships to every visitor.

On Cloudflare (`CF_PAGES=1`) the build stops with an error when `VITE_API_BASE` is missing or malformed. Without it, every `/api` request would reach Cloudflare, which answers with `index.html`, and no page would have data.

Page routes (`/students`, `/alumni`, ...) need no `_redirects` file: Cloudflare Pages serves `index.html` for unknown paths when the project has no `404.html`.

## Supabase Auth

Authentication → URL Configuration:

- **Site URL:** the Pages origin, for example `https://brahmanbaria-student-welfare.pages.dev`.
- **Redirect URLs:** add `https://<pages-origin>/**` so verification, password-reset and invitation links land on the site. Leave no `localhost` entry as the Site URL, or emails link to localhost.

Links in emails that were sent before the change keep their old address; send a new email to test.

## Order of a first deployment

1. Deploy the backend on Render and confirm `/api/v1/health` and `/api/v1/stats`.
2. Set the `VITE_*` variables on Cloudflare Pages (with `VITE_API_BASE` pointing at Render) and deploy the frontend.
3. Set `CORS_ORIGIN` and `FRONTEND_URL` on Render to the Pages origin if they are not set yet.
4. Set the Supabase Site URL and redirect URLs.
5. Open the live site and check Students, Alumni, Events, Committee and FAQ.
