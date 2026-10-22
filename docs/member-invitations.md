# Member activation emails

**What it does.** An admin saves an email address on a directory record (Students, Member Directory, the row menu, *Add email address*) and presses *Send activation email*. The Go API calls Supabase Auth's admin invite endpoint (`POST /auth/v1/invite`, using the service-role key, server side only). **Supabase sends the email through the SMTP settings configured in the Supabase dashboard (the Google app password).** This application never sends authentication email itself and never sees the SMTP password.

**What "sent" means.** Supabase *accepted the request*. That is not proof the message reached an inbox, and the admin screen says so. Statuses: *Email saved, not sent*, then *Accepted by Supabase*, then either *Link probably expired* (derived from `INVITE_LINK_EXPIRY_HOURS`) or *Failed*, and finally *Account activated*.

**The member's side.** The link goes to Supabase, which validates the single-use token, confirms the email (`email_confirmed_at`, the source of truth for the verified indicator) and redirects to `/activate`. The page then sets the member's own password (`supabase.auth.updateUser`), fetches the existing directory details with `GET /me/invitation` (only for a signed-in, email-confirmed account whose address matches the saved one; nothing sensitive is in the URL), lets them correct the details, and submits `POST /me/profile`, which creates one pending profile (a Membership Request). The invitation is then marked completed, and a completed record cannot be invited again. Approval is a separate admin decision, and the verified icon needs both an approved membership and a confirmed email.

**Safeguards.** One address per record. An address that already has an account is never invited (the admin is told to use *Forgot password*). Changing the address resets the status. Resend has a cooldown (not applied after a failure). Hourly and daily limits are enforced from the `invite_log` table. A batch (*Send saved invitations*, at most 20) stops at the first limit or provider failure and never retries by itself.

## Configuration

Server (`backend/.env`, never committed; names only here)
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (already present).
- `SUPABASE_SERVICE_ROLE_KEY`: **not present in this project at the time of writing**, so *Send activation email* answers "not configured" and the admin screen shows a banner. Add it only to `backend/.env`.
- `INVITE_MAX_PER_HOUR=20`, `INVITE_MAX_PER_DAY=100`, `INVITE_RESEND_COOLDOWN_MINUTES=60`, `INVITE_LINK_EXPIRY_HOURS=24`, `INVITE_REDIRECT_URL` (default `FRONTEND_URL/activate`).

Supabase dashboard (the keys this project has cannot read these; verify by hand)
1. *Authentication, SMTP Settings*: custom SMTP enabled; host `smtp.gmail.com`, port 465 or 587, the Gmail address as user, the **app password** as password, and the sender address and name recipients should see.
2. *Authentication, URL Configuration*: `Site URL` is the production site; add the activation URL (`https://<site>/activate`, and `http://localhost:5173/activate` for development) under *Redirect URLs*.
3. *Authentication, Email Templates, Invite user*: paste `docs/email-templates/invite.html` and set the subject to `Activate your Jela Kollan for University account`. Supabase's template editor is HTML only (there is no separate plain-text part), which is why the template also prints the address as text under the button.
4. *Authentication, Rate Limits*: note the value for emails sent per hour (with custom SMTP it is configurable; it was not read from this project). Keep `INVITE_MAX_PER_HOUR` at or below it, and remember that sign-up confirmations and password resets share the same quota.
5. *Authentication, Providers, Email*: "Email OTP expiration" is the invitation link lifetime. Set `INVITE_LINK_EXPIRY_HOURS` to match.

Gmail limits belong to Google and vary. Google documents a temporary sending restriction for personal accounts above roughly 500 messages a day or 500 recipients in one message. The application defaults (20 per hour, 100 per day) are conservative safety values, not guarantees about Gmail capacity.

## Not verified in this build
No real invitation was sent: the service-role key is absent and no test mailbox was provided. The Supabase client is covered against a fake Auth server, and the whole workflow against an in-memory store and PostgreSQL temporary tables. Still to verify by hand once the key exists: delivery through the Google SMTP, the template in Gmail, Outlook and mobile clients, the redirect, and expired or already-used links.
