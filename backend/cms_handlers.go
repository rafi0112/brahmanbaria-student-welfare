package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

var (
	legacyImageRx = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,59}$`)
	categoryRx    = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)
)

// ---------------------------------------------------------------- typed documents

type BlogData struct {
	TitleBn         string   `json:"titleBn"`
	TitleEn         string   `json:"titleEn"`
	ExcerptBn       string   `json:"excerptBn"`
	ExcerptEn       string   `json:"excerptEn"`
	BodyBn          string   `json:"bodyBn"`
	BodyEn          string   `json:"bodyEn"`
	Category        string   `json:"category"`
	Tags            []string `json:"tags"`
	Author          string   `json:"author"`
	Image           string   `json:"image"`
	ImageAlt        string   `json:"imageAlt"`
	Date            string   `json:"date"`
	ReadMin         int      `json:"readMin"`
	MetaTitle       string   `json:"metaTitle"`
	MetaDescription string   `json:"metaDescription"`
	Sample          bool     `json:"sample"`
}

type PlaceData struct {
	NameBn       string   `json:"nameBn"`
	NameEn       string   `json:"nameEn"`
	Category     string   `json:"category"`
	Upazila      string   `json:"upazila"`
	Address      string   `json:"address"`
	Lat          *float64 `json:"lat"`
	Lng          *float64 `json:"lng"`
	MapLink      string   `json:"mapLink"`
	Images       []string `json:"images"`
	Summary      string   `json:"summary"`
	Details      string   `json:"details"`
	Period       string   `json:"period"`
	Visitor      string   `json:"visitor"`
	Facts        []Fact   `json:"facts"`
	Verified     bool     `json:"verified"`
	Sources      []string `json:"sources"`
	LastVerified string   `json:"lastVerified"`
}

type AlbumData struct {
	TitleBn     string `json:"titleBn"`
	TitleEn     string `json:"titleEn"`
	Description string `json:"description"`
	Cover       string `json:"cover"`
}

type ImageData struct {
	Image     string `json:"image"`
	CaptionBn string `json:"captionBn"`
	CaptionEn string `json:"captionEn"`
	Alt       string `json:"alt"`
	Credit    string `json:"credit"`
	License   string `json:"license"`
	Source    string `json:"source"`
	Category  string `json:"category"`
	EventDate string `json:"eventDate"`
	Sample    bool   `json:"sample"`
}

type entryBody struct {
	Slug      string          `json:"slug"`
	Featured  bool            `json:"featured"`
	SortOrder *int            `json:"sortOrder"`
	ParentID  string          `json:"parentId"`
	Data      json.RawMessage `json:"data"`
	// ExpectedUpdatedAt is the updatedAt the editor was opened with; a mismatch means someone else saved first.
	ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
}

func tooLong(errs map[string]string, key, v string, max int, msg string) {
	if utf8.RuneCountInString(v) > max {
		errs[key] = msg + " (max " + strconv.Itoa(max) + ")"
	}
}

func validURL(s string) bool {
	if s == "" {
		return true
	}
	if len(s) > 500 {
		return false
	}
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func validImageRef(s string) bool {
	return s == "" || photoRx.MatchString(s) || legacyImageRx.MatchString(s)
}

func readMinutes(texts ...string) int {
	words := 0
	for _, t := range texts {
		words += len(strings.Fields(t))
	}
	if m := (words + 199) / 200; m > 1 {
		return m
	}
	return 1
}

func trimAll(ss ...*string) {
	for _, s := range ss {
		*s = strings.TrimSpace(*s)
	}
}

func parseBlog(raw json.RawMessage, b *entryBody) (EntryInput, map[string]string) {
	var d BlogData
	errs := map[string]string{}
	if err := json.Unmarshal(raw, &d); err != nil {
		return EntryInput{}, map[string]string{"data": "invalid"}
	}
	trimAll(&d.TitleBn, &d.TitleEn, &d.ExcerptBn, &d.ExcerptEn, &d.BodyBn, &d.BodyEn, &d.Category, &d.Author, &d.Image, &d.ImageAlt, &d.Date, &d.MetaTitle, &d.MetaDescription)
	if d.TitleEn == "" && d.TitleBn == "" {
		errs["titleEn"] = "Add a title in at least one language."
	}
	tooLong(errs, "titleEn", d.TitleEn, 160, "Title")
	tooLong(errs, "titleBn", d.TitleBn, 160, "Title")
	tooLong(errs, "excerptEn", d.ExcerptEn, 400, "Summary")
	tooLong(errs, "excerptBn", d.ExcerptBn, 400, "Summary")
	tooLong(errs, "bodyEn", d.BodyEn, 60000, "Body")
	tooLong(errs, "bodyBn", d.BodyBn, 60000, "Body")
	tooLong(errs, "metaTitle", d.MetaTitle, 70, "SEO title")
	tooLong(errs, "metaDescription", d.MetaDescription, 200, "SEO description")
	tooLong(errs, "author", d.Author, 80, "Author")
	if d.Category != "" && !categoryRx.MatchString(d.Category) {
		errs["category"] = "Use lowercase letters, digits and dashes."
	}
	if !validImageRef(d.Image) {
		errs["image"] = "Upload the image again."
	}
	if !validDate(d.Date) {
		errs["date"] = "Use a valid date."
	}
	if len(d.Tags) > 12 {
		errs["tags"] = "At most 12 tags."
	}
	for i, t := range d.Tags {
		d.Tags[i] = strings.TrimSpace(t)
		if d.Tags[i] == "" || utf8.RuneCountInString(d.Tags[i]) > 30 {
			errs["tags"] = "Tags must be 1-30 characters."
		}
	}
	if b.Slug == "" {
		b.Slug = slugify(d.TitleEn)
	}
	if !validSlug(b.Slug) {
		errs["slug"] = "Use 3-80 lowercase letters, digits and dashes (for a Bangla-only title, type the URL name)."
	}
	d.ReadMin = readMinutes(d.BodyEn, d.BodyBn)
	title := d.TitleEn
	if title == "" {
		title = d.TitleBn
	}
	out, _ := json.Marshal(d)
	return EntryInput{Kind: KindBlog, Slug: b.Slug, Title: title, Featured: b.Featured, SortOrder: b.SortOrder, Data: out}, errs
}

func parsePlace(raw json.RawMessage, b *entryBody) (EntryInput, map[string]string) {
	var d PlaceData
	errs := map[string]string{}
	if err := json.Unmarshal(raw, &d); err != nil {
		return EntryInput{}, map[string]string{"data": "invalid"}
	}
	trimAll(&d.NameBn, &d.NameEn, &d.Category, &d.Upazila, &d.Address, &d.MapLink, &d.Summary, &d.Details, &d.Period, &d.Visitor, &d.LastVerified)
	if d.NameEn == "" && d.NameBn == "" {
		errs["nameEn"] = "Add a name in at least one language."
	}
	tooLong(errs, "nameEn", d.NameEn, 160, "Name")
	tooLong(errs, "nameBn", d.NameBn, 160, "Name")
	tooLong(errs, "summary", d.Summary, 500, "Summary")
	tooLong(errs, "details", d.Details, 30000, "Description")
	tooLong(errs, "address", d.Address, 200, "Address")
	tooLong(errs, "period", d.Period, 120, "Period")
	tooLong(errs, "visitor", d.Visitor, 500, "Visitor information")
	if d.Category == "" || !categoryRx.MatchString(d.Category) {
		errs["category"] = "Choose a category."
	}
	if (d.Lat == nil) != (d.Lng == nil) {
		errs["lat"] = "Give both latitude and longitude, or neither."
	} else if d.Lat != nil && (*d.Lat < -90 || *d.Lat > 90 || *d.Lng < -180 || *d.Lng > 180) {
		errs["lat"] = "Latitude must be between -90 and 90 and longitude between -180 and 180."
	}
	if !validURL(d.MapLink) {
		errs["mapLink"] = "Use a full http(s) link."
	}
	if !validDate(d.LastVerified) {
		errs["lastVerified"] = "Use a valid date."
	}
	if len(d.Images) > 12 {
		errs["images"] = "At most 12 images."
	}
	for _, im := range d.Images {
		if im == "" || !validImageRef(im) {
			errs["images"] = "Upload the images again."
		}
	}
	if len(d.Sources) > 12 {
		errs["sources"] = "At most 12 sources."
	}
	for i, s := range d.Sources {
		d.Sources[i] = strings.TrimSpace(s)
		if d.Sources[i] == "" || !validURL(d.Sources[i]) {
			errs["sources"] = "Every source must be a full http(s) link."
		}
	}
	if len(d.Facts) > 20 {
		errs["facts"] = "At most 20 facts."
	}
	for i := range d.Facts {
		d.Facts[i].Label, d.Facts[i].Value = strings.TrimSpace(d.Facts[i].Label), strings.TrimSpace(d.Facts[i].Value)
		if d.Facts[i].Label == "" || d.Facts[i].Value == "" || utf8.RuneCountInString(d.Facts[i].Value) > 300 {
			errs["facts"] = "Each fact needs a label and a value (max 300 characters)."
		}
	}
	if b.Slug == "" {
		b.Slug = slugify(d.NameEn)
	}
	if !validSlug(b.Slug) {
		errs["slug"] = "Use 3-80 lowercase letters, digits and dashes."
	}
	title := d.NameEn
	if title == "" {
		title = d.NameBn
	}
	out, _ := json.Marshal(d)
	return EntryInput{Kind: KindPlace, Slug: b.Slug, Title: title, Featured: b.Featured, SortOrder: b.SortOrder, Data: out}, errs
}

func parseAlbum(raw json.RawMessage, b *entryBody) (EntryInput, map[string]string) {
	var d AlbumData
	errs := map[string]string{}
	if err := json.Unmarshal(raw, &d); err != nil {
		return EntryInput{}, map[string]string{"data": "invalid"}
	}
	trimAll(&d.TitleBn, &d.TitleEn, &d.Description, &d.Cover)
	if d.TitleEn == "" && d.TitleBn == "" {
		errs["titleEn"] = "Add a title in at least one language."
	}
	tooLong(errs, "titleEn", d.TitleEn, 120, "Title")
	tooLong(errs, "titleBn", d.TitleBn, 120, "Title")
	tooLong(errs, "description", d.Description, 500, "Description")
	if !validImageRef(d.Cover) {
		errs["cover"] = "Upload the image again."
	}
	if b.Slug == "" {
		b.Slug = slugify(d.TitleEn)
	}
	if b.Slug != "" && !validSlug(b.Slug) {
		errs["slug"] = "Use 3-80 lowercase letters, digits and dashes."
	}
	title := d.TitleEn
	if title == "" {
		title = d.TitleBn
	}
	out, _ := json.Marshal(d)
	return EntryInput{Kind: KindAlbum, Slug: b.Slug, Title: title, Featured: b.Featured, SortOrder: b.SortOrder, Data: out}, errs
}

func parseImage(raw json.RawMessage, b *entryBody) (EntryInput, map[string]string) {
	var d ImageData
	errs := map[string]string{}
	if err := json.Unmarshal(raw, &d); err != nil {
		return EntryInput{}, map[string]string{"data": "invalid"}
	}
	trimAll(&d.Image, &d.CaptionBn, &d.CaptionEn, &d.Alt, &d.Credit, &d.License, &d.Source, &d.Category, &d.EventDate)
	if d.Image == "" || !validImageRef(d.Image) {
		errs["image"] = "Upload an image first."
	}
	if d.Alt == "" && d.CaptionEn == "" && d.CaptionBn == "" {
		errs["alt"] = "Add a caption or alt text so the picture can be described."
	}
	tooLong(errs, "captionEn", d.CaptionEn, 300, "Caption")
	tooLong(errs, "captionBn", d.CaptionBn, 300, "Caption")
	tooLong(errs, "alt", d.Alt, 300, "Alt text")
	tooLong(errs, "credit", d.Credit, 120, "Credit")
	tooLong(errs, "license", d.License, 80, "License")
	if !validURL(d.Source) {
		errs["source"] = "Use a full http(s) link."
	}
	if d.Category != "" && !categoryRx.MatchString(d.Category) {
		errs["category"] = "Use lowercase letters, digits and dashes."
	}
	if !validDate(d.EventDate) {
		errs["eventDate"] = "Use a valid date."
	}
	title := firstNonEmpty(d.CaptionEn, d.CaptionBn, d.Alt, "Image")
	b.Slug = "" // images have no URL name
	out, _ := json.Marshal(d)
	return EntryInput{Kind: KindImage, Title: title, Featured: b.Featured, SortOrder: b.SortOrder, ParentID: strings.TrimSpace(b.ParentID), Data: out}, errs
}

func firstNonEmpty(ss ...string) string {
	for _, s := range ss {
		if s != "" {
			return s
		}
	}
	return ""
}

var kindParsers = map[string]func(json.RawMessage, *entryBody) (EntryInput, map[string]string){
	KindBlog: parseBlog, KindPlace: parsePlace, KindAlbum: parseAlbum, KindImage: parseImage,
}

// ---------------------------------------------------------------- routes

func (a *App) cmsRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/admin/content/{kind}", adm(a.cmsList))
	m.HandleFunc("POST /api/v1/admin/content/{kind}", adm(a.cmsSave))
	m.HandleFunc("POST /api/v1/admin/content/{kind}/reorder", adm(a.cmsReorder))
	m.HandleFunc("POST /api/v1/admin/content/{kind}/bulk", adm(a.cmsBulk))
	m.HandleFunc("GET /api/v1/admin/content/{kind}/{id}", adm(a.cmsOne))
	m.HandleFunc("PATCH /api/v1/admin/content/{kind}/{id}", adm(a.cmsSave))
	m.HandleFunc("POST /api/v1/admin/content/{kind}/{id}/{action}", adm(a.cmsAction))
	m.HandleFunc("POST /api/v1/admin/media", adm(a.uploadMedia))

	m.HandleFunc("GET /api/v1/gallery", h(a.publicGallery))
}

func (a *App) cmsFail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		apiError(w, http.StatusNotFound, "not_found")
	case errors.Is(err, ErrSlugTaken):
		writeJSON(w, http.StatusConflict, map[string]any{"error": "slug_taken", "fields": map[string]string{"slug": "That URL name is already used. Choose another."}})
	case errors.Is(err, ErrParentInvalid):
		apiError(w, http.StatusUnprocessableEntity, "album_invalid")
	case errors.Is(err, ErrBadState):
		apiError(w, http.StatusConflict, "bad_state")
	case errors.Is(err, ErrStale):
		apiError(w, http.StatusConflict, "stale")
	case errors.Is(err, ErrReorderMismatch):
		apiError(w, http.StatusUnprocessableEntity, "reorder_mismatch")
	default:
		log.Printf("cms: %v", err)
		apiError(w, http.StatusInternalServerError, "could not save the change")
	}
}

func kindParam(w http.ResponseWriter, r *http.Request) (string, bool) {
	k := r.PathValue("kind")
	if _, ok := kindParsers[k]; !ok {
		apiError(w, http.StatusNotFound, "not_found")
		return "", false
	}
	return k, true
}

func (a *App) entryOut(e Entry) Entry {
	// uploaded images are referenced by object name; the public URL is added for the admin UI's previews
	var m map[string]any
	if json.Unmarshal(e.Data, &m) != nil {
		return e
	}
	for _, key := range []string{"image", "cover"} {
		if ref, _ := m[key].(string); photoRx.MatchString(ref) {
			m[key+"Url"] = a.mediaURL(ref)
		}
	}
	if imgs, ok := m["images"].([]any); ok {
		urls := make([]string, len(imgs))
		for i, v := range imgs {
			if ref, _ := v.(string); photoRx.MatchString(ref) {
				urls[i] = a.mediaURL(ref)
			}
		}
		m["imageUrls"] = urls
	}
	if b, err := json.Marshal(m); err == nil {
		e.Data = b
	}
	return e
}

func (a *App) mediaURL(ref string) string {
	if a.Auth == nil || a.Auth.MediaBase == "" || !photoRx.MatchString(ref) {
		return ""
	}
	return a.Auth.MediaBase + ref
}

func (a *App) cmsList(w http.ResponseWriter, r *http.Request, _ User) {
	kind, ok := kindParam(w, r)
	if !ok {
		return
	}
	v := r.URL.Query()
	pg, limit := paging(r, 100)
	q := EntryQuery{Kind: kind, Q: strings.TrimSpace(v.Get("q")), Status: v.Get("status"), Parent: v.Get("album"), Featured: v.Get("featured"),
		From: v.Get("from"), To: v.Get("to"), Category: v.Get("category"), Author: v.Get("author"), Upazila: v.Get("upazila"), Sort: v.Get("sort"), Page: pg, Limit: limit}
	if utf8.RuneCountInString(q.Q) > 100 {
		apiError(w, http.StatusBadRequest, "search text is too long")
		return
	}
	if q.Status != "" && q.Status != "all" && q.Status != StatusDraft && q.Status != StatusPublished && q.Status != StatusArchived {
		apiError(w, http.StatusBadRequest, "invalid status")
		return
	}
	items, total, err := a.Auth.Store.ListEntries(r.Context(), q)
	if err != nil {
		a.cmsFail(w, err)
		return
	}
	for i := range items {
		items[i] = a.entryOut(items[i])
	}
	_, _, pages := window(total, q.Page, q.Limit)
	writeJSON(w, 200, page{Items: items, Total: total, Page: q.Page, Pages: pages})
}

func (a *App) cmsOne(w http.ResponseWriter, r *http.Request, _ User) {
	kind, ok := kindParam(w, r)
	if !ok {
		return
	}
	e, err := a.Auth.Store.GetEntry(r.Context(), kind, r.PathValue("id"), false)
	if err != nil {
		a.cmsFail(w, err)
		return
	}
	writeJSON(w, 200, a.entryOut(e))
}

func decodeLarge(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 512<<10)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

func (a *App) cmsSave(w http.ResponseWriter, r *http.Request, u User) {
	kind, ok := kindParam(w, r)
	if !ok {
		return
	}
	var body entryBody
	if !decodeLarge(w, r, &body) {
		return
	}
	body.Slug = strings.TrimSpace(body.Slug)
	in, errs := kindParsers[kind](body.Data, &body)
	if fieldErrors(w, errs) {
		return
	}
	in.ExpectedUpdatedAt = body.ExpectedUpdatedAt
	id := r.PathValue("id")
	var e Entry
	var err error
	status := 201
	if id == "" {
		e, err = a.Auth.Store.CreateEntry(r.Context(), u.ID, in)
	} else {
		status = 200
		e, err = a.Auth.Store.UpdateEntry(r.Context(), u.ID, id, in)
	}
	if err != nil {
		a.cmsFail(w, err)
		return
	}
	a.afterContentChange(r, kind)
	writeJSON(w, status, a.entryOut(e))
}

func (a *App) cmsAction(w http.ResponseWriter, r *http.Request, u User) {
	kind, ok := kindParam(w, r)
	if !ok {
		return
	}
	defer a.afterContentChange(r, kind)
	switch r.PathValue("action") {
	case "publish", "unpublish", "archive", "restore":
	default:
		apiError(w, http.StatusNotFound, "not_found")
		return
	}
	e, err := a.Auth.Store.SetEntryStatus(r.Context(), u.ID, r.PathValue("id"), r.PathValue("action"))
	if err != nil {
		a.cmsFail(w, err)
		return
	}
	writeJSON(w, 200, a.entryOut(e))
}

func (a *App) cmsReorder(w http.ResponseWriter, r *http.Request, u User) {
	kind, ok := kindParam(w, r)
	if !ok {
		return
	}
	var body struct {
		IDs []string `json:"ids"`
	}
	if !decodeLarge(w, r, &body) {
		return
	}
	if len(body.IDs) > 500 {
		apiError(w, http.StatusBadRequest, "too many items")
		return
	}
	if err := a.Auth.Store.ReorderEntries(r.Context(), u.ID, kind, body.IDs); err != nil {
		a.cmsFail(w, err)
		return
	}
	a.afterContentChange(r, kind)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

type bulkFailure struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

func (a *App) cmsBulk(w http.ResponseWriter, r *http.Request, u User) {
	kind, ok := kindParam(w, r)
	if !ok {
		return
	}
	var body struct {
		IDs    []string `json:"ids"`
		Action string   `json:"action"`
	}
	if !decodeLarge(w, r, &body) {
		return
	}
	switch body.Action {
	case "publish", "unpublish", "archive", "restore":
	default:
		apiError(w, http.StatusBadRequest, "invalid action")
		return
	}
	if len(body.IDs) == 0 || len(body.IDs) > 100 {
		apiError(w, http.StatusBadRequest, "select between 1 and 100 items")
		return
	}
	done, failed := 0, []bulkFailure{}
	for _, id := range body.IDs {
		e, err := a.Auth.Store.GetEntry(r.Context(), kind, id, false)
		if err == nil {
			_, err = a.Auth.Store.SetEntryStatus(r.Context(), u.ID, e.ID, body.Action)
		}
		if err != nil {
			code := "failed"
			switch {
			case errors.Is(err, ErrNotFound):
				code = "not_found"
			case errors.Is(err, ErrBadState):
				code = "bad_state"
			}
			failed = append(failed, bulkFailure{ID: id, Error: code})
			continue
		}
		done++
	}
	a.afterContentChange(r, kind)
	writeJSON(w, 200, map[string]any{"done": done, "failed": failed})
}

// ---------------------------------------------------------------- uploads (shared with executive photos)

func (a *App) uploadMedia(w http.ResponseWriter, r *http.Request, u User) {
	a.uploadImage(w, r, u, mediaBucket, a.Auth.MediaBase)
}

// ---------------------------------------------------------------- public views

func splitParagraphs(s string) []string {
	out := []string{}
	for _, p := range strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n\n") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

type postOut struct {
	Post
	ImageURL        string   `json:"imageUrl,omitempty"`
	ImageAlt        string   `json:"imageAlt,omitempty"`
	Tags            []string `json:"tags,omitempty"`
	Featured        bool     `json:"featured"`
	MetaTitle       string   `json:"metaTitle,omitempty"`
	MetaDescription string   `json:"metaDescription,omitempty"`
}

func (a *App) postFromEntry(e Entry) postOut {
	var d BlogData
	_ = json.Unmarshal(e.Data, &d)
	date := d.Date
	if date == "" {
		date = firstNonEmpty(e.PublishedAt, e.CreatedAt)
		if len(date) >= 10 {
			date = date[:10]
		}
	}
	p := Post{Slug: e.Slug, Sample: d.Sample, TitleBn: d.TitleBn, TitleEn: d.TitleEn, Category: d.Category, Date: date, ReadMin: d.ReadMin,
		Author: d.Author, Image: d.Image, ExcerptBn: d.ExcerptBn, ExcerptEn: d.ExcerptEn, BodyBn: splitParagraphs(d.BodyBn), BodyEn: splitParagraphs(d.BodyEn)}
	return postOut{Post: p, ImageURL: a.mediaURL(d.Image), ImageAlt: d.ImageAlt, Tags: d.Tags, Featured: e.Featured, MetaTitle: d.MetaTitle, MetaDescription: d.MetaDescription}
}

type placeOut struct {
	Place
	ImageURLs []string `json:"imageUrls"`
	Address   string   `json:"address,omitempty"`
	MapLink   string   `json:"mapLink,omitempty"`
	Period    string   `json:"period,omitempty"`
	Visitor   string   `json:"visitor,omitempty"`
	Featured  bool     `json:"featured"`
}

func (a *App) placeFromEntry(e Entry) placeOut {
	var d PlaceData
	_ = json.Unmarshal(e.Data, &d)
	urls := make([]string, len(d.Images))
	for i, im := range d.Images {
		urls[i] = a.mediaURL(im)
	}
	if d.Images == nil {
		d.Images = []string{}
	}
	if d.Facts == nil {
		d.Facts = []Fact{}
	}
	if d.Sources == nil {
		d.Sources = []string{}
	}
	pl := Place{Slug: e.Slug, NameBn: d.NameBn, NameEn: d.NameEn, Category: d.Category, Upazila: d.Upazila, Lat: d.Lat, Lng: d.Lng, Images: d.Images,
		Summary: d.Summary, Details: d.Details, Facts: d.Facts, Verified: d.Verified, Sources: d.Sources, LastVerified: d.LastVerified}
	return placeOut{Place: pl, ImageURLs: urls, Address: d.Address, MapLink: d.MapLink, Period: d.Period, Visitor: d.Visitor, Featured: e.Featured}
}

// publishedPlaces returns what the public site shows: database places when accounts/content are on, else the bundled files.
func (a *App) publishedPlaces(r *http.Request) []placeOut {
	if a.Auth == nil {
		out := make([]placeOut, 0, len(a.data().Places))
		for _, p := range a.data().Places {
			out = append(out, placeOut{Place: p, ImageURLs: make([]string, len(p.Images))})
		}
		return out
	}
	items, _, err := a.Auth.Store.ListEntries(r.Context(), EntryQuery{Kind: KindPlace, Public: true, Sort: "order", Limit: 100})
	if err != nil {
		log.Printf("published places: %v", err)
		return []placeOut{}
	}
	out := make([]placeOut, 0, len(items))
	for _, e := range items {
		out = append(out, a.placeFromEntry(e))
	}
	return out
}

func (a *App) publishedPosts(r *http.Request) []postOut {
	if a.Auth == nil {
		out := make([]postOut, 0, len(a.data().Posts))
		for _, p := range a.data().Posts {
			if !p.Sample {
				out = append(out, postOut{Post: p})
			}
		}
		return out
	}
	items, _, err := a.Auth.Store.ListEntries(r.Context(), EntryQuery{Kind: KindBlog, Public: true, Sort: "published", Limit: 100})
	if err != nil {
		log.Printf("published posts: %v", err)
		return []postOut{}
	}
	out := make([]postOut, 0, len(items))
	for _, e := range items {
		if p := a.postFromEntry(e); !p.Sample { // placeholder articles stay in the admin list for replacing, never on the public site
			out = append(out, p)
		}
	}
	sortPostsByDate(out)
	return out
}

type galleryOut struct {
	ID        string `json:"id"`
	Image     string `json:"image"`
	ImageURL  string `json:"imageUrl,omitempty"`
	CaptionBn string `json:"captionBn"`
	CaptionEn string `json:"captionEn"`
	Alt       string `json:"alt"`
	Credit    string `json:"credit"`
	License   string `json:"license"`
	Source    string `json:"source"`
	Category  string `json:"category"`
	EventDate string `json:"eventDate"`
	Album     string `json:"album"`
}

type albumOut struct {
	ID      string `json:"id"`
	Slug    string `json:"slug"`
	TitleBn string `json:"titleBn"`
	TitleEn string `json:"titleEn"`
	Count   int    `json:"count"`
}

func (a *App) publicGallery(w http.ResponseWriter, r *http.Request) {
	if a.Auth == nil {
		writeJSON(w, 200, map[string]any{"albums": []albumOut{}, "items": []galleryOut{}})
		return
	}
	albums, _, err := a.Auth.Store.ListEntries(r.Context(), EntryQuery{Kind: KindAlbum, Public: true, Sort: "order", Limit: 100})
	if err != nil {
		a.cmsFail(w, err)
		return
	}
	live := map[string]*albumOut{}
	albumList := []albumOut{}
	for _, al := range albums {
		var d AlbumData
		_ = json.Unmarshal(al.Data, &d)
		albumList = append(albumList, albumOut{ID: al.ID, Slug: al.Slug, TitleBn: d.TitleBn, TitleEn: d.TitleEn})
	}
	for i := range albumList {
		live[albumList[i].ID] = &albumList[i]
	}
	imgs, _, err := a.Auth.Store.ListEntries(r.Context(), EntryQuery{Kind: KindImage, Public: true, Sort: "order", Limit: 100, Page: 1})
	if err != nil {
		a.cmsFail(w, err)
		return
	}
	want := r.URL.Query().Get("album")
	items := []galleryOut{}
	for _, e := range imgs {
		if e.ParentID != "" && live[e.ParentID] == nil {
			continue // its album is not public, so neither is the picture
		}
		if e.ParentID != "" {
			live[e.ParentID].Count++
		}
		if want != "" && (e.ParentID == "" || live[e.ParentID].Slug != want) {
			continue
		}
		var d ImageData
		_ = json.Unmarshal(e.Data, &d)
		items = append(items, galleryOut{ID: e.ID, Image: d.Image, ImageURL: a.mediaURL(d.Image), CaptionBn: d.CaptionBn, CaptionEn: d.CaptionEn, Alt: d.Alt,
			Credit: d.Credit, License: d.License, Source: d.Source, Category: d.Category, EventDate: d.EventDate, Album: e.ParentID})
	}
	writeJSON(w, 200, map[string]any{"albums": albumList, "items": items})
}

func sortPostsByDate(ps []postOut) {
	sort.SliceStable(ps, func(i, j int) bool { return ps[i].Date > ps[j].Date })
}

// afterContentChange reloads the in-memory reference data when departments, upazilas or places changed, so the site
// shows the change at once.
func (a *App) afterContentChange(r *http.Request, kind string) {
	if !a.isLiveKind(kind) {
		return
	}
	if err := a.reloadLive(r.Context()); err != nil {
		log.Printf("reload after %s change: %v", kind, err)
	}
}
