# Executive Committee management

Admins manage the committee in **/admin → Executive Committee**. The public page is **/committee** (it shows only the
published committee; with none published it shows an empty state — nothing is fabricated).

## Concepts

- **Committee** = one term (name, term label, optional start/end date). States: `draft` → `published` → `archived`.
  Only one committee can be published at a time. Publishing another one archives the current one in the same step.
  Archived committees are read-only history (visible to admins only).
- **Executive** = one seat in a committee: designation, short bio, photo, display order. A seat links to a
  registered member (`users.id`, no duplicate account is created) or stands alone for a person without an account.
  One member holds at most one active seat per committee.
- **Removing** a seat only hides it from the panel (`removed_at`). The user account, member profile and alumni data are never
  touched. The member can be added again later.
- Every change is written to `committee_audit` (who, what, when).

## One-time Supabase Storage setup (photos)

Nothing in the browser holds a secret: the Go API receives the file, validates it, and uploads it with the **signed-in
admin's own token**; Storage policies decide. No service-role key is used anywhere.

Run once (idempotent, additive, drops nothing):

```bash
cd backend && go run . storage-setup
```

It creates the public-read bucket `executive-photos` (5 MB, JPEG/PNG only) and one policy: only a verified admin
(`public.is_admin()`) may INSERT. There is no UPDATE/DELETE policy, so photos cannot be overwritten or deleted through
the API. If the command reports a permission error, open **Supabase → SQL Editor**, paste
`backend/storage/executive_photos.sql` and run it. Check afterwards under **Storage → executive-photos** that the bucket
shows as *Public*.

Migration `005_executive_committee.sql` (tables) is applied automatically when the API starts.

## Photo rules

- Upload (computer or phone): JPEG or PNG, up to 5 MB, 64–8000 px per side. The server decodes the image
  (the file name and declared type are not trusted), re-encodes it (this removes EXIF/GPS data and anything hidden in the
  file), and stores it under a random name. Only that name is stored in PostgreSQL.
- Google Drive link: set the file to **Share → Anyone with the link**, paste the link (`/file/d/…`, `open?id=…`, `uc?id=…`).
  The server fetches the picture from Drive once, proves it can be displayed, validates it exactly like an upload and keeps a
  copy in our bucket, so the public page never depends on Drive staying reachable. A private file, a folder link or a
  non-Drive link is refused with a clear message. Drive's thumbnail rendition (up to 1200 px) is what gets stored.
- Photos are never deleted automatically (replacing or removing a photo leaves the old object in the bucket), so an image that
  is still referenced can never be lost. Clean up unreferenced objects by hand in the Supabase Storage UI if you wish.

## Manual test

1. Log in as an admin and open `/admin` → **Executive Committee**.
2. **New committee** → name, term (for example `2026–27`) → Save. It appears as a *Draft*.
3. **Add executive** → search a registered member (or tick "no account" and type a name) → designation → pick a photo
   (or paste a Drive link and click *Use link*) → wait for "Photo checked" → Save.
4. Reorder with ↑ / ↓, edit a seat (change the photo), try adding the same member twice (refused).
5. **Publish** → confirm. Open `/committee` in a private window: the cards show photo, name, designation and bio.
6. **Remove** a seat → confirm. The member is still in the member list and can still log in.
7. Create a second committee, add someone, publish it: the first becomes *Archived* (read-only) and disappears from `/committee`.
8. **Unpublish** the current one: `/committee` shows the empty state again.

## Running the PostgreSQL committee tests safely

`LIVE_TEMP_TABLES=1 go test -run TestPostgresCommitteeStoreInTempTables ./...` runs the committee rules against the real
PostgreSQL engine but on temporary tables that exist only on one connection and shadow the real ones (they vanish when
the connection closes, every connection re-creates them, and the test refuses to continue if they are missing). It
reads `DATABASE_URL` from `backend/.env` and touches no real row.
