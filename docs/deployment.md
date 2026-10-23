# Deployment

The site is two pieces that are deployed separately:

| Piece | Where | What it serves |
| --- | --- | --- |
| Frontend (`frontend/`, React + Vite) | Cloudflare Pages | Static files only. There is no API on this host. |
| Backend (`backend/`, Go) | Botkeep | Every `/api/v1/...` request. It reads Supabase Postgres and sends email over Gmail SMTP. |

The browser talks to Supabase Auth directly (sign in, sign up, password reset) with the publishable key. All data
(students, alumni, events, FAQ, committee, places, admin work) goes through the Go API.

## Frontend: Cloudflare Pages

Build settings: root directory `frontend`, build command `npm run build`, output directory `dist`.

Environment variables (Settings > Variables and Secrets), set for **Production** and, if you use preview
deployments, for **Preview** too. Vite bakes them into the bundle at build time, so **every change needs a new
deployment** (Deployments > Retry deployment, or push a commit).

| Variable | Value | Public? |
| --- | --- | --- |
| `VITE_API_BASE` | The Go API origin on Botkeep, e.g. `https://<your-api-host>`. No trailing slash, no `/api/v1`. | Yes |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The publishable (`sb_publishable_...`) or anon key | Yes |
| `VITE_ENABLE_GOOGLE` | `true` only after Google sign-in is set up in Supabase, else `false` | Yes |

Never put `SUPABASE_SECRET_KEY`, a service-role key, `DATABASE_URL` or SMTP values in a `VITE_` variable: anything
named `VITE_*` ships to every visitor.

On Cloudflare (`CF_PAGES=1`) the build stops with an error when `VITE_API_BASE` is missing or malformed. Without
it every `/api` request reached Cloudflare, which answered with `index.html`, and no page had data.

Page routes (`/students`, `/alumni`, ...) need no `_redirects` file: Cloudflare Pages serves `index.html` for unknown
paths when the project has no `404.html`.

## Backend: Botkeep

Set these on Botkeep for production (names from `backend/.env.example`; values stay in Botkeep, never in Git):

| Variable | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `CORS_ORIGIN` | The exact frontend origin, e.g. `https://brahmanbaria-student-welfare.pages.dev` (one origin, no trailing slash) |
| `FRONTEND_URL` | Same origin; used for links in emails |
| `DATABASE_URL` | Supabase pooler connection string (port 6543) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Same project as the frontend |
| `SUPABASE_SECRET_KEY` | `sb_secret_...`, server only; enables invitations and member removal |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `MAIL_FROM_NAME` | Gmail SMTP (App Password) |
| `CONTACT_RECIPIENT_EMAIL` | Where contact-form messages go |
| `COOKIE_SECURE`, `COOKIE_SAMESITE` | `true` and `none`: the frontend and API are on different sites |

Optional: `ADMIN_EMAILS`, `INVITE_*` limits, `INVITE_REDIRECT_URL`. Botkeep's `SERVER_PORT` is picked up automatically.

Check it after deploying: `https://<your-api-host>/api/v1/health` must answer JSON, and
`https://<your-api-host>/api/v1/students` must list students.

## Supabase Auth

Authentication > URL Configuration: Site URL = the Pages origin; add `https://<pages-origin>/**` to the redirect URLs
so verification and password-reset links land on the site.
