package main

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type App struct {
	Store      *Store
	Origin     string
	ContactLog string
	Limiter    *Limiter
	Auth       *Auth
	mu         sync.Mutex
	dataMu     sync.RWMutex // guards Store, which reloadLive swaps
}

func (a *App) Routes() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	m.HandleFunc("GET /api/v1/stats", a.stats)
	m.HandleFunc("GET /api/v1/students", a.students)
	m.HandleFunc("GET /api/v1/students/{id}", a.studentOne)
	m.HandleFunc("GET /api/v1/alumni", a.alumni)
	m.HandleFunc("GET /api/v1/upazilas", a.upazilas)
	m.HandleFunc("GET /api/v1/upazilas/{slug}", a.upazila)
	m.HandleFunc("GET /api/v1/departments", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"items": a.data().Depts})
	})
	m.HandleFunc("GET /api/v1/events", a.publicEvents)
	m.HandleFunc("GET /api/v1/events/{slug}", a.publicEvent)
	m.HandleFunc("GET /api/v1/committee", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"items": a.data().Committee})
	})
	m.HandleFunc("GET /api/v1/faq", a.publicFAQ)
	m.HandleFunc("GET /api/v1/heritage", a.heritage)
	m.HandleFunc("GET /api/v1/heritage/{slug}", a.heritageOne)
	m.HandleFunc("GET /api/v1/blog", a.blog)
	m.HandleFunc("GET /api/v1/blog/{slug}", a.blogOne)
	m.HandleFunc("POST /api/v1/contact", a.contact)
	a.authRoutes(m)
	return a.cors(a.originGuard(logging(m)))
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func apiError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"error": msg})
}

func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(t).Round(time.Microsecond))
	})
}

func (a *App) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", a.Origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Vary", "Origin")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type page struct {
	Items any `json:"items"`
	Total int `json:"total"`
	Page  int `json:"page"`
	Pages int `json:"pages"`
}

func paging(r *http.Request, max int) (pg, limit int) {
	pg, _ = strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))
	if pg < 1 {
		pg = 1
	}
	if limit < 1 || limit > max {
		limit = 12
	}
	return
}

func window(total, pg, limit int) (lo, hi, pages int) {
	pages = (total + limit - 1) / limit
	if pages == 0 {
		pages = 1
	}
	lo = (pg - 1) * limit
	if lo > total {
		lo = total
	}
	hi = lo + limit
	if hi > total {
		hi = total
	}
	return
}

func (a *App) alumni(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	pg, limit := paging(r, 48)
	out := []Alumnus{}
	list := a.shownAlumni(r.Context()) // alumni records and every graduated batch
	batch, _ := strconv.Atoi(q.Get("batch"))
	for _, s := range list {
		if batch > 0 && (s.Batch == nil || *s.Batch != batch) {
			continue
		}
		if d := q.Get("department"); d != "" && s.Department != d {
			continue
		}
		if t := strings.TrimSpace(q.Get("q")); t != "" && !contains(s.Name, t) && !contains(s.Occupation, t) && !contains(s.Workplace, t) {
			continue
		}
		out = append(out, s)
	}
	batches, depts := map[int]int{}, map[string]int{}
	for _, s := range list {
		if s.Batch != nil {
			batches[*s.Batch]++
		}
		depts[s.Department]++
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	lo, hi, pages := window(len(out), pg, limit)
	writeJSON(w, 200, map[string]any{"items": out[lo:hi], "total": len(out), "page": pg, "pages": pages, "alumniUpToBatch": a.data().AlumniUpTo,
		"facets": map[string]any{"batches": batches, "departments": depts}})
}

// withPlaceCounts sets each upazila's place count from what is actually published.
func (a *App) withPlaceCounts(r *http.Request) []Upazila {
	out := append([]Upazila{}, a.data().Upazilas...)
	counts := map[string]int{}
	for _, p := range a.publishedPlaces(r) {
		counts[p.Upazila]++
	}
	members, alumni := map[string]int{}, map[string]int{}
	d := a.data()
	for _, p := range a.directoryPeople(r.Context()) { // the same real list the directory shows, not the bundled file
		if !d.graduated(p.Batch) {
			members[p.Upazila]++
		}
	}
	for _, al := range a.shownAlumni(r.Context()) {
		alumni[al.Upazila]++
	}
	for i := range out {
		out[i].Places = counts[out[i].Slug]
		out[i].Members = members[out[i].Slug]
		out[i].AlumniCount = alumni[out[i].Slug]
	}
	return out
}

func (a *App) upazilas(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"items": a.withPlaceCounts(r)})
}

func (a *App) upazila(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	for _, u := range a.withPlaceCounts(r) {
		if u.Slug == slug {
			places := []placeOut{}
			for _, p := range a.publishedPlaces(r) {
				if p.Upazila == slug {
					places = append(places, p)
				}
			}
			writeJSON(w, 200, map[string]any{"upazila": u, "places": places})
			return
		}
	}
	apiError(w, 404, "upazila not found")
}

