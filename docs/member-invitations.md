# Member activation emails

**What it does.** An admin saves an email address on a directory record (Students, Member Directory, the row menu, *Add email address*) and presses *Send activation email*. The Go API calls Supabase Auth's admin invite endpoint (`POST /auth/v1/invite`, using the service-role key, server side only). **Supabase sends the email through the SMTP settings configured in the Supabase dashboard (the Google app password).** This application never sends authentication email itself and never sees the SMTP password.

**What "sent" means.** Supabase *accepted the request*. That is not proof the message reached an inbox, and the admin screen says so. Statuses: *Email saved, not sent*, then *Accepted by Supabase*, then either *Link probably expired* (derived from `INVITE_LINK_EXPIRY_HOURS`) or *Failed*, and finally *Account activated*.

**The member's side.** The link goes to Supabase, which validates the single-use token, confirms the email (`email_confirmed_at`, the source of truth for the verified indicator) and redirects to `/activate`. The page then sets the member's own password (`supabase.auth.updateUser`), fetches the existing directory details with `GET /me/invitation` (only for a signed-in, email-confirmed account whose address matches the saved one; nothing sensitive is in the URL), lets them correct the details, and submits `POST /me/profile`, which creates one pending profile (a Membership Request). The invitation is then marked completed, and a completed record cannot be invited again. Approval is a separate admin decision, and the verified icon needs both an approved membership and a confirmed email.

**Safeguards.** One address per record. An address that already has an account is never invited (the admin is told to use *Forgot password*). Changing the address resets the status. Resend has a cooldown (not applied after a failure). Hourly and daily limits are enforced from the `invite_log` table. A batch (*Send saved invitations*, at most 20) stops at the first limit or provider failure and never retries by itself.

## Configuration

Server (`backend/.env`, never committed; names only here)
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (already present).
- `SUPABASE_SECRET_KEY`: the new Secret key (`sb_secret_...`, Project Settings, API Keys). It is not a JWT, so it is sent only in the `apikey` header. `SUPABASE_SERVICE_ROLE_KEY` (legacy JWT, sent in both headers) is still accepted as a fallback; the secret key wins when both are set. A publishable key is never used. At startup the server asks Supabase Auth's admin API for one user (a read-only check) and logs whether the key was accepted, refused or could not be checked; the admin screen shows the same state. The key never leaves the Go process.
- `INVITE_MAX_PER_HOUR=20`, `INVITE_MAX_PER_DAY=100`, `INVITE_RESEND_COOLDOWN_MINUTES=60`, `INVITE_LINK_EXPIRY_HOURS=24`, `INVITE_REDIRECT_URL` (default `FRONTEND_URL/activate`).

