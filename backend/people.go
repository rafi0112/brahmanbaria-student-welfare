package main

import (
	"context"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
)

// The people directory. One list is built from real stored data only:
//   - registered members: approved, active accounts that chose to be listed (profiles table);
//   - directory records: the original directory file plus records admins added by hand, with the details admins completed.
//     A record whose person has since activated an account and been approved is represented by that account instead, so nobody
//     appears twice.
//
// What a viewer may see is decided in one place (view below):
//   - public (not signed in, unverified, or not yet approved): name, batch, department and upazila only;
//   - member (signed in, email verified, approved): everything above plus session, union and gender, and, for registered members,
//     their phone, email and blood group unless that member set the field to "hidden";
//   - admin: everything, including details admins entered for directory records and each record's status.
//
// Contact details of directory-only people (nobody registered for them) stay admin-only: they never agreed to share them.

type Person struct {
	ID         string
	Source     string // member | directory
	Name       string
	Batch      *int
	Department string
	Session    string
	Upazila    string
	Union      string
	Gender     string
	BloodGroup string
	Phone      string
	Email      string
	Status     string // member profile status (members only)
	Verified   bool   // directory records: verified by an admin or through an approved account
	ShowPhone  string
	ShowEmail  string
	ShowBlood  string
	PhotoVer   string            // set when the member has a photo
	Extra      map[string]string // directory records: the original form's private columns (admins only)
	// AccountVerified: an approved member whose email is confirmed. Shown to everyone as the verified mark.
	AccountVerified bool
}

func personFromProfile(p *Profile, email string) Person {
	b := p.Batch
	var bp *int
	if b > 0 {
		bp = &b
	}
	return Person{ID: "m-" + p.UserID, Source: "member", Name: p.Name, Batch: bp, Department: p.Department, Session: p.Session, Upazila: p.Upazila, Union: p.Union,
		Gender: p.Gender, BloodGroup: p.BloodGroup, Phone: p.Phone, Email: email, Status: p.Status, ShowPhone: p.ShowPhone, ShowEmail: p.ShowEmail, ShowBlood: p.ShowBlood}
}

type personPublic struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Batch      *int   `json:"batch"`
	Department string `json:"department"`
	Upazila    string `json:"upazila"`
	Verified   bool   `json:"verified"` // the verified mark: an approved member with a confirmed email
}

type personDetails struct {
	Source     string `json:"source"`
	Session    string `json:"session"`
	Union      string `json:"union"`
	Gender     string `json:"gender"`
	BloodGroup string `json:"bloodGroup,omitempty"`
	Phone      string `json:"phone,omitempty"`
	Email      string `json:"email,omitempty"`
	Status     string `json:"status,omitempty"`   // admins only
	Verified   *bool  `json:"verified,omitempty"` // admins only, directory records
	PhotoURL   string `json:"photoUrl,omitempty"`
	// Record: admins only, directory records: the remaining columns of the original form (addresses, school, Facebook, photo link, note)
	Record map[string]string `json:"record,omitempty"`
}

type personView struct {
	personPublic
	View    string         `json:"view"` // public | member | admin: what this viewer is allowed to see
	Details *personDetails `json:"details,omitempty"`
}

type viewer struct {
	Kind string // public | member | admin
	ID   string // account id when signed in
}

func (a *App) whoIsViewing(r *http.Request) viewer {
	if a.Auth == nil {
		return viewer{Kind: "public"}
	}
	u, ok := a.currentUser(r)
	if !ok || !u.EmailVerified || u.Disabled {
		return viewer{Kind: "public"}
	}
	if u.Role == RoleAdmin {
		return viewer{Kind: "admin", ID: u.ID}
	}
	if p, err := a.Auth.Store.ProfileByUser(r.Context(), u.ID); err == nil && p.Status == StatusApproved {
		return viewer{Kind: "member", ID: u.ID}
	}
	return viewer{Kind: "public"}
}

