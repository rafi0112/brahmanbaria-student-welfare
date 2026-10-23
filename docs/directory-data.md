# Student and alumni directory data

The directory (the students and alumni of the original Google Form exports and batch PDFs in `Data/`) lives in Supabase, in the
`directory_records` table (migration 019). The site reads it from there; the JSON files in `backend/data/` are only a fallback for
development and are never served in production.

## What is stored

| Column | What | Who sees it |
| --- | --- | --- |
| `id`, `kind`, `name`, `batch`, `department`, `session`, `upazila` | The public record (`kind` is `student` or `alumni`) | Everyone |
| `occupation`, `workplace`, `designation` | Alumni only | Everyone (alumni page) |
| `private` (JSON) | `phone`, `email`, `bloodGroup`, `permanentAddress`, `presentAddress`, `school`, `college`, `facebook`, `photoLink`, `note` | Admins only |
| `sources` (JSON) | Every original form row (header to value) and PDF entry the record was built from | Database only |

Photos are kept as their original links (`photoLink`, usually a Google Drive link from the form), not as files.

Row Level Security is on with no policies, so the browser's publishable key cannot read the table at all; only the API's
database connection can. Public responses carry only the public columns; members see nothing extra for directory records;
admins see the contact columns and a "Form record" section on the person's page and in Membership Directory.

## Updating the data

1. Put new exports in `Data/` and run `python scripts/build_data.py`. It rebuilds `backend/data/students.json`, `alumni.json`
   and `records_full.json` (all git-ignored). Record ids come from the name and order, so existing people keep their id (and
   with it their invitation, admin edits and verification).
2. `cd backend && go run . import-directory` shows what would change (new records, records already in the database, how many
   values each private column has). Nothing is written.
3. `go run . import-directory --apply` writes it. Records are matched by id: new ones are added, existing ones updated.
   Nothing is ever deleted by the import.
4. Restart the API; its log says `directory: N student and alumni records from the database`.

Admin edits to a record (Membership Directory → Edit) are stored separately (`imported_edits`) and win over the imported values,
so re-importing does not undo them.