Supabase dashboard (the keys this project has cannot read these; verify by hand)
1. *Authentication, SMTP Settings*: custom SMTP enabled; host `smtp.gmail.com`, port 465 or 587, the Gmail address as user, the **app password** as password, and the sender address and name recipients should see.
2. *Authentication, URL Configuration*: `Site URL` is the production site; add the activation URL (`https://<site>/activate`, and `http://localhost:5173/activate` for development) under *Redirect URLs*.
3. *Authentication, Email Templates, Invite user*: paste `docs/email-templates/supabase_invite_template.html` and set the subject to `Activate your BSWA account`. The application cannot do this for you: Supabase only lets the dashboard or a Management API token change templates, and this project has neither wired in. Until the new HTML is pasted, invitations go out with whatever template is there now. The editor is HTML only (no separate plain-text part), so the template also prints the link as text under the button. The template loads its logo, photograph and icons from `{{ .SiteURL }}/email/` (files in `frontend/public/email/`), so they appear once the site is deployed at the Supabase Site URL; `hero.jpg` is the supplied photograph of the university building (it carries the photographer's credit line; make sure you have permission to use it in mail). The brand line reads BSWA and the template is English only.
4. *Authentication, Rate Limits*: note the value for emails sent per hour (with custom SMTP it is configurable; it was not read from this project). Keep `INVITE_MAX_PER_HOUR` at or below it, and remember that sign-up confirmations and password resets share the same quota.
5. *Authentication, Providers, Email*: "Email OTP expiration" is the invitation link lifetime. Set `INVITE_LINK_EXPIRY_HOURS` to match.

Gmail limits belong to Google and vary. Google documents a temporary sending restriction for personal accounts above roughly 500 messages a day or 500 recipients in one message. The application defaults (20 per hour, 100 per day) are conservative safety values, not guarantees about Gmail capacity.

## Failure classes the admin sees
Missing key (`invite_not_configured`), refused key (`invite_key_invalid`), Supabase could not deliver through its SMTP (`smtp_failed`), recipient rejected (`invalid_recipient`), Supabase rate limit (`provider_rate_limited`), our own hourly/daily limits and cooldown (`limit_hour`, `limit_day`, `cooldown`), address already has an account (`account_exists`).

## Not verified in this build
No real invitation was sent because no controlled test recipient is configured (set `INVITE_TEST_RECIPIENT` only if you want a scripted send; the admin screen can also send one by hand). The Supabase client is covered against a fake Auth server, and the whole workflow against an in-memory store and PostgreSQL temporary tables. Still to verify by hand once the key exists: delivery through the Google SMTP, the template in Gmail, Outlook and mobile clients, the redirect, and expired or already-used links.

## Messages landing in Spam
Supabase accepting the request only means it handed the message to the SMTP server. Mail sent through a personal Gmail account with a custom sender often lands in the recipient's Spam or Promotions folder. The admin screen says so after every send and under each "accepted" invitation. Ways to improve it: ask recipients to mark the message "Not spam", keep the subject and sender name stable, use one real sender address, and for the best result send from an address on your own domain with SPF, DKIM and DMARC set up (Gmail's personal SMTP cannot do that for a custom domain).

## Removing an address
Admins can remove a saved address (row menu, or the red button inside the address dialog) unless the person has already activated their account. Nothing is sent. An earlier invitation's link may still work until it expires, and the pending user Supabase created is not deleted (that would be a destructive Auth operation); remove it from the Supabase dashboard (Authentication, Users) if needed.

## Publishing the invitation template from the command line
If the email you receive looks like Supabase's plain default ("You've been invited ... Accept invitation"), the custom template has not been published to the project yet: the application cannot change it with the Auth admin key. Either paste `docs/email-templates/supabase_invite_template.html` into the dashboard (Authentication, Email Templates, Invite user), or let the command do it:

1. Create a personal access token at supabase.com/dashboard/account/tokens and add `SUPABASE_ACCESS_TOKEN=...` to `backend/.env` (never in chat or source control).
2. `cd backend && go run . apply-email-template` compares the project's current invite subject and template with the repository version and changes nothing.
3. `go run . apply-email-template --apply` publishes them (subject `Activate your BSWA account`). Only the invite subject and body are touched, and the token is never printed.

Messages arriving in Spam ("similar to messages that were identified as spam") are a sender-reputation matter of the Gmail account used for SMTP, not of the template; the template improves wording and structure but cannot fix reputation. Marking messages "Not spam" and, ideally, sending from your own domain with SPF/DKIM/DMARC helps.

## The template file
`docs/email-templates/supabase_invite_template.html` is the only invitation template kept in the repository. It uses only `{{ .ConfirmationURL }}`. Its one image (the university photograph) is an external Google-hosted link, which is public today but not under your control and may change or stop working; the file has no icon images (the step numbers, the "!" and the logo letter are plain text). For a stable result, host the photograph and any icons on your own site or a public Supabase Storage bucket and put those links in the file.

## Profile change requests

