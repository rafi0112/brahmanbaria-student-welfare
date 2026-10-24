# Contact inbox

**Flow.** Public form → `POST /api/v1/contact` (honeypot, 5 per hour per address, server-side validation) → row in `contact_messages` → notification email to `CONTACT_RECIPIENT_EMAIL` → admins read the message under **Admin → Messages** (`/admin/contact`). The message is saved before any email is attempted, so a mail outage never loses it; the visitor is told only that the message was received.

**Admin actions.** Read a message, mark it as read, delete it. There is no reply from the panel: to answer a visitor, use the address shown with the message from your own mailbox.

**Configuration (names only, values stay in `backend/.env` or the host's environment).**
- `CONTACT_RECIPIENT_EMAIL`: the mailbox that is notified. If empty, the SMTP account itself is used; if no mailer is configured, messages are still stored and the inbox shows that no one was notified.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `MAIL_FROM_NAME`: the Gmail account (with an App Password) the API uses for the notification. Supabase Auth's own SMTP settings (used for sign-up, reset and invitation emails) are not visible to the Go API, so the API needs its own copy. `SMTP_HOST` is required when `APP_ENV=production`.
- `FRONTEND_URL`: used for the inbox link in the notification.

**Email semantics.** The notification goes from the SMTP account to the recipient mailbox, with Reply-To set to the visitor's address (shown in the inbox as "not verified"). Subjects are flattened to one line. In development, with no SMTP settings, emails are printed to the server log. Some hosts block outbound SMTP; if the notification fails, the message is kept and its status shows "failed".

**Notification status.** `notify_status` is `pending | sent | failed | skipped`.

**Retention (30 days).** `expires_at = submission + 30 days`, fixed at insert; reading never moves it. Expired rows are invisible in every view and API call immediately, and are deleted by a purge on each submission and each inbox load, a 6-hourly loop while the API runs, and `go run . purge-contact` for a scheduler. Because a hosted process can be suspended, schedule the command (or a database job) as well, for example with pg_cron if enabled: `select cron.schedule('purge-contact', '17 3 * * *', $$delete from contact_messages where expires_at <= now()$$);`.

**Security.** Admin-only endpoints (`requireAdmin`); tables have RLS enabled with no policies; audit entries never contain message text; admin views render text, never HTML. Migration `007_contact_inbox.sql` is additive and is applied automatically the next time the API starts against the database.