// levelAllows says whether a member's own privacy choice lets this viewer see a contact field. Public viewers never see contact
// details; "public" (an older setting) now means "members" because the public site shows four fields only.
func levelAllows(level, viewerKind string) bool {
	switch viewerKind {
	case "admin":
		return true
	case "member":
		return level != "hidden"
	}
	return false
}

func (p Person) view(v viewer) personView {
	out := personView{personPublic: personPublic{ID: p.ID, Name: p.Name, Batch: p.Batch, Department: p.Department, Upazila: p.Upazila, Verified: p.AccountVerified}, View: v.Kind}
	if v.Kind == "public" {
		return out
	}
	d := &personDetails{Source: p.Source, Session: p.Session, Union: p.Union, Gender: p.Gender}
	if p.Source == "member" && p.PhotoVer != "" {
		d.PhotoURL = studentPhotoURL(strings.TrimPrefix(p.ID, "m-"), p.PhotoVer)
	}
	self := p.Source == "member" && v.ID != "" && p.ID == "m-"+v.ID
	if p.Source == "member" {
		if self || levelAllows(p.ShowPhone, v.Kind) {
			d.Phone = p.Phone
		}
		if self || levelAllows(p.ShowEmail, v.Kind) {
			d.Email = p.Email
		}
		if self || levelAllows(p.ShowBlood, v.Kind) {
			d.BloodGroup = p.BloodGroup
		}
	}
	if v.Kind == "admin" {
		d.Phone, d.Email, d.BloodGroup, d.Status = p.Phone, p.Email, p.BloodGroup, p.Status
		if p.Source == "directory" {
			ver := p.Verified
			d.Verified = &ver
			if len(p.Extra) > 0 {
				d.Record = map[string]string{}
				for k, v := range p.Extra {
					if v != "" && k != "phone" && k != "email" && k != "bloodGroup" {
						d.Record[k] = v
					}
				}
			}
		}
	}
	out.Details = d
	return out
}

// directoryPeople builds the list described at the top of this file.
func (a *App) directoryPeople(ctx context.Context) []Person {
	people := []Person{}
	claimed := map[string]bool{} // directory records already represented by an approved account
	if a.Auth != nil {
		st := a.Auth.Store
		if ms, err := st.ApprovedPeople(ctx); err == nil {
			vers := a.photoVersions(ctx)
			for i := range ms {
				ms[i].PhotoVer = vers[strings.TrimPrefix(ms[i].ID, "m-")]
			}
			people = append(people, ms...)
		} else {
			log.Printf("approved people: %v", err)
		}
		if invs, err := st.Invites(ctx); err == nil {
			for id, iv := range invs {
				if iv.CompletedUser == "" {
					continue
				}
				if p, err := st.ProfileByUser(ctx, iv.CompletedUser); err == nil && p != nil && p.Status == StatusApproved {
					claimed[id] = true
				}
			}
		}
	}
	edits := map[string]ManualImportedInput{}
	reviews := map[string]ImportedReview{}
	var manual []ManualImported
	invites := map[string]DirectoryInvite{}
	if a.Auth != nil {
		st := a.Auth.Store
		edits, _ = st.ImportedEdits(ctx)
		reviews, _ = st.ImportedReviews(ctx)
		manual, _ = st.ListManualImported(ctx)
		invites, _ = st.Invites(ctx)
	}
	add := func(s Student, x ManualImportedInput, hasExtra bool) {
		if claimed[s.ID] {
			return
		}
		p := Person{ID: s.ID, Source: "directory", Name: s.Name, Batch: s.Batch, Department: s.Department, Session: s.Session, Upazila: s.Upazila}
		if hasExtra {
			p.Union, p.Gender, p.BloodGroup, p.Phone = x.Union, x.Gender, x.BloodGroup, x.Phone
		}
		if iv, ok := invites[s.ID]; ok {
			p.Email = iv.Email
		}
		if pv := a.data().Private[s.ID]; pv != nil { // the original form's contact columns, admins only (see personView)
			if p.Phone == "" {
				p.Phone = pv["phone"]
			}
			if p.Email == "" {
				p.Email = pv["email"]
			}
			if p.BloodGroup == "" {
				p.BloodGroup = pv["bloodGroup"]
			}
			p.Extra = pv
		}
		_, p.Verified = reviews[s.ID]
		people = append(people, p)
	}
	for _, m := range manual {
		add(Student{ID: m.ID, Name: m.Name, Batch: m.Batch, Department: m.Department, Session: m.Session, Upazila: m.Upazila},
			ManualImportedInput{Union: m.Union, Gender: m.Gender, BloodGroup: m.BloodGroup, Phone: m.Phone}, true)
	}
	for _, s := range a.data().Students {
		x, has := edits[s.ID]
		if has {
			s.Name, s.Batch, s.Department, s.Session, s.Upazila = x.Name, x.Batch, x.Department, x.Session, x.Upazila
		}
		add(s, x, has)
	}
	return people
}