Approved members cannot edit name, batch, department, session or location directly. They send a change request from their dashboard (`POST /me/profile/request`); it waits in Membership Requests as a "Profile update" row showing old → new values. Approve applies the details (`POST /admin/profile-changes/{id}/approve`), Decline discards them. The member stays approved and verified throughout. Stored in `profile_changes` (migration 012), one open request per member.

## Registered members, directory verification and moving to a new email

- **Registered members** lists exactly the approved, active members (no sub-tabs). Approving a request moves the person there.
- **Directory records** keep All / Needs verification / Verified, each with a count. A record becomes **Verified automatically** once its person activated the invitation and an admin approved their membership (derived on every read, so counts always agree). Manual verification still works.
- **Moving a verified person to a new email:** *Edit email* on the record, save the new address, send the invitation. The record stays verified. The new account's request arrives in Membership Requests marked as an update (old → new email). Approving it makes the new account the registered member and **deactivates** the earlier account (never deletes it; an administrator's account is never moved this way). Stored in `directory_invites.replaces_user` (migration 013).

## Completing and verifying directory records

- *Edit* works on every record. Bundled (file) records stay read-only files; the admin's completed name, batch, department, session and upazila are stored beside them (`imported_edits`, migration 014) and replace the file values everywhere.
- **Verify needs an email.** The button is disabled until an address is saved on the record, and the API refuses with `email_required`. Verifying also marks that address as confirmed by the admin (`directory_invites.email_verified_at`); both the person and the email then show the verified icon. Changing the address clears the email mark. Note this is the admin's confirmation, not a mailbox check: the person's own Supabase email confirmation still happens when they activate.

## Same person fields everywhere

A directory record (hand-added or a completed bundled one) holds name, batch, department, session, upazila, union, gender, blood group, phone and the invitation email, the same set as a member profile (migration 015). The activation page is prefilled with all of them. Only administrators can add or change them (`tests: TestEveryAdminRouteIsRoleGuarded` reads every `/api/v1/admin` and `/api/v1/me` route table and fails if any route lacks its guard). A registered member's sign-in email is the Supabase account itself, so it is changed through the invitation move described above, not edited in place.

## Who sees which person details

| Viewer | Sees |
| --- | --- |
| Public (not signed in, unverified email, or not yet approved) | name, batch, department, upazila |
| Approved member | the above, plus session, union and gender for everyone, and for registered members their phone, email and blood group unless that member chose "Only me and administrators" |
| Administrator | everything, including details admins entered for directory records, each member's status and each record's verification |

Rules enforced in one place (`backend/people.go`, tested in `supabase_auth_test.go` and `people_test.go`): contact details of people who have not registered stay admin-only (they never agreed to share them); a person never appears twice once their directory record is claimed by an approved account; the public site never serves placeholder articles (`sample: true`), which stay in the admin list to be replaced. Registration and activation require a real mobile number (`01XXXXXXXXX`); gender and blood group are optional. Phone, gender and blood group can be edited by the member at any time, academic details only through a change request once approved. New members' phone defaults to "approved members can see it" (migration 016; existing choices are untouched).

## Confirm sign-up email (self-registration)

Self-registration relies on Supabase's own **Confirm sign up** email; the app sends nothing itself.

**One-time setup in Supabase**
1. *Authentication → Sign In / Providers → Email*: switch **Confirm email** on.
2. *Authentication → Email Templates → Confirm signup*: Subject `Confirm your BSWA email`; paste `docs/email-templates/supabase_confirm_signup_template.html` into the body. The email goes out through the same Gmail SMTP as invitations.
3. *Authentication → URL Configuration*: the Site URL is the public site address, and `<site>/verify-email` is among the redirect URLs.
4. Alternatively publish it from here with `cd backend && go run . apply-email-template --template=confirm` (preview) and `--apply` (needs `SUPABASE_ACCESS_TOKEN`, the same as for invitations; add `--template=invite` for the invitation email, which is the default).

