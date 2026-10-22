package main

import (
	"encoding/csv"
	"errors"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

func (a *App) adminRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/admin/dashboard", adm(a.dashboard))
	m.HandleFunc("GET /api/v1/admin/activity", adm(a.activity))
	m.HandleFunc("GET /api/v1/admin/role-history", adm(a.roleHistory))
	m.HandleFunc("GET /api/v1/admin/students", adm(a.studentsList))
	m.HandleFunc("POST /api/v1/admin/students/bulk", adm(a.studentsBulk))
	m.HandleFunc("GET /api/v1/admin/students/{id}", adm(a.studentOneAdmin))
	m.HandleFunc("PATCH /api/v1/admin/students/{id}", adm(a.studentEdit))
	m.HandleFunc("POST /api/v1/admin/students/{id}/{action}", adm(a.studentAction))
	m.HandleFunc("GET /api/v1/admin/export/students", adm(a.studentsExport))
	m.HandleFunc("GET /api/v1/admin/imported-students", adm(a.importedStudents))
}

func (a *App) memberFail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		apiError(w, http.StatusNotFound, "not_found")
	case errors.Is(err, ErrSelfDisable):
		apiError(w, http.StatusForbidden, "self_disable")
	case errors.Is(err, ErrAdminProtected):
		apiError(w, http.StatusConflict, "admin_protected")
	default:
		log.Printf("members: %v", err)
		apiError(w, http.StatusInternalServerError, "could not save the change")
	}
}

// ---------------------------------------------------------------- dashboard

type recentItem struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	UpdatedAt string `json:"updatedAt"`
}

func (a *App) dashboard(w http.ResponseWriter, r *http.Request, _ User) {
	ctx := r.Context()
	s := a.Auth.Store
	out := map[string]any{}
	// every number below comes from the database; a failure is reported, never replaced by a made-up value
	fail := func(what string, err error) bool {
		if err == nil {
			return false
		}
		log.Printf("dashboard %s: %v", what, err)
		apiError(w, http.StatusInternalServerError, "dashboard_unavailable")
		return true
	}
	counts, err := s.Counts(ctx)
	if fail("members", err) {
		return
	}
	_, users, err := s.ListUsers(ctx, "", "", 1, 0)
	if fail("users", err) {
		return
	}
	_, admins, err := s.ListUsers(ctx, "", RoleAdmin, 1, 0)
	if fail("admins", err) {
		return
	}
	_, disabled, err := s.ListMembersAdmin(ctx, MemberQuery{Disabled: "yes", Limit: 1})
	if fail("disabled", err) {
		return
	}
	out["members"] = map[string]any{"pending": counts[StatusPending], "approved": counts[StatusApproved], "rejected": counts[StatusRejected],
		"total": counts[StatusPending] + counts[StatusApproved] + counts[StatusRejected], "accounts": users, "deactivated": disabled}
	out["admins"] = admins
	out["importedStudents"] = len(a.Store.Students)

	committees, err := s.ListCommittees(ctx)
	if fail("committees", err) {
		return
	}
	cm := map[string]int{CommitteeDraft: 0, CommitteePublished: 0, CommitteeArchived: 0}
	current := 0
	for _, c := range committees {
		cm[c.Status]++
		if c.Status == CommitteePublished {
			current = c.MemberCount
		}
	}
	out["committees"] = map[string]any{"draft": cm[CommitteeDraft], "published": cm[CommitteePublished], "archived": cm[CommitteeArchived], "currentMembers": current}

	entries, err := s.CountEntries(ctx)
	if fail("content", err) {
		return
	}
	statusCounts := func(kind string) map[string]int {
		return map[string]int{StatusDraft: entries[kind][StatusDraft], StatusPublished: entries[kind][StatusPublished], StatusArchived: entries[kind][StatusArchived]}
	}
	out["blog"], out["places"] = statusCounts(KindBlog), statusCounts(KindPlace)
	out["gallery"] = map[string]any{"images": statusCounts(KindImage), "albums": statusCounts(KindAlbum)}
	// contact-form messages are written to a log file, not to the database, so no honest count exists
	out["messages"] = map[string]any{"available": false}

	recent := []recentItem{}
	for _, kind := range []string{KindBlog, KindPlace, KindImage, KindAlbum} {
		items, _, err := s.ListEntries(ctx, EntryQuery{Kind: kind, Status: "all", Sort: "updated", Limit: 6})
		if fail("recent", err) {
			return
		}
		for _, e := range items {
			recent = append(recent, recentItem{ID: e.ID, Kind: e.Kind, Title: e.Title, Status: e.Status, UpdatedAt: e.UpdatedAt})
		}
	}
	sort.SliceStable(recent, func(i, j int) bool { return recent[i].UpdatedAt > recent[j].UpdatedAt })
	if len(recent) > 8 {
		recent = recent[:8]
	}
	out["recent"] = recent
	act, err := s.RecentActivity(ctx, 12)
	if fail("activity", err) {
		return
	}
	out["activity"] = act
	writeJSON(w, 200, out)
}

