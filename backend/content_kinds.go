package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
)

// Events, FAQ questions, departments and upazilas are editorial entries (cms_entries) like posts and places, so admins
// create, edit, publish and archive them from the panel and the public site reads them from the database.
const (
	KindEvent      = "event"
	KindFAQ        = "faq"
	KindDepartment = "department"
	KindUpazila    = "upazila"
)

func init() {
	kindParsers[KindEvent] = parseEvent
	kindParsers[KindFAQ] = parseFAQ
	kindParsers[KindDepartment] = parseDepartment
	kindParsers[KindUpazila] = parseUpazila
}

type EventData struct {
	TitleEn   string `json:"titleEn"`
	TitleBn   string `json:"titleBn"`
	Date      string `json:"date"`    // YYYY-MM-DD
	EndDate   string `json:"endDate"` // optional, for events over several days
	Time      string `json:"time"`
	Venue     string `json:"venue"`
	SummaryEn string `json:"summaryEn"`
	SummaryBn string `json:"summaryBn"`
	Image     string   `json:"image"`
	Gallery   []string `json:"gallery,omitempty"` // more photos of the event (uploaded or bundled), shown on its page
	Link      string   `json:"link"`              // registration or details page
}

type FAQData struct {
	QEn string `json:"qEn"`
	QBn string `json:"qBn"`
	AEn string `json:"aEn"`
	ABn string `json:"aBn"`
}

type DepartmentData struct {
	Name string `json:"name"`
}

var timeRx = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

func parseEvent(raw json.RawMessage, b *entryBody) (EntryInput, map[string]string) {
	var d EventData
	if err := json.Unmarshal(raw, &d); err != nil {
		return EntryInput{}, map[string]string{"data": "invalid"}
	}
	errs := map[string]string{}
	trimAll(&d.TitleEn, &d.TitleBn, &d.Date, &d.EndDate, &d.Time, &d.Venue, &d.SummaryEn, &d.SummaryBn, &d.Image, &d.Link)
	if d.TitleEn == "" && d.TitleBn == "" {
		errs["titleEn"] = "Add a title in at least one language."
	}
	tooLong(errs, "titleEn", d.TitleEn, 160, "Title")
	tooLong(errs, "titleBn", d.TitleBn, 160, "Title")
	tooLong(errs, "venue", d.Venue, 160, "Venue")
	tooLong(errs, "summaryEn", d.SummaryEn, 2000, "Description")
	tooLong(errs, "summaryBn", d.SummaryBn, 2000, "Description")
	if d.Date == "" || !validDate(d.Date) {
		errs["date"] = "Choose the date of the event."
	}
	if d.EndDate != "" && (!validDate(d.EndDate) || d.EndDate < d.Date) {
		errs["endDate"] = "The end date must be on or after the start date."
	}
	if d.Time != "" && !timeRx.MatchString(d.Time) {
		errs["time"] = "Use a time such as 17:30."
	}
	if d.Link != "" && !validURL(d.Link) {
		errs["link"] = "Use a full http(s) link."
	}
	if !validImageRef(d.Image) {
		errs["image"] = "Upload the image again."
	}
	if len(d.Gallery) > 24 {
		errs["gallery"] = "At most 24 photos."
	}
	for _, g := range d.Gallery {
		if g == "" || !validImageRef(g) {
			errs["gallery"] = "Upload the photos again."
		}
	}
	if b.Slug == "" {
		b.Slug = slugify(firstNonEmpty(d.TitleEn, d.Date))
	}
	if !validSlug(b.Slug) {
		errs["slug"] = "Use 3-80 lowercase letters, digits and dashes."
	}
	out, _ := json.Marshal(d)
	return EntryInput{Kind: KindEvent, Slug: b.Slug, Title: firstNonEmpty(d.TitleEn, d.TitleBn), Featured: b.Featured, SortOrder: b.SortOrder, Data: out}, errs
}