The template uses only `{{ .ConfirmationURL }}` plus `{{ .SiteURL }}` for the logo (`frontend/public/email/logo.png`, so the logo shows once the site is public). It shows the same public photograph of Jagannath University as the invitation.

**What happens, end to end**
| Step | Result |
| --- | --- |
| Visitor registers | Supabase creates the account (unconfirmed) and emails the link. They cannot sign in yet; the sign-in page offers to resend it. |
| Visitor clicks the link | The email is **verified**, the link signs them in, their membership profile is created as **pending** from the details they entered, and they land on the home page with their account menu in the header. |
| Verified, not yet approved | They can sign in and see **all of their own details**, and other people's **public** details only (name, batch, department, upazila). |
| Admin approves (Membership Requests) | They become a member: they appear in Registered members and can see every shared member detail; the verified badge appears. |

## Password reset email (forgot password)

Supabase sends the **Reset password** email; the app never sees or emails a password.

**One-time setup in Supabase**
1. *Authentication → Email Templates → Reset password*: Subject `Reset your BSWA password`; paste `docs/email-templates/supabase_reset_password_template.html` into the body. Or publish it with `cd backend && go run . apply-email-template --template=recovery` (preview) and `--apply` (needs `SUPABASE_ACCESS_TOKEN`).
2. *Authentication → URL Configuration*: `<site>/reset-password` is among the redirect URLs (and `http://localhost:5173/reset-password` for development).
3. *Authentication → Email → Email OTP expiration*: the template says the link expires after one hour, which is the Supabase default (3600 seconds). Change the sentence if you change the setting.
4. Leave *Secure password change* off: the reset link is the proof of ownership, and that setting would ask for a second code.

**What happens, end to end**
| Step | Result |
| --- | --- |
| Someone asks for a reset on `/forgot-password` | The page always says "if an account exists, a link was sent", so it cannot be used to find out who is registered. Too many requests show the rate-limit message. |
| They open the link | Supabase checks the single-use link and opens `/reset-password` with a recovery session. An expired or used link shows "This link is wrong or has expired" and a way to ask for a new one. Opening `/reset-password` without the link (even while signed in) shows the same, so a password can only be changed through the email. |
| They save a new password | It must have 8 characters or more and differ from the old one (both checked by Supabase too). Every other session of that account is signed out, this browser stays signed in, and they land on the home page with a confirmation message. |

## Profile photos

Members upload a JPEG or PNG (up to 5 MB) from the account menu → My profile; admins can set or remove any member's photo in the member drawer. The server decodes the file, crops it to a square, scales it to 480 px and re-encodes it as JPEG (which strips EXIF/GPS), then stores it in PostgreSQL (`profile_photos`, migration 017). Photos are served only through the API (`/api/v1/me/photo`, `/api/v1/students/m-{id}/photo`) to the member, approved members (when the member is listed in the directory) and admins: the same audience as other personal details. The public sees initials.

## Photo links and the executive committee

- **Photo links:** wherever a profile is created or updated, a public image link can be given instead of a file: Google Drive (shared as "Anyone with the link") or any https image. This applies to registration, activation, completing a profile, the profile dialog and the admin member drawer. The server downloads it once through the same guarded fetcher as committee photos (no private hosts, size and type checks), squares and re-encodes it, and stores it like an upload.
- **Admins on public pages:** a signed-in admin sees every detail and photo on the public student pages (the `admin` view).
- **Executive committee:** committees have an optional introduction (`description`, migration 018). The public page groups seats into executive committee, teacher advisors and student advisors by designation.
- **Seeding a committee:** `go run . seed-committee` previews a committee from `backend/data/committee-2026-2027.json`. Add `--apply` to create it and `--publish` to publish it, using the same store methods as the admin panel. It refuses to run twice.
- **Committee photos:** set them in the admin panel (file, Google Drive link or any https link); they are stored in the `executive-photos` bucket.
