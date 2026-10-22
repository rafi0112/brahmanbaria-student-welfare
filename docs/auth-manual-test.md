# Manual test: email sign-up, login, reset and admin (local)

Use an inbox you control. Gmail aliases work: `you+member1@gmail.com`, `you+member2@gmail.com`.
Never paste keys or passwords into chat, issues or commits.

## 0. Start everything

```bash
cd backend && go run .          # http://localhost:8080
cd frontend && npm run dev      # http://localhost:5173  (open THIS address, not 127.0.0.1)
```

`backend/.env` must contain these names (values stay on your machine): `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `ADMIN_EMAILS` (the email of the account that should be admin).
`frontend/.env` must contain `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
Restart the API after editing `backend/.env`; restart Vite after editing `frontend/.env`.

Supabase dashboard checklist (Authentication): Email provider on, **Confirm email** on, Site URL
`http://localhost:5173`, Redirect URLs include `http://localhost:5173/verify-email` and
`http://localhost:5173/reset-password`, custom SMTP (Brevo) enabled with a verified sender.

## 1. Sign-up and the confirmation email

1. Open `/register`, fill every field with `you+member1@...`, tick the terms, submit.
2. Expected: you land on `/verify-email?email=...` with "Application received".
3. Expected: an email arrives within about a minute (check Spam). **If it does not:**
   - Supabase → Authentication → Logs: was a send attempted, any SMTP error?
   - Brevo → Transactional → Logs: was it accepted, blocked or deferred? Is the sender verified?
   - Supabase → Authentication → Rate limits: the email send limit may be reached.
4. Click the link. Expected: `/verify-email` shows "Email verified" and a "Go to dashboard" button.
5. Open the dashboard. Expected: your name, batch, department, upazila, union, status "waiting for approval".

## 2. Unverified users

1. Register `you+member2@...` but do **not** click the link.
2. Log in with it. Expected: "Verify your email first" and a "Resend email" button (no session is created).
3. Press Resend. Expected: a new email. (Press it many times: you should eventually see the rate-limit message.)
4. Optional API check: with no `Authorization` header, `curl -i localhost:8080/api/v1/auth/me` returns 401.

## 3. Session persistence and logout

1. Log in as member1, reload the page: still signed in. Close the tab, open `/dashboard` again: still signed in.
2. Click "Log out" on the dashboard. Expected: `/dashboard` now asks you to log in; reloading keeps you logged out.

## 4. Password reset

1. `/forgot-password`, enter member1's email. Expected: "If an account exists…" (same text for unknown emails).
2. Open the email, click the link. Expected: `/reset-password` shows the new-password form.
3. Set a new password. Expected: "Password changed", then log in with the new one; the old one must fail.
4. Click the same email link again. Expected: "This link is wrong or has expired".
5. Open `/reset-password` directly (no link). Expected: a message asking you to open the email link, no form.

## 5. Admin authorization

1. Make sure `ADMIN_EMAILS` has the admin address, restart the API, sign up that address, confirm the email, log in.
2. Expected: the header button says "Admin panel"; `/admin` lists pending members (member1).
3. Approve member1. Expected: `/students?q=<member1 name>` lists them (public fields only).
4. Log in as member1 and open `/admin`. Expected: "This page is for admins only".
5. API check (server-side enforcement): in the browser dev tools copy no tokens into chat, but you can confirm that
   `curl -i localhost:8080/api/v1/admin/members` (no token) returns 401, and that member1's token gets 403.

## 6. Clean up

Only after you have checked the preview below. Nothing here touches `content_documents` (students, alumni, places...).
Foreign keys verified on the live schema: `profiles`, `sessions`, `email_tokens` reference `users` with `ON DELETE CASCADE`.

1. Supabase → Authentication → Users: delete the test users there (this does not remove our own `users` rows).
2. SQL editor, preview first and confirm that only your test addresses are listed (never your admin address):
   `select id, email, role from users where email like 'you+member%';`
3. Then, in one transaction you can roll back:
   ```sql
   begin;
   delete from users where email like 'you+member%' and role = 'member';
   -- check the reported row count, then:
   commit;   -- or: rollback;
   ```

## What to report back

For each numbered step: worked / did not, and for email steps whether the mail arrived and how long it took.