func (a *App) activity(w http.ResponseWriter, r *http.Request, _ User) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := a.Auth.Store.RecentActivity(r.Context(), limit)
	if err != nil {
		a.memberFail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (a *App) roleHistory(w http.ResponseWriter, r *http.Request, _ User) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := a.Auth.Store.RoleHistory(r.Context(), r.URL.Query().Get("user"), limit)
	if err != nil {
		a.memberFail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

// ---------------------------------------------------------------- students (registered members)

func memberQuery(r *http.Request) (MemberQuery, bool) {
	v := r.URL.Query()
	pg, limit := paging(r, 100)
	b, _ := strconv.Atoi(v.Get("batch"))
	q := MemberQuery{Q: strings.TrimSpace(v.Get("q")), Status: v.Get("status"), Department: v.Get("department"), Batch: b,
		Verified: v.Get("verified"), Complete: v.Get("complete"), Disabled: v.Get("disabled"), Sort: v.Get("sort"), Page: pg, Limit: limit}
	ok := memberSorts[q.Sort] && utf8.RuneCountInString(q.Q) <= 100 && (q.Status == "" || q.Status == StatusPending || q.Status == StatusApproved || q.Status == StatusRejected)
	return q, ok
}

func (a *App) studentsList(w http.ResponseWriter, r *http.Request, _ User) {
	q, ok := memberQuery(r)
	if !ok {
		apiError(w, http.StatusBadRequest, "invalid filter")
		return
	}
	rows, total, err := a.Auth.Store.ListMembersAdmin(r.Context(), q)
	if err != nil {
		a.memberFail(w, err)
		return
	}
	_, _, pages := window(total, q.Page, q.Limit)
	writeJSON(w, 200, page{Items: rows, Total: total, Page: q.Page, Pages: pages})
}

func (a *App) studentOneAdmin(w http.ResponseWriter, r *http.Request, _ User) {
	row, err := a.Auth.Store.MemberAdmin(r.Context(), r.PathValue("id"))
	if err != nil {
		a.memberFail(w, err)
		return
	}
	writeJSON(w, 200, row)
}

func (a *App) studentEdit(w http.ResponseWriter, r *http.Request, u User) {
	var q struct {
		Name            *string `json:"name"`
		Batch           *int    `json:"batch"`
		Department      *string `json:"department"`
		Upazila         *string `json:"upazila"`
		Union           *string `json:"union"`
		Phone           *string `json:"phone"`
		BloodGroup      *string `json:"bloodGroup"`
		ShowInDirectory *bool   `json:"showInDirectory"`
		Role            *string `json:"role"` // never accepted: roles change only through the role endpoint
	}
	if !decode(w, r, &q) {
		return
	}
	if q.Role != nil {
		apiError(w, http.StatusBadRequest, "role_not_editable_here")
		return
	}
	cur, err := a.Auth.Store.MemberAdmin(r.Context(), r.PathValue("id"))
	if err != nil {
		a.memberFail(w, err)
		return
	}
	errs := map[string]string{}
	if q.Name != nil {
		*q.Name = strings.TrimSpace(*q.Name)
		if n := utf8.RuneCountInString(*q.Name); n < 2 || n > 80 {
			errs["name"] = "Name must be 2-80 characters."
		}
	}
	if q.Batch != nil && (*q.Batch < 1 || *q.Batch > 60) {
		errs["batch"] = "Choose a valid batch."
	}
	if q.Department != nil {
		found := false
		for _, d := range a.Store.Depts {
			found = found || d == *q.Department
		}
		if !found {
			errs["department"] = "Choose a department from the list."
		}
	}
	up := cur.Upazila
	if q.Upazila != nil {
		up = *q.Upazila
	}
	un := cur.Union
	if q.Union != nil {
		un = *q.Union
	}
	if q.Upazila != nil || q.Union != nil {
		okUp, okUn := false, false
		for _, x := range a.Store.Upazilas {
			if x.Slug == up {
				okUp = true
				for _, name := range x.Unions {
					okUn = okUn || name == un
				}
			}
		}
		if !okUp {
			errs["upazila"] = "Choose an upazila from the list."
		} else if !okUn {
			errs["union"] = "Choose a union that belongs to that upazila."
		}
	}
	if q.Phone != nil && *q.Phone != "" && !phoneRx.MatchString(*q.Phone) {
		errs["phone"] = "Use an 11-digit number starting with 01."
	}
	if q.BloodGroup != nil && *q.BloodGroup != "" && !bloodRx.MatchString(*q.BloodGroup) {
		errs["bloodGroup"] = "Choose a valid blood group."
	}
	if fieldErrors(w, errs) {
		return
	}
	row, err := a.Auth.Store.UpdateMemberAdmin(r.Context(), u.ID, cur.ID, MemberPatch{Name: q.Name, Batch: q.Batch, Department: q.Department,
		Upazila: q.Upazila, Union: q.Union, Phone: q.Phone, BloodGroup: q.BloodGroup, ShowInDirectory: q.ShowInDirectory})
	if err != nil {
		a.memberFail(w, err)
		return
	}
	writeJSON(w, 200, row)
}

var memberActions = map[string]string{"approve": StatusApproved, "reject": StatusRejected, "reset": StatusPending}

func (a *App) studentAction(w http.ResponseWriter, r *http.Request, u User) {
	id, action := r.PathValue("id"), r.PathValue("action")
	var err error
	switch action {
	case "approve", "reject", "reset":
		err = a.Auth.Store.ReviewMember(r.Context(), u.ID, id, memberActions[action])
	case "deactivate":
		err = a.Auth.Store.SetAccountDisabled(r.Context(), u.ID, id, true)
	case "activate":
		err = a.Auth.Store.SetAccountDisabled(r.Context(), u.ID, id, false)
	default:
		apiError(w, http.StatusNotFound, "not_found")
		return
	}
	if err != nil {
		a.memberFail(w, err)
		return
	}
	row, err := a.Auth.Store.MemberAdmin(r.Context(), id)
	if err != nil {
		a.memberFail(w, err)
		return
	}
	writeJSON(w, 200, row)
}

func (a *App) studentsBulk(w http.ResponseWriter, r *http.Request, u User) {
	var body struct {
		IDs    []string `json:"ids"`
		Action string   `json:"action"`
	}
	if !decodeLarge(w, r, &body) {
		return
	}
	status, ok := memberActions[body.Action]
	if !ok {
		apiError(w, http.StatusBadRequest, "invalid action")
		return
	}
	if len(body.IDs) == 0 || len(body.IDs) > 100 {
		apiError(w, http.StatusBadRequest, "select between 1 and 100 members")
		return
	}
	done, failed := 0, []bulkFailure{}
	for _, id := range body.IDs {
		if err := a.Auth.Store.ReviewMember(r.Context(), u.ID, id, status); err != nil {
			code := "failed"
			if errors.Is(err, ErrNotFound) {
				code = "not_found"
			}
			failed = append(failed, bulkFailure{ID: id, Error: code})
			continue
		}
		done++
	}
	writeJSON(w, 200, map[string]any{"done": done, "failed": failed})
}

// csvCell neutralises spreadsheet formulas (=, +, -, @ at the start of a cell).
func csvCell(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

// studentsExport streams the filtered members as CSV. Emails and phone numbers are left out unless the admin asks
// for them explicitly, and that request is written to the audit trail.
func (a *App) studentsExport(w http.ResponseWriter, r *http.Request, u User) {
	q, ok := memberQuery(r)
	if !ok {
		apiError(w, http.StatusBadRequest, "invalid filter")
		return
	}
	withContact := r.URL.Query().Get("contact") == "1"
	header := []string{"name", "batch", "department", "upazila", "union", "status", "verified", "created"}
	if withContact {
		header = append(header, "email", "phone", "blood_group")
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="members.csv"`)
	cw := csv.NewWriter(w)
	_ = cw.Write(header)
	exported := 0
	for pg := 1; pg <= 200; pg++ {
		q.Page, q.Limit = pg, 100
		rows, _, err := a.Auth.Store.ListMembersAdmin(r.Context(), q)
		if err != nil {
			log.Printf("export: %v", err)
			break
		}
		for _, m := range rows {
			rec := []string{csvCell(m.Name), strconv.Itoa(m.Batch), csvCell(m.Department), m.Upazila, csvCell(m.Union), m.Status, strconv.FormatBool(m.EmailVerified), m.CreatedAt}
			if withContact {
				rec = append(rec, csvCell(m.Email), csvCell(m.Phone), csvCell(m.BloodGroup))
			}
			_ = cw.Write(rec)
			exported++
		}
		if len(rows) < 100 {
			break
		}
	}
	cw.Flush()
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "member.export", "user", "", map[string]any{"rows": exported, "withContact": withContact})
}

