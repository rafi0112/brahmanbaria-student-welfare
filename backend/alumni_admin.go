package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Alumni are directory records of kind "alumni" (table directory_records). Admins list, add, edit and delete them here;
// every change is written to the database and the site's copy is reloaded at once.

func (a *App) alumniAdminRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/admin/alumni", adm(a.alumniList))
	m.HandleFunc("POST /api/v1/admin/alumni", adm(a.alumniSave))
	m.HandleFunc("PATCH /api/v1/admin/alumni/{id}", adm(a.alumniSave))
	m.HandleFunc("POST /api/v1/admin/alumni/{id}/delete", adm(a.alumniDelete))
}

type alumniAdminRow struct {
	Alumnus
	Private      map[string]string `json:"private"`
	Invite       map[string]any    `json:"invite,omitempty"`
	Verified     bool              `json:"verified"`
	AutoVerified bool              `json:"autoVerified,omitempty"`
	VerifiedAt   string            `json:"verifiedAt,omitempty"`
	VerifiedBy   string            `json:"verifiedBy,omitempty"`
}

func (a *App) alumniList(w http.ResponseWriter, r *http.Request, _ User) {
	q := r.URL.Query()
	needle := strings.TrimSpace(q.Get("q"))
	batch, _ := strconv.Atoi(q.Get("batch"))
	d := a.data()
	invites, _ := a.Auth.Store.Invites(r.Context())
	reviews, _ := a.Auth.Store.ImportedReviews(r.Context())
	status := q.Get("status") // "", verified, awaiting, invited
	out := []alumniAdminRow{}
	for _, al := range d.Alumni {
		pv := d.Private[al.ID]
		if needle != "" && !contains(strings.Join([]string{al.Name, al.Occupation, al.Workplace, al.Designation, al.Department, pv["phone"], pv["email"]}, " "), needle) {
			continue
		}
		if batch > 0 && (al.Batch == nil || *al.Batch != batch) {
			continue
		}
		if dep := q.Get("department"); dep != "" && al.Department != dep {
			continue
		}
		row := alumniAdminRow{Alumnus: al, Private: nonNilMap(pv)}
		if rv, ok := reviews[al.ID]; ok {
			row.Verified, row.VerifiedAt, row.VerifiedBy = true, rv.VerifiedAt, rv.VerifiedBy
		}
		if inv, ok := invites[al.ID]; ok {
			row.Invite = a.inviteView(inv)
			// activating the invitation and an approved membership verify the record, as for directory students
			for _, uid := range []string{inv.CompletedUser, inv.ReplacesUser} {
				if uid == "" || row.Verified {
					continue
				}
				if p, err := a.Auth.Store.ProfileByUser(r.Context(), uid); err == nil && p != nil && p.Status == StatusApproved {
					row.Verified, row.AutoVerified = true, true
					row.Invite["emailVerified"] = true
				}
			}
		}
		if (status == "verified" && !row.Verified) || (status == "awaiting" && row.Verified) || (status == "invited" && row.Invite == nil) {
			continue
		}
		out = append(out, row)
	}
	sort.SliceStable(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	pg, limit := paging(r, 25)
	lo, hi, pages := window(len(out), pg, limit)
	writeJSON(w, 200, map[string]any{"items": out[lo:hi], "total": len(out), "page": pg, "pages": pages, "fromDatabase": d.FromDB})
}

type alumniBody struct {
	Name        string            `json:"name"`
	Batch       int               `json:"batch"`
	Department  string            `json:"department"`
	Occupation  string            `json:"occupation"`
	Workplace   string            `json:"workplace"`
	Designation string            `json:"designation"`
	Upazila     string            `json:"upazila"`
	Private     map[string]string `json:"private"`
}

var alumniPrivateKeys = map[string]int{"phone": 20, "email": 254, "bloodGroup": 3, "permanentAddress": 300, "presentAddress": 300, "facebook": 300, "photoLink": 1000, "note": 1000, "school": 200, "college": 200}

func (a *App) validAlumni(b *alumniBody) map[string]string {
	errs := map[string]string{}
	b.Name = strings.Join(strings.Fields(b.Name), " ")
	trimAll(&b.Department, &b.Occupation, &b.Workplace, &b.Designation, &b.Upazila)
	if n := utf8.RuneCountInString(b.Name); n < 2 || n > 200 {
		errs["name"] = "Name must be 2-200 characters."
	}
	if b.Batch != 0 && (b.Batch < 1 || b.Batch > 60) {
		errs["batch"] = "Choose a batch."
	}
	for k, v := range map[string]string{"occupation": b.Occupation, "workplace": b.Workplace, "designation": b.Designation, "department": b.Department} {
		if utf8.RuneCountInString(v) > 200 {
			errs[k] = "Keep it under 200 characters."
		}
	}
	if b.Upazila != "" {
		ok := false
		for _, u := range a.data().Upazilas {
			ok = ok || u.Slug == b.Upazila
		}
		if !ok {
			errs["upazila"] = "Choose an upazila from the list."
		}
	}
	clean := map[string]string{}
	for k, v := range b.Private {
		max, known := alumniPrivateKeys[k]
		v = strings.TrimSpace(v)
		if !known || v == "" {
			continue
		}
		if utf8.RuneCountInString(v) > max {
			errs[k] = "This is too long."
		}
		clean[k] = v
	}
	if e := clean["email"]; e != "" && !emailRx.MatchString(e) {
		errs["email"] = "Enter a valid email address."
	}
	if p := clean["phone"]; p != "" && !phoneRx.MatchString(p) {
		errs["phone"] = "Use an 11-digit number starting with 01."
	}
	if bg := clean["bloodGroup"]; bg != "" && !bloodRx.MatchString(bg) {
		errs["bloodGroup"] = "Choose a valid blood group."
	}
	b.Private = clean
	return errs
}

func newRecordID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

func (a *App) findRecord(ctx context.Context, id string) (DirectoryRecord, error) {
	recs, err := a.Auth.Store.DirectoryRecords(ctx)
	if err != nil {
		return DirectoryRecord{}, err
	}
	for _, r := range recs {
		if r.ID == id {
			return r, nil
		}
	}
	return DirectoryRecord{}, ErrNotFound
}

func (a *App) alumniSave(w http.ResponseWriter, r *http.Request, u User) {
	var b alumniBody
	if !decode(w, r, &b) {
		return
	}
	if fieldErrors(w, a.validAlumni(&b)) {
		return
	}
	id := r.PathValue("id")
	rec := DirectoryRecord{ID: newRecordID("a-"), Kind: "alumni"}
	action := "alumni.create"
	if id != "" {
		cur, err := a.findRecord(r.Context(), id)
		if errors.Is(err, ErrNotFound) || (err == nil && cur.Kind != "alumni") {
			apiError(w, http.StatusNotFound, "not_found")
			return
		} else if err != nil {
			log.Printf("alumni find: %v", err)
			apiError(w, 500, "could not save")
			return
		}
		rec, action = cur, "alumni.update"
	}
	var bp *int
	if b.Batch > 0 {
		bp = &b.Batch
	}
	rec.Name, rec.Batch, rec.Department, rec.Occupation, rec.Workplace, rec.Designation, rec.Upazila, rec.Private =
		b.Name, bp, b.Department, b.Occupation, b.Workplace, b.Designation, b.Upazila, b.Private
	if _, _, err := a.Auth.Store.UpsertDirectoryRecords(r.Context(), []DirectoryRecord{rec}); err != nil {
		log.Printf("alumni save: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, action, "alumni", rec.ID, map[string]any{"title": rec.Name})
	if err := a.reloadLive(r.Context()); err != nil {
		log.Printf("reload after alumni change: %v", err)
	}
	status := 200
	if id == "" {
		status = 201
	}
	writeJSON(w, status, alumniAdminRow{Alumnus: Alumnus{ID: rec.ID, Name: rec.Name, Batch: rec.Batch, Department: rec.Department, Occupation: rec.Occupation,
		Workplace: rec.Workplace, Designation: rec.Designation, Upazila: rec.Upazila}, Private: nonNilMap(rec.Private)})
}

func (a *App) alumniDelete(w http.ResponseWriter, r *http.Request, u User) {
	a.deleteRecord(w, r, u, "alumni")
}

// deleteRecord removes one directory record (a student of the original directory or an alumnus) for good.
func (a *App) deleteRecord(w http.ResponseWriter, r *http.Request, u User, kind string) {
	id := r.PathValue("id")
	cur, err := a.findRecord(r.Context(), id)
	if errors.Is(err, ErrNotFound) || (err == nil && cur.Kind != kind) {
		apiError(w, http.StatusNotFound, "not_found")
		return
	} else if err != nil {
		log.Printf("record find: %v", err)
		apiError(w, 500, "could not delete")
		return
	}
	if err := a.Auth.Store.DeleteDirectoryRecord(r.Context(), id); err != nil {
		log.Printf("record delete: %v", err)
		apiError(w, 500, "could not delete")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, kind+".delete", kind, id, map[string]any{"title": cur.Name})
	if err := a.reloadLive(r.Context()); err != nil {
		log.Printf("reload after delete: %v", err)
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
