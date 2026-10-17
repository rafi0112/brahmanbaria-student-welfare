# Jela Kollan for University --- Project Context & Product Specification

> **Concrete identity (resolved, Oct 2026):** জবিস্থ ব্রাহ্মণবাড়িয়া জেলা
> ছাত্রকল্যাণ সমিতি — Brahmanbaria district students' welfare community at
> **Jagannath University (JnU), Dhaka**. Geographic scope for directory and
> history pages = **Brahmanbaria district only** (9 upazilas), not all of
> Bangladesh. **Brand: BSWA** — Brahmanbaria Student's Welfare Association
> of Jagannath University (logo in `frontend/public/logo-*.webp`). Nav and
> footer follow the committee's wording: Home, About, Students, Events,
> Alumni, Committee, Gallery, FAQ, Contact; footer Explore / Members /
> Contact. Do not reuse "Titas" (the DU association's brand). The district
> features (map directory, heritage, blog) stay reachable from the Home page.
>
> **UI:** full bilingual UI (বাংলা default + English toggle) and
> light/dark theme (follows system, user can override).
>
> **Design source of truth:** the three mockup PNGs in `design/`
> (cream paper + forest green, serif headings, slightly irregular photo
> frames, hand-drawn line art, wavy section dividers, pill header).
> **Workflow:** design by Claude Opus 5.5; implementation by Claude
> Sonnet 5.5. Data lives in `Data/` (private, git-ignored); image tooling
> in `images/`. See §13–§18 at the bottom.

**Purpose:** This file is the authoritative project context for Claude.
Read it before proposing architecture, generating code, or changing
requirements.

**Project name:** Jela Kollan for University\
**Primary audience:** University students, alumni/community members, and
administrators\
**Current stage:** Planning and implementation preparation\
**Budget constraint:** Strictly ৳0. No payment card, paid plan, paid VM,
or cloud billing account can be used. Do not recommend services that
require a billing account/card for the core deployment.\
**Main engineering goal:** Build a useful, secure, responsive,
maintainable web application using the minimum necessary technologies.
Avoid unnecessary complexity.

------------------------------------------------------------------------

## 1. Product vision

Jela Kollan for University is a community and information platform for
university students, with a focus on student information,
district/local-area knowledge, public information, and useful community
resources.

It should look and feel like a modern, trustworthy, mobile-friendly
university community website. It is not merely a static brochure
website: it includes user registration/login, protected areas,
admin-managed content, student directory information, and informational
directories such as Upazila/Union Parishad and historical places.

The platform should initially support around **25 batches × 30 students
= approximately 750 student records**. It may grow later. Do not design
around 750 as a hard maximum.

### Product principles

-   Mobile-first, responsive, accessible UI.
-   Simple navigation and clear information architecture.
-   Fast perceived performance and sensible API/database queries.
-   Security and privacy by default, especially for student information.
-   Admin-managed content with validation and moderation.
-   Build only features that have a clear purpose.
-   Prefer a modular monolith over microservices.
-   Do not claim that a technology guarantees speed or uptime; measure
    performance.
-   Do not invent official data, historical facts, addresses, or
    statistics. Provide a verified-data workflow.

------------------------------------------------------------------------

## 2. Agreed technology and hosting constraints

### Proposed minimal stack

-   **Frontend:** React + Vite. JavaScript is acceptable and keeps the
    initial stack simple. TypeScript may be adopted if the
    implementation team prefers stronger type checking, but it is not
    required for runtime performance.
-   **Backend:** Go (Golang), as a single API service.
-   **Database:** PostgreSQL.
-   **Frontend hosting:** Cloudflare Pages Free, to be implemented when
    ready.
-   **Potential Go backend hosting:** Abasthan Free was discussed as a
    candidate because the user cannot use any billing account or payment
    card. Its current availability, terms, resource limits, sleep
    behavior, and reliability must be verified before relying on it for
    production.
-   **Potential managed PostgreSQL:** Supabase Free. Verify current
    terms and inactivity/pause policy before choosing it.
-   **Transactional email:** Brevo Free is a candidate for registration
    verification and password-reset emails. Verify current free quota,
    sender/domain verification requirements, and account eligibility.
-   **Bot protection:** Cloudflare Turnstile Free may be added to public
    forms. It must be verified server-side by the Go backend.
-   **Repository:** GitHub.
-   **Docker Compose:** Not required for the proposed managed-hosting
    path. Add it only if it solves a real local development/deployment
    need.
-   **Cloudflare Workers, R2, D1, Redis, Kubernetes, queues,
    microservices, paid databases, and paid services:** Do not add
    unless a concrete requirement justifies them and they fit the
    zero-cost/no-billing constraint.

### Hard hosting rules

1.  **No payment card and no cloud billing account can be used anywhere
    in the project.**
2.  Do not use Google Cloud Run or any service that requires enabling a
    billing account for the chosen workflow.
3.  Do not use Oracle Cloud as the user explicitly excluded it.
4.  Render Free was rejected because idle spin-down/cold-start delays
    conflict with the desired user experience.
5.  Free-tier limits and provider policies can change. Before finalizing
    deployment, verify current official documentation and distinguish
    verified facts from assumptions.
6.  No free service can be assumed to guarantee permanent uptime, zero
    cold starts, unlimited resources, or zero cost under all conditions.
7.  If no suitable no-card, no-billing backend host can be verified,
    explain the trade-off honestly. Do not silently substitute a paid
    service.
8.  Keep the app deployable with a normal Go HTTP server and environment
    variables so the hosting provider can be changed later.

### Performance target

Initial target: comfortably support around 30 concurrent users with a
reasonable workload, then benchmark and optimize. This is a target to
test, not a guarantee. Track latency, errors, memory usage, database
connection counts, and API performance under load.

------------------------------------------------------------------------

## 3. Site map / main navigation

Public navigation should include:

1.  **Home**
2.  **About Us**
3.  **Students**
4.  **Upazila & Union Parishad Directory**
5.  **Historical Places**
6.  **Blog / News**
7.  **Gallery**
8.  **Contact Us**
9.  **Register**
10. **Login**

After login, show the appropriate account/dashboard menu. Admin
navigation must be distinct from student navigation. Avoid showing admin
links to ordinary users.

### Suggested routes

Use clean, readable URLs. Example routes (adjust if needed): - `/` -
`/about` - `/students` - `/students/:studentSlugOrId` -
`/local-directory` - `/local-directory/upazilas/:upazilaSlug` -
`/local-directory/unions/:unionSlug` - `/historical-places` -
`/historical-places/:slug` - `/blog` - `/blog/:slug` - `/gallery` -
`/contact` - `/register` - `/login` - `/forgot-password` -
`/reset-password` - `/verify-email` - `/dashboard` -
`/dashboard/profile` - `/admin` - `/admin/students` - `/admin/batches` -
`/admin/blog` - `/admin/gallery` - `/admin/local-directory` -
`/admin/historical-places` - `/admin/contact-messages` - `/admin/users`

Routes are proposals; ensure all links are implemented and no dead
navigation is left behind.

------------------------------------------------------------------------

## 4. Feature requirements

### 4.1 Home page

-   Clear identity and purpose of Jela Kollan for University.
-   Hero section with a concise headline, description, and primary
    actions.
-   Quick links to Students, Upazila/Union Parishad Directory,
    Historical Places, Blog, and Gallery.
-   Latest blog/news cards.
-   Featured historical places or local information (only if content is
    verified).
-   Student/batch summary only if the data is real and approved for
    public display.
-   Footer with contact details, useful links, privacy policy, and
    terms.
-   Mobile-responsive layout and accessible navigation.

### 4.2 About Us

-   Mission, vision, project background, and community purpose.
-   Content should be editable by authorized admins if practical.
-   Do not invent institutional affiliations or claim official
    university endorsement unless explicitly verified.

### 4.3 Students directory

-   Search by approved fields (e.g., name, batch, department, student ID
    only if safe and intended).
-   Filters: batch and department/program if applicable.
-   Pagination; do not return all student records in one API request.
-   Student profile pages only expose fields explicitly approved for
    public viewing.
-   Admin can create, update, deactivate, and correct student records.
-   Import/export (e.g., CSV) can be a later admin feature, with
    validation and permission checks.
-   Do not expose private phone numbers, email addresses, addresses,
    dates of birth, credentials, or other sensitive information publicly
    by default.
-   If a student does not consent to public listing, support
    hiding/deactivating the public profile.
-   Use a stable internal ID; do not rely on names as unique
    identifiers.

### 4.4 Batch management

-   One `batches` record per batch; do not create a separate database
    table for each batch.
-   Initial estimate: 25 batches and 750 students.
-   Admin can manage batch name/number, year range or session, and
    status.
-   Each student links to a batch through `batch_id`.
-   Validate duplicate student records using an appropriate unique field
    where one exists.

### 4.5 Upazila & Union Parishad Directory (requested feature)

Create a dedicated public page for a structured Bangladesh local-area
directory.

Suggested functionality: - Search and filter by division, district,
upazila, and Union Parishad. - Hierarchical browsing: Division →
District → Upazila → Union Parishad. - Upazila detail page with verified
name, parent district, relevant official contact/location fields if
available, and list of unions under it. - Union Parishad detail page
with verified name and parent upazila/district. - Optional fields:
official website, office address, phone/contact, map coordinates, source
URL, last-verified date. - Only show fields that have reliable sources.
Missing fields should be marked unavailable rather than guessed. -
Provide source attribution and a "last verified" date for factual
records. - Admin can add/edit/archive records and correct mistakes. - If
a large dataset is imported, validate relationships, duplicate names,
spelling variants, and parent IDs. - Search should support Bangla and
English names where feasible; consider stored alternate
spellings/transliterations. - Do not create a map feature unless there
is reliable location data and a clear benefit; it is optional. - Do not
scrape websites in a way that violates terms or overloads public
services. - Do not imply the directory is an official government source
unless formally authorized.

### 4.6 Historical Places (requested feature)

Create a dedicated public page to discover historical, cultural, and
heritage places relevant to the project's geographic scope.

Suggested functionality: - Search/filter by district, upazila, place
category, and keyword. - Cards with place name, short description,
location, and image (if rights/permission allow). - Detail page with
history/background, significance, visiting information only when
verified, location/map link where reliable, image credits, source links,
and last-verified date. - Possible categories: archaeological site,
monument, historic building, museum, memorial, religious heritage site,
cultural site, natural heritage site. Categories are only labels;
content must be evidence-based and respectful. - Admin can
add/edit/archive place entries. - Include citation/source URL for
historical claims. Do not invent dates, founders, events, opening hours,
entrance fees, or travel information. - If reliable information is not
available, leave the field empty or label it "Information not
verified." - Images must be owned, licensed, public-domain, or otherwise
permitted; keep attribution/license details where relevant. - Optional
later enhancement: map view or "places near this location," only if
coordinates are accurate.

### 4.7 Blog / News

-   Public list, detail page, categories/tags, publication date,
    author/editor display if appropriate.
-   Admin/editor can draft, preview, publish, unpublish, and edit posts.
-   Use pagination and optimized image sizes.
-   Sanitize rich text or use a safe Markdown/content strategy.
-   Do not add automatic scraping unless explicitly requested and
    properly sourced.

### 4.8 Gallery

-   Grid/gallery view with captions and optional category.
-   Image upload/storage strategy must be decided based on the actual
    free hosting/storage limits. Do not assume Cloudflare Pages stores
    uploaded files.
-   If images are externally hosted, store their URLs and attribution;
    validate URL and allowed content.
-   Admin-only upload/management or an approved storage provider.
-   Do not store binary image files directly in PostgreSQL; store
    metadata and URLs unless there is a specific reason.

### 4.9 Contact Us

-   Contact form: name, email, subject, message; collect only necessary
    data.
-   Validate on both frontend and backend.
-   Add rate limiting and optional Turnstile verification.
-   Store messages in database and allow admins to view/archive them.
-   Optionally send a notification email through the transactional email
    provider, if available within free limits.
-   Do not reveal internal admin email addresses or server secrets in
    frontend code.

### 4.10 Registration, login, and account security

-   Registration, login, logout.
-   Email verification via Brevo (or another verified free transactional
    email service).
-   Forgot-password and password-reset email.
-   Secure password hashing (Argon2id preferred, bcrypt acceptable if
    justified).
-   Use cryptographically secure, single-use, expiring
    verification/reset tokens. Store token hashes, not raw tokens.
-   Do not disclose whether an email address exists in login/reset
    responses.
-   Server-side authorization on every protected API endpoint; hiding a
    frontend button is not security.
-   Prefer secure `HttpOnly`, `Secure`, appropriately configured
    `SameSite` cookies for browser sessions. Protect state-changing
    requests against CSRF if cookie-based authentication is used.
-   Set login, registration, contact form, and token endpoints rate
    limits.
-   Keep email/API credentials in backend environment variables, never
    in React source or public build variables.
-   Provide logout/session invalidation and appropriate session expiry.
-   Do not store plaintext passwords or reset tokens.
-   Do not add Google/Facebook OAuth unless specifically requested and
    the provider setup can be completed without a paid plan/billing
    account.

### 4.11 Roles and permissions

Minimum roles: - **Guest:** browse public content and submit contact
form. - **Student:** manage own allowed profile data and use any
approved student-only features. - **Admin:** manage student/batch data,
blog, gallery, directory entries, historical places, users/roles, and
contact messages.

Optional later roles: - Editor: blog/gallery/content management without
full user administration. - Directory editor: manage Upazila/Union
Parishad and historical place data only.

Use least privilege. Seed the first admin securely through a controlled
setup process; never ship a hardcoded default admin password.

### 4.12 Future features (not required for first release)

Consider only after the core app is stable: - Student-to-student
messaging or group chat. - Announcements and notifications. -
Events/calendar. - Alumni directory. - Scholarships, jobs, internships,
and opportunities. - Blood donor or emergency assistance directory, with
strong consent/privacy controls. - Feedback/reporting system. - CSV bulk
import/export for admins. - Analytics dashboard. - Progressive Web
App/offline support.

Do not implement every future feature in the MVP. Prioritize based on
user value and available time.

------------------------------------------------------------------------

## 5. Suggested database schema

Use PostgreSQL with migrations and foreign keys. Suggested core tables:

### `users`

-   `id` (UUID primary key)
-   `email` (normalized; unique)
-   `password_hash`
-   `role` (student/admin; expand only if needed)
-   `email_verified_at` (nullable timestamp)
-   `status` (active/pending/suspended)
-   `created_at`, `updated_at`

### `batches`

-   `id` (primary key)
-   `name` or `batch_number` (unique)
-   `session_start`, `session_end` (optional)
-   `status`
-   timestamps

### `students`

-   `id` (UUID primary key)
-   `user_id` (nullable/unique foreign key if student login is optional)
-   `batch_id` (foreign key)
-   `full_name`
-   `department` (optional)
-   `student_identifier` (optional; unique only if valid and available)
-   `public_bio` (optional)
-   `profile_image_url` (optional)
-   `is_public`
-   timestamps

### `blog_posts`

-   `id`, `title`, `slug` (unique), `summary`, `content`, `status`,
    `author_user_id`, `published_at`, timestamps

### `gallery_items`

-   `id`, `title`, `caption`, `image_url`, `image_alt`,
    `source_or_credit`, `status`, `created_by`, timestamps

### `contact_messages`

-   `id`, `name`, `email`, `subject`, `message`, `status`, `created_at`

### `email_verification_tokens`

-   `id`, `user_id`, `token_hash`, `expires_at`, `used_at`, `created_at`

### `password_reset_tokens`

-   `id`, `user_id`, `token_hash`, `expires_at`, `used_at`, `created_at`

### `divisions`

-   `id`, `name_en`, `name_bn`, `slug`, `source_url`, `last_verified_at`

### `districts`

-   `id`, `division_id`, `name_en`, `name_bn`, `slug`, `source_url`,
    `last_verified_at`

### `upazilas`

-   `id`, `district_id`, `name_en`, `name_bn`, `slug`, optional verified
    official contact/location fields, `source_url`, `last_verified_at`

### `union_parishads`

-   `id`, `upazila_id`, `name_en`, `name_bn`, `slug`, optional verified
    official contact/location fields, `source_url`, `last_verified_at`

### `historical_places`

-   `id`, `name_en`, `name_bn`, `slug`, `district_id` (nullable),
    `upazila_id` (nullable), `category`, `short_description`,
    `historical_details`, `address_or_location` (verified),
    `latitude`/`longitude` (nullable), `image_url` (nullable),
    `image_credit`, `source_url`, `last_verified_at`, `status`,
    timestamps

Schema is a starting point, not a command to create every field
immediately. Review requirements and normalize data before migrations.
Add indexes for common filters/searches and foreign keys. Do not store
unnecessary personal information.

------------------------------------------------------------------------

## 6. API design principles

Use a versioned REST API, e.g. `/api/v1/...`.

Potential endpoint groups: - `/api/v1/auth/register` -
`/api/v1/auth/login` - `/api/v1/auth/logout` -
`/api/v1/auth/verify-email` - `/api/v1/auth/forgot-password` -
`/api/v1/auth/reset-password` - `/api/v1/students` - `/api/v1/batches` -
`/api/v1/blog` - `/api/v1/gallery` - `/api/v1/contact` -
`/api/v1/divisions` - `/api/v1/districts` - `/api/v1/upazilas` -
`/api/v1/unions` - `/api/v1/historical-places` - `/api/v1/admin/...`

Use pagination, filtering, validation, consistent error responses,
request timeouts, structured logs, and database connection pooling.
Public endpoints must not expose secrets or private student fields.
Admin endpoints must enforce server-side role checks.

Do not build a generic, overengineered API framework. Keep handlers,
business logic, and data access organized but simple.

------------------------------------------------------------------------

## 7. Suggested project folder structure

``` text
B-Baria/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── students/
│   │   │   ├── batches/
│   │   │   ├── local-directory/
│   │   │   ├── historical-places/
│   │   │   ├── blog/
│   │   │   ├── gallery/
│   │   │   └── admin/
│   │   ├── lib/
│   │   └── styles/
│   ├── .env.example
│   └── package.json
├── backend/
│   ├── cmd/
│   │   └── api/
│   │       └── main.go
│   ├── internal/
│   │   ├── auth/
│   │   ├── students/
│   │   ├── batches/
│   │   ├── blog/
│   │   ├── gallery/
│   │   ├── contact/
│   │   ├── localdirectory/
│   │   ├── historicalplaces/
│   │   ├── database/
│   │   ├── middleware/
│   │   ├── email/
│   │   └── config/
│   ├── migrations/
│   ├── .env.example
│   ├── go.mod
│   └── Dockerfile
├── docs/
│   ├── architecture.md
│   ├── database-schema.md
│   ├── api-spec.md
│   ├── deployment.md
│   └── security.md
└── README.md
```

The `Dockerfile` is optional for a source-based host but useful if the
selected provider requires container deployment. Docker Compose is not
mandatory.

------------------------------------------------------------------------

## 8. UI/UX requirements

-   Mobile-first,desktop, clean, modern, consistent visual design.
-   Accessible contrast, keyboard navigation, focus states, labels, and
    meaningful image alt text.
-   Responsive header/navigation and footer.
-   Loading, empty, error, success, and unauthorized states for all
    data-driven pages.
-   Search/filter/pagination where lists can grow.
-   Avoid huge all-in-one components; use reusable components.
-   Keep forms understandable and show validation errors clearly.
-   Bangla and English names should be supported for local directory
    content. **Full bilingual UI is requested** (বাংলা default, English
    toggle). Keep UI strings in two flat JSON dictionaries
    (`bn.json`, `en.json`) — no i18n framework needed beyond a tiny hook.
-   Light/dark theme via CSS variables + `data-theme` on `<html>`;
    respect `prefers-color-scheme` and `prefers-reduced-motion`.
-   Optimize images and lazy-load below-the-fold content.
-   Never render user-provided HTML unsafely.

------------------------------------------------------------------------

## 9. Data quality and content policy for local directory/history

-   Use reliable, traceable sources for official administrative names
    and historical claims.
-   Store a source URL and last-verified date for directory/historical
    data.
-   Make it possible for admins to correct records.
-   Do not fabricate a complete list, contacts, historical facts,
    coordinates, or visiting details.
-   If dataset import is needed, first identify an authoritative source
    and document its license/terms.
-   Use a data import script with validation, duplicate detection, and a
    preview/dry-run mode.
-   Show "Not verified" or omit unavailable details instead of guessing.
-   Keep image rights/credits with each image.

------------------------------------------------------------------------

## 10. Testing and release criteria

Before calling the MVP ready: - Frontend builds successfully. - Go tests
pass; validation and authorization are tested. - Database migrations can
run on a clean database. - Registration, email verification, login,
logout, forgot password, and reset password work end-to-end. -
Expired/used tokens are rejected. - Students cannot access admin
endpoints. - Private student data is not exposed in public API
responses. - Search, filtering, and pagination work. - Upazila/Union
records preserve correct parent-child relationships. - Historical place
entries include source/verification metadata. - Contact form has
server-side validation and abuse protection. - Secrets are not committed
to Git. - HTTPS and CORS/cookie settings are correct for the actual
deployed domains. - Database backup and restore procedure is
documented. - Load test is run with 30 concurrent users; record p50/p95
latency, error rate, and resource use. - Free-tier quota and host
reliability are tested, not assumed.

------------------------------------------------------------------------

## 11. Implementation roadmap

### Phase 0 --- Clarify and validate

-   ~~Confirm geographic scope~~ → **Resolved:** Brahmanbaria district,
    JnU students. Directory = 9 upazilas + their unions.
-   Confirm student data fields and which fields can be public (see §14
    for the proposed public/private split based on the existing Google
    Form sheets).
-   Verify no-card/no-billing hosting providers and free-tier policies.
-   Select verified source datasets for administrative divisions and
    historical places.

### Phase 1 --- Foundation

-   Create repository and React/Go structure.
-   Establish API configuration, PostgreSQL migrations, health endpoint,
    CORS, logging, and environment variables.
-   Add CI checks and `.env.example` files.

### Phase 2 --- Authentication and roles

-   Register/login/logout, secure password hashing, email verification,
    password reset, sessions, rate limiting, and role checks.

### Phase 3 --- Core pages

-   Home, About, Students, batches, Blog, Gallery, Contact Us.
-   Admin dashboard for managing content and student records.

### Phase 4 --- Local information

-   Upazila/Union Parishad directory.
-   Historical places pages with source attribution and admin
    management.
-   Import verified data only after review.

### Phase 5 --- Deploy and validate

-   Deploy frontend to Cloudflare Pages when ready.
-   Deploy Go backend to a verified no-card/no-billing host.
-   Connect PostgreSQL and transactional email.
-   Test security, backups, email delivery, mobile UX, and 30-user
    concurrency.
-   Document provider limits and a recovery/migration plan.

### Phase 6 --- Optional enhancements

Only after the MVP is stable: real-time chat, notifications, events,
opportunities, alumni features, map view, PWA, and analytics.

------------------------------------------------------------------------

## 12. Instructions to Claude

When working on this project:

1.  Treat this file as the current project context and constraints.
2.  Do not start by generating the entire application in one huge
    response.
3.  First summarize requirements, assumptions, unresolved questions, and
    proposed MVP scope.
4.  Identify any ambiguity---especially geographic scope, student
    privacy, and verified data sources---and ask only essential
    questions.
5.  Propose the architecture and database schema before implementing;
    wait for approval if the user requests a staged workflow.
6.  Never invent official data, sources, email limits, hosting policies,
    test results, or successful deployments.
7.  Verify current official hosting/free-tier documentation before
    finalizing deployment steps. Do not suggest any service requiring
    payment card or cloud billing account.
8.  Keep the architecture minimal. Do not add Docker Compose, Redis,
    Kubernetes, microservices, or extra databases without a demonstrated
    need.
9.  Build incrementally, provide complete file contents when asked, and
    include exact commands for Windows where relevant.
10. Keep secrets out of source code; provide `.env.example` with
    placeholder values only.
11. Explain trade-offs in plain language and distinguish "implemented,"
    "tested," and "planned."
12. Prioritize security, data privacy, maintainability, and actual
    performance measurements over technology hype.

**Current priority:** produce a reviewable MVP plan and database/API
design for Jela Kollan for University, including the Upazila/Union
Parishad Directory and Historical Places pages, while preserving the
strict no-card/no-billing/zero-budget constraint.

------------------------------------------------------------------------

## 13. Real data already collected (Google Form exports in repo root)

These files are **private source data**. Never commit them to a public
repo; add them to `.gitignore` (`*.xlsx`, `*.zip`, `*.pdf` in the root).

| File | Rows describe | Fields |
|---|---|---|
| `জবিস্থ ব্রাহ্মণবাড়িয়া ... (Responses).xlsx` | current students (all batches) | Batch, Name (EN), Permanent address (village, upazila), Mobile, Department, Academic session, Blood group, Picture (Drive link), Email, Facebook link, Present address |
| `21 batch ... (Responses).xlsx` | 21st batch | Name, Mobile, Blood group, Department, Batch, School, College, Upazila & village, Facebook, Photo, Present (mess) address, "financial / non-financial problems" |
| `alumni association.xlsx` | alumni | Name, Batch, Department, Occupation, Work place, Designation, Blood group, Phone, Photo, Village & upazila, Current location, Email |
| `*batch*.zip`, `1 to 15 Batch.pdf`, `16 to 21 Batch.pdf` | batch photos / printed lists | images, scanned lists |

Implications:
- Batches are numbered (1st … 21st+ at JnU). Seed `batches` from these.
- Add `alumni_profiles` (occupation, workplace, designation, current_city)
  linked to `students` — an alumnus is a student whose status = alumni.
- Add `home_upazila_id` (FK → `upazilas`) to students, parsed from the
  free-text address during import (admin reviews ambiguous rows).
- Photos are Google Drive links → import script downloads, converts to
  WebP (≈400px), uploads to the chosen storage, stores the URL.
- The "financial problems" column is **highly sensitive**: it must never
  appear in the directory. It belongs to the private Welfare module (§15).

## 14. Privacy split for student data (proposal — committee must approve)

| Field | Public (guest) | Logged-in verified member | Admin |
|---|---|---|---|
| Name, photo, batch, department, session, home upazila | ✅ (if `is_public`) | ✅ | ✅ |
| School / college | ❌ | ✅ | ✅ |
| Blood group | ❌ (aggregate counts only) | ✅ via Blood Finder, only if donor opted in | ✅ |
| Mobile number | ❌ | ❌ by default; opt-in | ✅ |
| Email, Facebook link | ❌ | opt-in per field | ✅ |
| Present address / mess location | ❌ | area only (e.g. "Sutrapur"), opt-in | ✅ |
| Financial / welfare notes | ❌ | ❌ | welfare admins only |
| Alumni workplace & designation | ✅ (opt-in) | ✅ | ✅ |

Store per-field visibility as plain booleans on the student row
(`show_phone`, `show_email`, `show_facebook`, …) — no generic ACL system.

## 15. Feature plan (what to build first vs. later)

### 15.1 MVP (Release 1) — small and solid
1. **Home** — hero, live stats (members / batches / upazilas / alumni,
   computed from DB), notice ticker, upcoming events, latest news,
   upazila map teaser, gallery strip.
2. **Bilingual UI + light/dark theme.**
3. **Auth** — register (= member application), email verify, login,
   reset password. New registrations stay `pending` until an admin
   approves (replaces the Google Form workflow).
4. **Members directory** — search, filter by batch / department /
   upazila, paginated cards, privacy rules from §14.
5. **Batches** — one page per batch: members + batch photo album.
6. **Alumni directory** — filter by profession / city; "open to mentor"
   badge.
7. **Blood Donor Finder** — filter by blood group (+ upazila / current
   area); donors opt in, toggle "available", set last donation date
   (auto-hidden for 90 days after donating). Contact shown only to
   logged-in verified members. *Blood group is already collected in
   every form — highest value-per-effort feature.*
8. **Notices & Events** — admin posts; event page with date, venue,
   RSVP (logged-in), add-to-calendar (.ics generated in the browser).
9. **Brahmanbaria Explorer** — interactive SVG map of the 9 upazilas →
   upazila page (unions list, member count only, historical places
   there). Replaces the generic all-Bangladesh directory.
10. **Historical Places** — cards + detail, source & "last verified".
11. **Blog / News, Gallery, About (committee + history), Contact.**
12. **Admin panel** — approve members, CRUD for all content, CSV import
    with dry-run preview, contact inbox.

### 15.2 Release 2 — community features that make it unique
- **Fresher Desk (নবীন সহায়তা)** — admission-season guide for students
  from Brahmanbaria coming to JnU: checklist, FAQ, "ask a senior" form
  routed to volunteers by department.
- **Senior–junior mentor match** — pick department → see opted-in
  seniors/alumni of the same department.
- **Mess & seat board** — members post vacant mess seats near JnU
  (area, rent range, gender, member-only contact). Auto-expire in 30 days.
- **Welfare request (কল্যাণ সহায়তা)** — confidential form, visible only
  to welfare admins, with status tracking. Replaces the "financial
  problems" form column.
- **Digital member card** — profile renders a card with a QR linking to
  `/verify/:memberCode` (name, batch, status only). No paid service.
- **Opportunities board** — jobs / internships / tuition posted by
  alumni and admins, with expiry date.
- **Achievements wall** — results, awards, job placements
  (member-submitted, admin-approved).
- **Eid travel buddy (বাড়ি ফেরা)** — members travelling home on the same
  date find each other (Dhaka ↔ B.Baria). Seasonal.

### 15.3 Later / only if needed
- PWA install + offline cache of notices and the directory shell.
- Web push notifications (free VAPID keys, no paid service).
- Resource / notes sharing by department (links only, no file hosting).
- Election module, polls. Real-time chat is explicitly **not** planned.

### 15.4 Deliberately NOT used
Microservices, Redis, WebSockets, a CMS framework, Next.js/SSR, UI kits,
animation libraries, map API keys (the upazila map is a static inline
SVG), paid image CDNs.

## 16. Design direction (Opus 5.5 design → Sonnet 5.5 implementation)

Source of truth: the three mockups in `design/` (Community UI Showcase,
Heritage UI Showcase, Complete Community UI Kit). The frontend follows
them; every section is its own route/page (no single long page).

- **Look:** warm paper background, deep forest-green, leaf green and a
  gold accent; full-bleed hero photo with a curved wave into the page;
  a pill-shaped header; dark forest feature bands; dark mode that keeps
  the same layout.
- **Images (user preference):** *slightly* irregular photo frames
  (`--s-a/b/c`, one organic blob for the hero) plus a hand-drawn offset
  outline (SVG `feTurbulence` filter, `#rough`) and line-art sketches
  (leaves, monument, students, paper plane). Keep it subtle — not
  cartoonish. Only real Brahmanbaria photos from Wikimedia Commons, each
  with author + license shown.
- **Type:** Playfair Display + Noto Serif Bengali (headings), Inter +
  Hind Siliguri (body), self-hosted through `@fontsource`.
- **Map:** inline SVG built from real geoBoundaries upazila polygons
  (CC BY 4.0) — no tile server, no API key. Click/Enter selects an
  upazila; arrow keys move between upazilas; pins mark heritage places.
- **Motion:** hover lift only; everything respects
  `prefers-reduced-motion`.
- **Stack:** React 18 + Vite + React Router + plain CSS with variables.
  No UI kit, no animation library.
- **Accessibility:** visible focus rings, keyboard-reachable map,
  labelled form fields, skip link, `aria-live` result counts.

## 17. Hosting & storage — zero-card checklist (verify before deploy)

| Need | Candidate (no card) | Status |
|---|---|---|
| Frontend | Cloudflare Pages Free | verify at deploy time |
| Go API | Abasthan Free (as discussed); keep a portable `Dockerfile` | **unverified** — test cold start & limits |
| PostgreSQL | Supabase Free | verify pause-on-inactivity policy |
| Images | Supabase Storage (same project, no extra service) | verify current free quota |
| Email | Brevo Free | verify daily quota & sender verification |
| Bot protection | Cloudflare Turnstile | verify server-side |

If a provider fails verification, record it here and pick the next
no-card option — never silently add a paid service.

## 18. Implementation status (update on every milestone)

Layout: `frontend/` (React + Vite), `backend/` (Go, standard library only),
`scripts/` (data + map builders), `Data/` (private exports), `images/`
(Commons downloader), `design/` (mockups).

**Implemented and checked** (Go tests pass; frontend builds; pages
checked in the browser at desktop and phone width):
- Pages, each its own route: Home, About, Students (+ public profile),
  Directory (interactive map) + Upazila page, Heritage + detail, Blog +
  article, Gallery with lightbox, Contact, Login, Register, Forgot /
  Reset password, Verify email, Dashboard, Admin, 404.
- Bangla/English toggle, light/dark theme, loading / empty / error states.
- Go API `/api/v1`: health, stats, students (search, batch, department,
  upazila filters, pagination, profile), alumni, upazilas, heritage,
  blog, contact (validation, honeypot, rate limit, JSONL store).
- Real data: 138 students and 107 alumni imported from `Data/*.xlsx` by
  `scripts/build_data.py`. Only name, batch, department, session and home
  upazila are exposed; phone, email, Facebook, address, school/college,
  blood group and the welfare column are never served. Blood group is
  kept only as aggregate counts. If the real JSON is absent the API
  serves synthetic `*.sample.json`.
- Map: 9 real upazila polygons (geoBoundaries) + heritage pins.
- 19 licensed Commons photos with author/licence metadata
  (`frontend/src/data/images.json`).
- Visual refresh to match `design/` and `Jela_Kollan_Design_Assets`: floating
  pill nav, hero with the Titas boat-race photo (Commons, CC BY-SA 4.0),
  organic blob photo, wavy edges, rounded banner heroes on inner pages,
  glass quick-access cards, photo collage section, student sketch card,
  botanical line art on the page background, near-black green dark theme
  with a soft glow. Line-art pieces in `frontend/public/art/` were cut from
  the provided concept sheet (checkerboard removed with a colour key); they
  are AI-generated concept art from the asset pack, not licensed artwork,
  so confirm usage rights before launch. The mockups' hero photo is an
  AI mockup image and cannot be reused; the real boat-race photo replaces it.

**Not done / needs a decision:**
- Auth is UI only (validation and flow screens). Registration, email
  verification, sessions and roles need PostgreSQL + Brevo and are the
  next backend milestone. Dashboard and Admin show preview data.
- Union parishad names are the committee-supplied lists (9 upazilas, 100 unions; counts 11/8/5/21/13/10/13/9/10); not yet checked against LGED / BBS. Union names are English only.
- Population and area figures are Wikipedia's (census year not recorded).
- The `Data/alumni association.xlsx` sheet stacks several tables (alumni, students, 21st batch); `scripts/build_data.py` maps columns per header row. An earlier import wrongly counted ~170 student rows as alumni; fixed (107 alumni). Batch is only taken from the Batch column (never guessed from session); rows without it show no batch.
- Departments follow the committee's 39-item list (`backend/data/content/departments.json`, `/api/v1/departments`); unmatched imported values become "Other".
- Only 6 heritage places have photos and verified facts; Kal Bhairab
  temple has no licensed photo yet. The history text is deliberately
  minimal; do not add claims without a source.
- Bangla names for unions and the Bangla copy of articles are not
  written; blog posts are marked as sample content.
- Batch photos (`Data/*.zip`) and student photos are not used; they need
  consent and an upload/storage decision.
- No load test, Lighthouse run or deployment has been done.