// directoryStudents keeps the older callers (counts, map) on the same single list.
func (a *App) directoryStudents(ctx context.Context) []Student {
	ps := a.directoryPeople(ctx)
	out := make([]Student, 0, len(ps))
	for _, p := range ps {
		out = append(out, Student{ID: p.ID, Name: p.Name, Batch: p.Batch, Department: p.Department, Session: p.Session, Upazila: p.Upazila})
	}
	return out
}

func (a *App) students(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	v := a.whoIsViewing(r)
	pg, limit := paging(r, 48)
	batch, _ := strconv.Atoi(q.Get("batch"))
	d := a.data()
	all := []Person{}
	for _, p := range a.directoryPeople(r.Context()) {
		if !d.graduated(p.Batch) { // graduated batches are on the Alumni page
			all = append(all, p)
		}
	}
	out := []Person{}
	for _, s := range all {
		if batch > 0 && (s.Batch == nil || *s.Batch != batch) {
			continue
		}
		if d := q.Get("department"); d != "" && s.Department != d {
			continue
		}
		if u := q.Get("upazila"); u != "" && s.Upazila != u {
			continue
		}
		if t := strings.TrimSpace(q.Get("q")); t != "" && !contains(s.Name, t) && !contains(s.Department, t) {
			continue
		}
		out = append(out, s)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	lo, hi, pages := window(len(out), pg, limit)
	batches, depts := map[int]int{}, map[string]int{}
	for _, s := range all {
		if s.Batch != nil {
			batches[*s.Batch]++
		}
		depts[s.Department]++
	}
	items := make([]personView, 0, hi-lo)
	for _, p := range out[lo:hi] {
		items = append(items, p.view(v))
	}
	writeJSON(w, 200, map[string]any{
		"items": items, "total": len(out), "page": pg, "pages": pages, "sample": a.data().Sample, "view": v.Kind, "alumniUpToBatch": d.AlumniUpTo,
		"facets": map[string]any{"batches": batches, "departments": depts},
	})
}

func (a *App) studentOne(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	v := a.whoIsViewing(r)
	// an admin may open any member, including one who is still pending or chose not to be listed
	if uid, ok := strings.CutPrefix(id, "m-"); ok && v.Kind == "admin" && a.Auth != nil && uuidRx.MatchString(uid) {
		if p, err := a.Auth.Store.ProfileByUser(r.Context(), uid); err == nil {
			email := ""
			if u, err := a.Auth.Store.UserByID(r.Context(), uid); err == nil {
				email = u.Email
			}
			x := personFromProfile(p, email)
			x.PhotoVer = a.photoVersions(r.Context())[uid]
			writeJSON(w, 200, x.view(v))
			return
		}
	}
	for _, p := range a.directoryPeople(r.Context()) {
		if p.ID == id {
			writeJSON(w, 200, p.view(v))
			return
		}
	}
	apiError(w, 404, "student not found")
}