func (a *App) heritage(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	out := []placeOut{}
	for _, p := range a.publishedPlaces(r) {
		if c := q.Get("category"); c != "" && p.Category != c {
			continue
		}
		if u := q.Get("upazila"); u != "" && p.Upazila != u {
			continue
		}
		if t := strings.TrimSpace(q.Get("q")); t != "" && !contains(p.NameEn, t) && !contains(p.NameBn, t) && !contains(p.Summary, t) {
			continue
		}
		out = append(out, p)
	}
	writeJSON(w, 200, map[string]any{"items": out, "total": len(out)})
}

func (a *App) heritageOne(w http.ResponseWriter, r *http.Request) {
	for _, p := range a.publishedPlaces(r) {
		if p.Slug == r.PathValue("slug") {
			writeJSON(w, 200, p)
			return
		}
	}
	apiError(w, 404, "place not found")
}

func (a *App) blog(w http.ResponseWriter, r *http.Request) {
	out := []postOut{}
	for _, p := range a.publishedPosts(r) {
		if c := r.URL.Query().Get("category"); c != "" && p.Category != c {
			continue
		}
		out = append(out, p)
	}
	writeJSON(w, 200, map[string]any{"items": out, "total": len(out)})
}

func (a *App) blogOne(w http.ResponseWriter, r *http.Request) {
	for _, p := range a.publishedPosts(r) {
		if p.Slug == r.PathValue("slug") {
			writeJSON(w, 200, p)
			return
		}
	}
	apiError(w, 404, "post not found")
}

func (a *App) stats(w http.ResponseWriter, r *http.Request) {
	batches := map[int]bool{}
	d := a.data()
	students := 0
	for _, s := range a.directoryStudents(r.Context()) {
		if d.graduated(s.Batch) {
			continue
		}
		students++
		if s.Batch != nil {
			batches[*s.Batch] = true
		}
	}
	writeJSON(w, 200, map[string]any{
		"students": students, "alumni": len(a.shownAlumni(r.Context())), "batches": len(batches), "alumniUpToBatch": d.AlumniUpTo,
		"upazilas": len(a.data().Upazilas), "places": len(a.publishedPlaces(r)), "sample": a.data().Sample,
	})
}

// ---- contact form ----

var emailRx = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

type contactReq struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Subject string `json:"subject"`
	Message string `json:"message"`
	Website string `json:"website"` // honeypot, must stay empty
}

func validateContact(c *contactReq) map[string]string {
	errs := map[string]string{}
	n := func(s string) int { return utf8.RuneCountInString(strings.TrimSpace(s)) }
	if n(c.Name) < 2 || n(c.Name) > 80 {
		errs["name"] = "Name must be 2-80 characters."
	}
	if !emailRx.MatchString(strings.TrimSpace(c.Email)) || n(c.Email) > 120 {
		errs["email"] = "Enter a valid email address."
	}
	if n(c.Subject) < 3 || n(c.Subject) > 120 {
		errs["subject"] = "Subject must be 3-120 characters."
	}
	if n(c.Message) < 10 || n(c.Message) > 2000 {
		errs["message"] = "Message must be 10-2000 characters."
	}
	return errs
}

func clientIP(r *http.Request) string {
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

func (a *App) contact(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var c contactReq
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if c.Website != "" { // bots: pretend success
		writeJSON(w, 202, map[string]bool{"ok": true})
		return
	}
	if !a.Limiter.Allow(clientIP(r)) {
		apiError(w, 429, "too many messages, try again later")
		return
	}
	if errs := validateContact(&c); len(errs) > 0 {
		writeJSON(w, 422, map[string]any{"error": "validation failed", "fields": errs})
		return
	}
	if a.Auth != nil && a.Auth.Store != nil {
		a.submitContact(w, r, c)
		return
	}
	rec, _ := json.Marshal(map[string]string{"at": time.Now().UTC().Format(time.RFC3339), "name": strings.TrimSpace(c.Name),
		"email": strings.TrimSpace(c.Email), "subject": strings.TrimSpace(c.Subject), "message": strings.TrimSpace(c.Message)})
	a.mu.Lock()
	defer a.mu.Unlock()
	f, err := os.OpenFile(a.ContactLog, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		apiError(w, 500, "could not save message")
		return
	}
	defer f.Close()
	_, _ = f.Write(append(rec, '\n'))
	writeJSON(w, 201, map[string]bool{"ok": true})
}

// ---- rate limiter (sliding window per key) ----

type Limiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	hits   map[string][]time.Time
}

func newLimiter(max int, window time.Duration) *Limiter {
	return &Limiter{max: max, window: window, hits: map[string][]time.Time{}}
}

func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	recent := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if now.Sub(t) < l.window {
			recent = append(recent, t)
		}
	}
	if len(recent) >= l.max {
		l.hits[key] = recent
		return false
	}
	l.hits[key] = append(recent, now)
	return true
}