func parseFAQ(raw json.RawMessage, b *entryBody) (EntryInput, map[string]string) {
	var d FAQData
	if err := json.Unmarshal(raw, &d); err != nil {
		return EntryInput{}, map[string]string{"data": "invalid"}
	}
	errs := map[string]string{}
	trimAll(&d.QEn, &d.QBn, &d.AEn, &d.ABn)
	if d.QEn == "" && d.QBn == "" {
		errs["qEn"] = "Write the question in at least one language."
	}
	if d.AEn == "" && d.ABn == "" {
		errs["aEn"] = "Write the answer in at least one language."
	}
	tooLong(errs, "qEn", d.QEn, 300, "Question")
	tooLong(errs, "qBn", d.QBn, 300, "Question")
	tooLong(errs, "aEn", d.AEn, 4000, "Answer")
	tooLong(errs, "aBn", d.ABn, 4000, "Answer")
	out, _ := json.Marshal(d)
	return EntryInput{Kind: KindFAQ, Title: firstNonEmpty(d.QEn, d.QBn), SortOrder: b.SortOrder, Data: out}, errs
}

func parseDepartment(raw json.RawMessage, b *entryBody) (EntryInput, map[string]string) {
	var d DepartmentData
	if err := json.Unmarshal(raw, &d); err != nil {
		return EntryInput{}, map[string]string{"data": "invalid"}
	}
	errs := map[string]string{}
	d.Name = strings.Join(strings.Fields(d.Name), " ")
	if len([]rune(d.Name)) < 2 {
		errs["name"] = "Write the department's name."
	}
	tooLong(errs, "name", d.Name, 100, "Name")
	out, _ := json.Marshal(d)
	return EntryInput{Kind: KindDepartment, Title: d.Name, SortOrder: b.SortOrder, Data: out}, errs
}

var upazilaSlugRx = regexp.MustCompile(`^[a-z][a-z0-9-]{1,40}$`)

func parseUpazila(raw json.RawMessage, b *entryBody) (EntryInput, map[string]string) {
	var d Upazila
	if err := json.Unmarshal(raw, &d); err != nil {
		return EntryInput{}, map[string]string{"data": "invalid"}
	}
	errs := map[string]string{}
	trimAll(&d.Slug, &d.NameBn, &d.NameEn, &d.Source, &d.UnionSource, &d.LastVerified, &d.Note)
	if b.Slug != "" {
		d.Slug = b.Slug
	}
	if !upazilaSlugRx.MatchString(d.Slug) {
		errs["slug"] = "Use a short lowercase key such as kasba."
	}
	if d.NameEn == "" || d.NameBn == "" {
		errs["nameEn"] = "Write the name in Bangla and English."
	}
	clean := []string{}
	for _, u := range d.Unions {
		if u = strings.TrimSpace(u); u != "" {
			clean = append(clean, u)
		}
	}
	d.Unions = clean
	if len(d.Unions) > 60 {
		errs["unions"] = "At most 60 unions."
	}
	if d.Source != "" && !validURL(d.Source) {
		errs["source"] = "Use a full http(s) link."
	}
	d.Members, d.AlumniCount, d.Places = 0, 0, 0 // counted from the data, never stored
	out, _ := json.Marshal(d)
	return EntryInput{Kind: KindUpazila, Slug: d.Slug, Title: d.NameEn, SortOrder: b.SortOrder, Data: out}, errs
}

// ---------------------------------------------------------------- public reading

// publishedOf lists the published entries of one kind in their admin-set order.
func (a *App) publishedOf(ctx context.Context, kind string) ([]Entry, error) {
	all := []Entry{}
	for page := 1; page <= 50; page++ { // the store pages at most 100 at a time
		items, total, err := a.Auth.Store.ListEntries(ctx, EntryQuery{Kind: kind, Public: true, Sort: "order", Limit: 100, Page: page})
		if err != nil {
			return nil, err
		}
		all = append(all, items...)
		if len(items) < 100 || len(all) >= total {
			break
		}
	}
	return all, nil
}

type eventOut struct {
	EventData
	Slug        string   `json:"slug"`
	ImageURL    string   `json:"imageUrl,omitempty"`
	GalleryURLs []string `json:"galleryUrls,omitempty"` // same order as Gallery; "" where the photo is a bundled one
	Featured    bool     `json:"featured"`
	Summary     string   `json:"summary"` // kept for older clients: the English description, or the Bangla one
}

