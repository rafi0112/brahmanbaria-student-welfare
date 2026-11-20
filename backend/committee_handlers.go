package main

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

func (a *App) committeeRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	m.HandleFunc("GET /api/v1/executive-committee", h(a.publicCommittee))
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/admin/committees", adm(a.listCommittees))
	m.HandleFunc("POST /api/v1/admin/committees", adm(a.createCommittee))
	m.HandleFunc("GET /api/v1/admin/committees/{id}", adm(a.committeeOne))
	m.HandleFunc("PATCH /api/v1/admin/committees/{id}", adm(a.updateCommittee))
	m.HandleFunc("POST /api/v1/admin/committees/{id}/{action}", adm(a.committeeAction))
	m.HandleFunc("POST /api/v1/admin/committees/{id}/members", adm(a.addExecutive))
	m.HandleFunc("PATCH /api/v1/admin/executives/{id}", adm(a.updateExecutive))
	m.HandleFunc("POST /api/v1/admin/executives/{id}/remove", adm(a.removeExecutive))
	m.HandleFunc("POST /api/v1/admin/executive-photo", adm(func(w http.ResponseWriter, r *http.Request, u User) {
		a.uploadImage(w, r, u, photoBucket, a.Auth.PhotoBase)
	}))
}

func (a *App) photoURL(path string) string {
	if path == "" || a.Auth.PhotoBase == "" {
		return ""
	}
	return a.Auth.PhotoBase + path
}

func (a *App) withPhotoURLs(xs []Executive) []Executive {
	var vers map[string]string
	for i := range xs {
		xs[i].PhotoURL = a.photoURL(xs[i].Photo)
		if xs[i].PhotoURL == "" && xs[i].UserID != "" { // no photo of its own: the linked member's profile photo
			if vers == nil {
				vers = a.photoVersions(context.Background())
			}
			xs[i].PhotoURL = studentPhotoURL(xs[i].UserID, vers[xs[i].UserID])
		}
	}
	return xs
}

// publicExecutive is the only shape the public API ever returns: no account id, no email, no internal path.
type publicExecutive struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Designation string `json:"designation"`
	Bio         string `json:"bio"`
	PhotoURL    string `json:"photoUrl"`
	Verified    bool   `json:"verified"` // the seat is linked to an approved member whose email is confirmed
	// who they are and a message in their own words; empty details come from the linked member's approved profile.
	// Never a phone number, email or address.
	Department string `json:"department,omitempty"`
	Batch      string `json:"batch,omitempty"`
	Session    string `json:"session,omitempty"`
	Upazila    string `json:"upazila,omitempty"`
	UpazilaEn  string `json:"upazilaEn,omitempty"`
	Message    string `json:"message,omitempty"`
	// English versions (empty shows the main text)
	DesignationEn string `json:"designationEn,omitempty"`
	BioEn         string `json:"bioEn,omitempty"`
	MessageEn     string `json:"messageEn,omitempty"`
}

// executiveDetails fills a seat's empty details: first from the linked member's approved profile, then from the
// student and alumni lists when exactly one person there has the seat's name (honorifics, dots and spacing ignored).
// The upazila typed by an admin is shown as written; one from a record is shown by its Bangla and English names.
func (a *App) executiveDetails(ctx context.Context, x Executive, people *personIndex) (ExecDetails, string) {
	d := x.Details
	en := d.Upazila
	full := func() bool { return d.Department != "" && d.Batch != "" && d.Session != "" && d.Upazila != "" }
	upazila := func(slug string) {
		if d.Upazila != "" || slug == "" {
			return
		}
		for _, u := range a.data().Upazilas {
			if u.Slug == slug {
				d.Upazila, en = u.NameBn, u.NameEn
				return
			}
		}
	}
	fill := func(dept string, batch int, session, slug string) {
		if d.Department == "" {
			d.Department = dept
		}
		if d.Batch == "" && batch > 0 {
			d.Batch = strconv.Itoa(batch)
		}
		if d.Session == "" {
			d.Session = session
		}
		upazila(slug)
	}
	if full() {
		return d, en
	}
	if x.UserID != "" {
		if p, err := a.Auth.Store.ProfileByUser(ctx, x.UserID); err == nil && p != nil && p.Status == StatusApproved {
			fill(p.Department, p.Batch, p.Session, p.Upazila)
		}
	}
	if !full() && people != nil {
		if r, ok := people.find(x.Name); ok {
			fill(r.department, r.batch, r.session, r.upazila)
		}
	}
	return d, en
}

// personIndex: the student and alumni lists by a loose form of the name, for filling committee seats.
type personRecord struct {
	department, session, upazila string
	batch                        int
}

type personIndex struct{ byName map[string][]personRecord }

