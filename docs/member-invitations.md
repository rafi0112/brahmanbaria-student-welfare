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