func (a *App) eventFromEntry(e Entry) eventOut {
	var d EventData
	_ = json.Unmarshal(e.Data, &d)
	o := eventOut{EventData: d, Slug: e.Slug, Featured: e.Featured, Summary: firstNonEmpty(d.SummaryEn, d.SummaryBn)}
	if u := a.mediaURL(d.Image); u != "" { // an uploaded picture; otherwise Image is a bundled picture id
		o.ImageURL, o.Image = u, ""
	}
	if len(d.Gallery) > 0 {
		o.GalleryURLs = make([]string, len(d.Gallery))
		for i, g := range d.Gallery {
			o.GalleryURLs[i] = a.mediaURL(g)
		}
	}
	return o
}

// publicEvent is one published event by its slug, for the event's own page.
func (a *App) publicEvent(w http.ResponseWriter, r *http.Request) {
	if a.Auth == nil {
		apiError(w, http.StatusNotFound, "not_found")
		return
	}
	e, err := a.Auth.Store.GetEntry(r.Context(), KindEvent, r.PathValue("slug"), true)
	if err != nil {
		apiError(w, http.StatusNotFound, "not_found")
		return
	}
	writeJSON(w, 200, a.eventFromEntry(e))
}

func (a *App) publicEvents(w http.ResponseWriter, r *http.Request) {
	if a.Auth == nil {
		writeJSON(w, 200, map[string]any{"items": a.data().Events})
		return
	}
	items, err := a.publishedOf(r.Context(), KindEvent)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "could not load events")
		return
	}
	out := make([]eventOut, 0, len(items))
	for _, e := range items {
		out = append(out, a.eventFromEntry(e))
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Date < out[j].Date })
	writeJSON(w, 200, map[string]any{"items": out})
}

func (a *App) publicFAQ(w http.ResponseWriter, r *http.Request) {
	if a.Auth == nil {
		writeJSON(w, 200, map[string]any{"items": a.data().FAQs})
		return
	}
	items, err := a.publishedOf(r.Context(), KindFAQ)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "could not load questions")
		return
	}
	out := make([]FAQData, 0, len(items))
	for _, e := range items {
		var d FAQData
		_ = json.Unmarshal(e.Data, &d)
		out = append(out, d)
	}
	writeJSON(w, 200, map[string]any{"items": out})
}

// ---------------------------------------------------------------- reference data in memory, refreshed from the database

// referenceFromDB reads the published departments and upazilas, and the published places (only to count them per upazila).
// ok is false when the database holds no upazilas yet (the bundled files are then kept).
func (a *App) referenceFromDB(ctx context.Context) (depts []string, ups []Upazila, places []Place, ok bool, err error) {
	ds, err := a.publishedOf(ctx, KindDepartment)
	if err != nil {
		return nil, nil, nil, false, err
	}
	for _, e := range ds {
		var d DepartmentData
		if json.Unmarshal(e.Data, &d) == nil && d.Name != "" {
			depts = append(depts, d.Name)
		}
	}
	sort.Strings(depts)
	us, err := a.publishedOf(ctx, KindUpazila)
	if err != nil {
		return nil, nil, nil, false, err
	}
	for _, e := range us {
		var u Upazila
		if json.Unmarshal(e.Data, &u) == nil && u.Slug != "" {
			ups = append(ups, u)
		}
	}
	for _, p := range a.publishedPlaces(&http.Request{}) {
		places = append(places, p.Place)
	}
	return depts, ups, places, len(ups) > 0, nil
}

// recount derives the per-upazila counts from the current lists, on a fresh copy of the upazilas.
func recount(s *Store) {
	ups := make([]Upazila, len(s.Upazilas))
	copy(ups, s.Upazilas)
	for i := range ups {
		ups[i].Members, ups[i].AlumniCount, ups[i].Places = 0, 0, 0
		for _, st := range s.Students {
			if st.Upazila == ups[i].Slug {
				ups[i].Members++
			}
		}
		for _, al := range s.Alumni {
			if al.Upazila == ups[i].Slug {
				ups[i].AlumniCount++
			}
		}
		for _, p := range s.Places {
			if p.Upazila == ups[i].Slug {
				ups[i].Places++
			}
		}
	}
	s.Upazilas = ups
}

