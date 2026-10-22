# Contact inbox

**Flow.** Public form → `POST /api/v1/contact` (honeypot, 5 per hour per address, server-side validation) → row in `contact_messages` → notification email to `CONTACT_RECIPIENT_EMAIL` → admins read and reply under **Admin → Messages** (`/admin/contact`). The message is saved before any email is attempted, so a mail outage never loses it; the visitor is told only that the message was received.

**Configuration (names only, values stay in `backend/.env`).**
- `CONTACT_RECIPIENT_EMAIL` — the mailbox that is notified. Separate from the sender. If empty, messages are still stored, the inbox says no one is notified, and the row is marked "not configured".
- `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` — the existing sender used for every email. Supabase Auth's own SMTP settings are *not* visible to the Go API, so the API sends through Brevo. Required when `APP_ENV=production`.
- `FRONTEND_URL` — used for the inbox link in the notification.

**Email semantics.** Notification: from `MAIL_FROM`, to the recipient mailbox, Reply-To = the visitor's address (shown as "not verified"). Reply: from `MAIL_FROM`, **to the address stored with the message** (the request cannot name a recipient), Reply-To = the recipient mailbox. Subjects are flattened to one line. In development (no Brevo key) emails are printed to the server log; the inbox shows a banner and a reply is recorded as "simulated", never as delivered.

**Statuses.** `new → read → replied`, or `archived`. "Replied" is set only by a reply the mail provider accepted; a failed reply is kept in the thread as "not delivered" and does not change the status. `notify_status` is `pending | sent | failed | skipped`; failed or skipped notifications can be retried from the message.

**Retention (30 days).** `expires_at = submission + 30 days`, fixed at insert; reading, replying and archiving never move it. Expired rows are invisible in every view and API call immediately, and are deleted (replies cascade) by: a purge on each submission and each inbox load, a 6-hourly loop while the API runs, and `go run . purge-contact` for a scheduler. Because a hosted process can be suspended, schedule the command (or a database job) as well, e.g. with pg_cron if enabled: `select cron.schedule('purge-contact', '17 3 * * *', $$delete from contact_messages where expires_at <= now()$$);`. Monitor: the API logs `contact purge: removed N expired messages`; `select count(*) from contact_messages where expires_at <= now()` should stay near 0. Copies already delivered to a mailbox are outside the application's control.

**Security.** Admin-only endpoints (`requireAdmin`); tables have RLS enabled with no policies; replies and audit entries never contain message text; admin views render text, never HTML. Migration `007_contact_inbox.sql` is additive and is applied automatically the next time the API starts against the database.