var nameHonorific = regexp.MustCompile(`^(?:মো|মোহা|মোছা|মোসা|মোসাম্মৎ|মোহাম্মদ|মুহাম্মদ|ড|ডা|অধ্যাপক|প্রফেসর|md|mst|mohammad|muhammad|mohammed|dr|prof|mr|mrs|ms)\s+`)

// looseName: lower case, no dots, colons or visarga (so মোঃ is মো, Dr. is dr), single spaces, honorifics removed.
func looseName(name string) string {
	n := strings.ToLower(strings.TrimSpace(name))
	n = strings.NewReplacer(".", " ", ":", " ", "ঃ", " ", ",", " ").Replace(n)
	n = strings.Join(strings.Fields(n), " ")
	for prev := ""; prev != n; {
		prev = n
		n = strings.TrimSpace(nameHonorific.ReplaceAllString(n+" ", ""))
	}
	return n
}

func (a *App) personIndex(ctx context.Context) *personIndex {
	ix := &personIndex{byName: map[string][]personRecord{}}
	add := func(name string, r personRecord) {
		if k := looseName(name); k != "" {
			ix.byName[k] = append(ix.byName[k], r)
		}
	}
	for _, s := range a.directoryStudents(ctx) {
		b := 0
		if s.Batch != nil {
			b = *s.Batch
		}
		add(s.Name, personRecord{department: s.Department, session: s.Session, upazila: s.Upazila, batch: b})
	}
	for _, al := range a.shownAlumni(ctx) {
		b := 0
		if al.Batch != nil {
			b = *al.Batch
		}
		add(al.Name, personRecord{department: al.Department, upazila: al.Upazila, batch: b})
	}
	return ix
}

// find returns the one record with this name; two people of the same name (and different details) give nothing.
func (ix *personIndex) find(name string) (personRecord, bool) {
	rs := ix.byName[looseName(name)]
	if len(rs) == 0 {
		return personRecord{}, false
	}
	for _, r := range rs[1:] {
		if r.batch != rs[0].batch || r.department != rs[0].department {
			return personRecord{}, false
		}
	}
	out := rs[0]
	for _, r := range rs[1:] { // the same person in both lists: take whatever either has
		if out.session == "" {
			out.session = r.session
		}
		if out.upazila == "" {
			out.upazila = r.upazila
		}
	}
	return out, true
}

type publicCommittee struct {
	Name          string `json:"name"`
	Term          string `json:"term"`
	Description   string `json:"description"`
	StartsOn      string `json:"startsOn"`
	EndsOn        string `json:"endsOn"`
	NameEn        string `json:"nameEn,omitempty"`
	TermEn        string `json:"termEn,omitempty"`
	DescriptionEn string `json:"descriptionEn,omitempty"`
}

func (a *App) publicCommittee(w http.ResponseWriter, r *http.Request) {
	c, xs, err := a.Auth.Store.PublishedCommittee(r.Context())
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, 200, map[string]any{"committee": nil, "members": []publicExecutive{}})
		return
	}
	if err != nil {
		log.Printf("published committee: %v", err)
		apiError(w, http.StatusInternalServerError, "could not load the committee")
		return
	}
	out := make([]publicExecutive, 0, len(xs))
	people := a.personIndex(r.Context())
	xs = a.withPhotoURLs(xs) // the committee photo, else the linked member's own profile photo
	for _, x := range xs {
		d, upEn := a.executiveDetails(r.Context(), x, people)
		out = append(out, publicExecutive{ID: x.ID, Name: x.Name, Designation: x.Designation, Bio: x.Bio, PhotoURL: x.PhotoURL, Verified: a.accountVerified(r.Context(), x.UserID),
			Department: d.Department, Batch: d.Batch, Session: d.Session, Upazila: d.Upazila, UpazilaEn: upEn, Message: d.Message,
			DesignationEn: d.DesignationEn, BioEn: d.BioEn, MessageEn: d.MessageEn})
	}
	writeJSON(w, 200, map[string]any{"committee": publicCommittee{c.Name, c.Term, c.Description, c.StartsOn, c.EndsOn, c.NameEn, c.TermEn, c.DescriptionEn}, "members": out})
}