// reloadLive refreshes everything the site keeps in memory (directory, alumni, departments, upazilas) from the
// database. It runs at start and after every admin change to those, so changes show at once without a restart.
func (a *App) reloadLive(ctx context.Context) error {
	if a.Auth == nil {
		return nil
	}
	recs, err := a.Auth.Store.DirectoryRecords(ctx)
	if err != nil {
		return fmt.Errorf("directory: %w", err)
	}
	depts, ups, places, refOK, err := a.referenceFromDB(ctx)
	if err != nil {
		return fmt.Errorf("reference data: %w", err)
	}
	upTo, _, err := alumniUpTo(ctx, a.Auth.Store)
	if err != nil {
		return fmt.Errorf("alumni setting: %w", err)
	}
	a.updateData(func(s *Store) {
		if len(recs) > 0 || s.StudentsFromDB || s.AlumniFromDB {
			applyDirectoryRecords(s, recs)
		}
		if refOK {
			s.Upazilas, s.Places = ups, places
		}
		if len(depts) > 0 {
			s.Depts = depts
		}
		s.AlumniUpTo = upTo
		recount(s)
	})
	return nil
}

func (a *App) isLiveKind(kind string) bool {
	return kind == KindDepartment || kind == KindUpazila || kind == KindPlace
}

// ---------------------------------------------------------------- one-time copy of the bundled reference files

const seedReferenceMarker = "cms.seed.reference"

// seedReference copies the bundled FAQ, departments, upazilas and events into the database once, published. Like the
// legacy content seed it never runs again, so an admin's later edits and deletions stay.
func seedReference(ctx context.Context, s AuthStore, local *Store) error {
	done, err := s.HasAuditAction(ctx, seedReferenceMarker)
	if err != nil || done {
		return err
	}
	create := func(in EntryInput) error {
		e, err := s.CreateEntry(ctx, "", in)
		if err != nil {
			return fmt.Errorf("seed %s %s: %w", in.Kind, in.Title, err)
		}
		_, err = s.SetEntryStatus(ctx, "", e.ID, "publish")
		return err
	}
	for i, f := range local.FAQs {
		d, _ := json.Marshal(FAQData{QEn: f.QEn, QBn: f.QBn, AEn: f.AEn, ABn: f.ABn})
		order := i
		if err := create(EntryInput{Kind: KindFAQ, Title: firstNonEmpty(f.QEn, f.QBn), SortOrder: &order, Data: d}); err != nil {
			return err
		}
	}
	for i, name := range local.Depts {
		d, _ := json.Marshal(DepartmentData{Name: name})
		order := i
		if err := create(EntryInput{Kind: KindDepartment, Title: name, SortOrder: &order, Data: d}); err != nil {
			return err
		}
	}
	for i, u := range local.Upazilas {
		u.Members, u.AlumniCount, u.Places = 0, 0, 0
		d, _ := json.Marshal(u)
		order := i
		if err := create(EntryInput{Kind: KindUpazila, Slug: u.Slug, Title: u.NameEn, SortOrder: &order, Data: d}); err != nil {
			return err
		}
	}
	for i, ev := range local.Events {
		raw, _ := json.Marshal(ev)
		var d EventData
		_ = json.Unmarshal(raw, &d)
		order := i
		slug := slugify(firstNonEmpty(d.TitleEn, d.Date))
		if err := create(EntryInput{Kind: KindEvent, Slug: slug, Title: firstNonEmpty(d.TitleEn, d.TitleBn), SortOrder: &order, Data: mustJSON(d)}); err != nil {
			return err
		}
	}
	return s.Audit(ctx, "", seedReferenceMarker, "content", "", map[string]any{"faq": len(local.FAQs), "departments": len(local.Depts), "upazilas": len(local.Upazilas), "events": len(local.Events)})
}

func mustJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
