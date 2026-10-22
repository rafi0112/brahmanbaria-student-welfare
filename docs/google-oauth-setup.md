# Next step (not started): Google sign-in

Do this only after the email flow in `auth-manual-test.md` passes. Nothing here is deployed or enabled yet:
the Google button is hidden until `VITE_ENABLE_GOOGLE=true`.

## What you do

1. **Google Cloud Console** → create or pick a project → *APIs & Services → OAuth consent screen*
   (External, app name BSWA, support email, add your own address as a test user while the app is in Testing).
2. *Credentials → Create credentials → OAuth client ID → Web application*.
   - Authorised JavaScript origins: `http://localhost:5173`
   - Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
     (copy the exact URI from Supabase → Authentication → Providers → Google).
3. **Supabase** → Authentication → Providers → Google: enable, paste the client ID and client secret **there**
   (never in chat, `.env` files or git). Keep "Confirm email" on for email sign-ups.
4. Supabase → Authentication → URL Configuration: add `http://localhost:5173/dashboard` to Redirect URLs.
5. `frontend/.env`: add `VITE_ENABLE_GOOGLE=true`, restart Vite.

## What I will do in that step

- Test the round trip: button → Google → Supabase → `/dashboard`.
- Google accounts arrive with a confirmed email and no member details, so the dashboard shows the
  "Complete your membership application" form (already built). Admin access still requires the address in `ADMIN_EMAILS`.
- Decide account linking: Supabase links a Google login to an existing email account with the same address.
  We will check that it does not let an unconfirmed email account be taken over.
- Production later: add the production domain to the Google origins and the Supabase redirect list, and publish the
  consent screen.

## Checks before you start

- Email sign-up, login, reset and admin approval all pass.
- You can sign in to the Google Cloud project you will use.