func (a *App) listCommittees(w http.ResponseWriter, r *http.Request, _ User) {
	items, err := a.Auth.Store.ListCommittees(r.Context())
	if err != nil {
		log.Printf("list committees: %v", err)
		apiError(w, http.StatusInternalServerError, "could not load committees")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (a *App) committeeOne(w http.ResponseWriter, r *http.Request, _ User) {
	c, xs, err := a.Auth.Store.CommitteeDetail(r.Context(), r.PathValue("id"))
	if err != nil {
		a.committeeFail(w, err)
		return
	}
	xs = a.withPhotoURLs(xs)
	people := a.personIndex(r.Context())
	for i := range xs {
		bare := xs[i]
		bare.Details = ExecDetails{}
		found, en := a.executiveDetails(r.Context(), bare, people)
		if found.Upazila != "" && en != "" && en != found.Upazila {
			found.Upazila = found.Upazila + " / " + en
		}
		if found != (ExecDetails{}) {
			xs[i].Found = &found
		}
	}
	writeJSON(w, 200, map[string]any{"committee": c, "members": xs})
}

// committeeFail turns store errors into stable machine-readable codes the UI translates.
func (a *App) committeeFail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		apiError(w, http.StatusNotFound, "not_found")
	case errors.Is(err, ErrUnknownMember):
		apiError(w, http.StatusUnprocessableEntity, "unknown_member")
	case errors.Is(err, ErrDuplicateExecutive):
		apiError(w, http.StatusConflict, "duplicate_executive")
	case errors.Is(err, ErrCommitteeArchived):
		apiError(w, http.StatusConflict, "committee_archived")
	case errors.Is(err, ErrEmptyCommittee):
		apiError(w, http.StatusConflict, "empty_committee")
	case errors.Is(err, ErrBadState):
		apiError(w, http.StatusConflict, "bad_state")
	case errors.Is(err, ErrReorderMismatch):
		apiError(w, http.StatusUnprocessableEntity, "reorder_mismatch")
	default:
		log.Printf("committee: %v", err)
		apiError(w, http.StatusInternalServerError, "could not save the change")
	}
}

func fieldErrors(w http.ResponseWriter, errs map[string]string) bool {
	if len(errs) == 0 {
		return false
	}
	writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation", "fields": errs})
	return true
}

func (a *App) createCommittee(w http.ResponseWriter, r *http.Request, u User) {
	var in CommitteeInput
	if !decode(w, r, &in) || fieldErrors(w, in.clean()) {
		return
	}
	c, err := a.Auth.Store.CreateCommittee(r.Context(), u.ID, in)
	if err != nil {
		a.committeeFail(w, err)
		return
	}
	writeJSON(w, 201, c)
}

func (a *App) updateCommittee(w http.ResponseWriter, r *http.Request, u User) {
	var in CommitteeInput
	if !decode(w, r, &in) || fieldErrors(w, in.clean()) {
		return
	}
	c, err := a.Auth.Store.UpdateCommittee(r.Context(), u.ID, r.PathValue("id"), in)
	if err != nil {
		a.committeeFail(w, err)
		return
	}
	writeJSON(w, 200, c)
}

// committeeAction handles publish, unpublish, archive and reorder.
func (a *App) committeeAction(w http.ResponseWriter, r *http.Request, u User) {
	id, action := r.PathValue("id"), r.PathValue("action")
	switch action {
	case "publish", "unpublish", "archive", "restore":
		c, err := a.Auth.Store.SetCommitteeStatus(r.Context(), u.ID, id, action)
		if err != nil {
			a.committeeFail(w, err)
			return
		}
		writeJSON(w, 200, c)
	case "reorder":
		var body struct {
			IDs []string `json:"ids"`
		}
		if !decode(w, r, &body) {
			return
		}
		if err := a.Auth.Store.ReorderExecutives(r.Context(), u.ID, id, body.IDs); err != nil {
			a.committeeFail(w, err)
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
	default:
		apiError(w, http.StatusNotFound, "not_found")
	}
}

func (a *App) addExecutive(w http.ResponseWriter, r *http.Request, u User) {
	var in ExecutiveInput
	if !decode(w, r, &in) || fieldErrors(w, in.clean()) {
		return
	}
	x, err := a.Auth.Store.AddExecutive(r.Context(), u.ID, r.PathValue("id"), in)
	if err != nil {
		a.committeeFail(w, err)
		return
	}
	x.PhotoURL = a.photoURL(x.Photo)
	writeJSON(w, 201, x)
}

func (a *App) updateExecutive(w http.ResponseWriter, r *http.Request, u User) {
	var p ExecutivePatch
	if !decode(w, r, &p) || fieldErrors(w, p.clean()) {
		return
	}
	x, err := a.Auth.Store.UpdateExecutive(r.Context(), u.ID, r.PathValue("id"), p)
	if err != nil {
		a.committeeFail(w, err)
		return
	}
	x.PhotoURL = a.photoURL(x.Photo)
	writeJSON(w, 200, x)
}

func (a *App) removeExecutive(w http.ResponseWriter, r *http.Request, u User) {
	if err := a.Auth.Store.RemoveExecutive(r.Context(), u.ID, r.PathValue("id")); err != nil {
		a.committeeFail(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func bearerToken(r *http.Request) string {
	h := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return ""
}

// uploadImage accepts either a file (multipart field "file") or a Google Drive link (field "driveUrl"). Either way the
// bytes are validated as a real JPEG/PNG, re-encoded, stored in the photo bucket under a random name, and only that
// name is returned for saving in PostgreSQL.
func (a *App) uploadImage(w http.ResponseWriter, r *http.Request, u User, bucket, base string) {
	token := bearerToken(r)
	if a.Auth.Images == nil || token == "" {
		apiError(w, http.StatusServiceUnavailable, "storage_off")
		return
	}
	if !a.Auth.uploadUser.Allow(u.ID) {
		apiError(w, http.StatusTooManyRequests, "rate_limited")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxPhotoBytes+(512<<10))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			apiError(w, http.StatusRequestEntityTooLarge, "photo_too_big")
			return
		}
		apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll() //nolint:errcheck
	}

	var data []byte
	var err error
	if link := strings.TrimSpace(r.FormValue("imageUrl")); link == "" && strings.TrimSpace(r.FormValue("driveUrl")) != "" {
		// older clients send the link as driveUrl; it is handled exactly like imageUrl
		data, err = a.fetchLinked(r.Context(), strings.TrimSpace(r.FormValue("driveUrl")))
		if !a.linkFailed(w, err) {
			return
		}
	} else if link != "" {
		data, err = a.fetchLinked(r.Context(), link)
		if !a.linkFailed(w, err) {
			return
		}
	} else {
		f, _, err := r.FormFile("file")
		if err != nil {
			apiError(w, http.StatusUnprocessableEntity, "no_photo")
			return
		}
		defer f.Close()
		data, err = io.ReadAll(io.LimitReader(f, maxPhotoBytes+1))
		if err != nil {
			apiError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}

	side := mediaMaxSide
	if bucket == photoBucket {
		side = personMaxSide // portraits are shown small
	}
	clean, ext, ct, err := storableImage(data, side)
	if err != nil {
		switch {
		case errors.Is(err, ErrPhotoTooBig):
			apiError(w, http.StatusRequestEntityTooLarge, "photo_too_big")
		case errors.Is(err, ErrPhotoDimensions):
			apiError(w, http.StatusUnprocessableEntity, "photo_dimensions")
		default:
			apiError(w, http.StatusUnprocessableEntity, "photo_invalid")
		}
		return
	}
	name := contentName(clean, ext)
	if err := a.Auth.Images.Put(r.Context(), token, bucket, name, ct, clean); err != nil {
		log.Printf("photo upload: %v", err)
		apiError(w, http.StatusBadGateway, "storage_failed")
		return
	}
	writeJSON(w, 201, map[string]string{"path": name, "url": base + name})
}

// fetchLinked downloads an image from a link: Google Drive share links keep their dedicated handling, every other
// public https link goes through the restricted fetcher.
func (a *App) fetchLinked(ctx context.Context, link string) ([]byte, error) {
	if u, perr := url.Parse(link); perr == nil && strings.EqualFold(u.Hostname(), "drive.google.com") {
		id, err := driveFileID(link)
		if err != nil {
			return nil, err
		}
		allow := driveHostAllowed
		if a.Auth.DriveAllowHost != nil {
			allow = a.Auth.DriveAllowHost
		}
		base := a.Auth.DriveBase
		if base == "" {
			base = "https://drive.google.com"
		}
		return fetchDriveImage(ctx, base, id, allow)
	}
	return fetchImageURL(ctx, link, a.Auth.AllowPrivateImageHosts)
}

// linkFailed writes the matching error response and reports whether the download succeeded.
func (a *App) linkFailed(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return true
	case errors.Is(err, ErrDriveLink):
		apiError(w, http.StatusUnprocessableEntity, "drive_link")
	case errors.Is(err, ErrDriveNotPublic):
		apiError(w, http.StatusUnprocessableEntity, "drive_not_public")
	case errors.Is(err, ErrDriveUnreachable):
		apiError(w, http.StatusBadGateway, "drive_unreachable")
	case errors.Is(err, ErrImageLink):
		apiError(w, http.StatusUnprocessableEntity, "image_link")
	case errors.Is(err, ErrPhotoTooBig):
		apiError(w, http.StatusRequestEntityTooLarge, "photo_too_big")
	default:
		apiError(w, http.StatusBadGateway, "image_unreachable")
	}
	return false
}

// accountVerified reports whether a linked account is an approved, active member with a confirmed email.
func (a *App) accountVerified(ctx context.Context, userID string) bool {
	if userID == "" || a.Auth == nil {
		return false
	}
	u, err := a.Auth.Store.UserByID(ctx, userID)
	if err != nil || !u.EmailVerified || u.Disabled {
		return false
	}
	p, err := a.Auth.Store.ProfileByUser(ctx, userID)
	return err == nil && p != nil && p.Status == StatusApproved
}
