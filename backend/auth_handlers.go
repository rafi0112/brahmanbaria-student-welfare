package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	sessionTTL = 14 * 24 * time.Hour
	verifyTTL  = 24 * time.Hour
	resetTTL   = time.Hour
	cookieName = "bswa_session"
)

// Auth bundles everything the account endpoints need.
type Auth struct {
	Store        AuthStore
	Mailer       Mailer
	FrontendURL  string
	CookieSecure bool
	SameSite     http.SameSite
	Verifier     *supabaseVerifier

	// Executive photos: Images stores them, PhotoBase is the public URL prefix, Drive* are overridable for tests.
	Images         ImageStore
	PhotoBase      string
	MediaBase      string
	DriveBase      string
	DriveAllowHost func(string) bool
	// AllowPrivateImageHosts lets tests fetch from a local server; production never sets it.
	AllowPrivateImageHosts bool

	loginIP, loginEmail, registerIP, mailIP, uploadUser, replyUser *Limiter
}

func newAuth(store AuthStore, mailer Mailer, frontendURL string, secure bool, same http.SameSite) *Auth {
	return &Auth{
		Store: store, Mailer: mailer, FrontendURL: strings.TrimRight(frontendURL, "/"), CookieSecure: secure, SameSite: same,
		loginIP: newLimiter(30, 10*time.Minute), loginEmail: newLimiter(10, 15*time.Minute),
		registerIP: newLimiter(8, time.Hour), mailIP: newLimiter(8, time.Hour), uploadUser: newLimiter(60, time.Hour), replyUser: newLimiter(60, time.Hour),
	}
}

var (
	bloodRx = regexp.MustCompile(`^(A|B|AB|O)[+-]$`)
	phoneRx = regexp.MustCompile(`^01[0-9]{9}$`)
)

func (a *App) authRoutes(m *http.ServeMux) {
	// Credential endpoints of the built-in (non-Supabase) accounts. They are switched off when Supabase
	// Auth is configured so there is a single source of truth for passwords, confirmations and resets.
	local := func(f func(http.ResponseWriter, *http.Request)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if a.Auth != nil && a.Auth.Verifier != nil {
				apiError(w, http.StatusGone, "use Supabase Auth for this action")
				return
			}
			f(w, r)
		}
	}
	h := func(f func(http.ResponseWriter, *http.Request)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if a.Auth == nil {
				apiError(w, http.StatusServiceUnavailable, "authentication is not configured on this server")
				return
			}
			f(w, r)
		}
	}
	m.HandleFunc("POST /api/v1/auth/register", h(local(a.register)))
	m.HandleFunc("POST /api/v1/auth/verify-email", h(local(a.verifyEmail)))
	m.HandleFunc("POST /api/v1/auth/resend-verification", h(local(a.resendVerification)))
	m.HandleFunc("POST /api/v1/auth/login", h(local(a.login)))
	m.HandleFunc("POST /api/v1/auth/logout", h(a.logout))
	m.HandleFunc("POST /api/v1/auth/forgot-password", h(local(a.forgotPassword)))
	m.HandleFunc("POST /api/v1/auth/reset-password", h(local(a.resetPassword)))
	m.HandleFunc("GET /api/v1/auth/me", h(a.me))
	m.HandleFunc("PATCH /api/v1/me/profile", h(a.requireUser(a.updateProfile)))
	m.HandleFunc("POST /api/v1/me/profile", h(a.requireUser(a.createProfile)))
	m.HandleFunc("GET /api/v1/admin/overview", h(a.requireAdmin(a.adminOverview)))
	m.HandleFunc("GET /api/v1/admin/users", h(a.requireAdmin(a.adminUsers)))
	m.HandleFunc("POST /api/v1/admin/users/{id}/role", h(a.requireAdmin(a.setUserRole)))
	m.HandleFunc("GET /api/v1/admin/members", h(a.requireAdmin(a.adminMembers)))
	m.HandleFunc("POST /api/v1/admin/members/{id}/approve", h(a.requireAdmin(a.review(StatusApproved))))
	m.HandleFunc("POST /api/v1/admin/members/{id}/reject", h(a.requireAdmin(a.review(StatusRejected))))
	a.committeeRoutes(m, h)
	a.cmsRoutes(m, h)
	a.contactRoutes(m, h)
	a.importedRoutes(m, h)
	a.manualRoutes(m, h)
	a.memberViewRoutes(m, h)
	a.adminRoutes(m, h)
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

func (a *App) setSession(w http.ResponseWriter, raw string, ttl time.Duration) {
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: raw, Path: "/", HttpOnly: true, Secure: a.Auth.CookieSecure,
		SameSite: a.Auth.SameSite, MaxAge: int(ttl.Seconds()), Expires: time.Now().Add(ttl)})
}

func (a *App) startSession(w http.ResponseWriter, r *http.Request, userID string) error {
	raw, digest, err := newToken()
	if err != nil {
		return err
	}
	if err := a.Auth.Store.CreateSession(r.Context(), userID, digest, time.Now().Add(sessionTTL)); err != nil {
		return err
	}
	a.setSession(w, raw, sessionTTL)
	return nil
}

func (a *App) currentUser(r *http.Request) (User, bool) {
	if a.Auth.Verifier != nil {
		header := strings.TrimSpace(r.Header.Get("Authorization"))
		if strings.HasPrefix(header, "Bearer ") {
			external, err := a.Auth.Verifier.verify(r.Context(), strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")))
			if err == nil {
				confirmed := external.EmailConfirmedAt != ""
				u, ensureErr := a.Auth.Store.EnsureExternalUser(r.Context(), external.ID, normEmail(external.Email), confirmed)
				if ensureErr != nil {
					log.Printf("external user %s: %v", external.ID, ensureErr)
				} else {
					u.EmailVerified = confirmed // trust Supabase's flag for this request, not our stored copy
					return u, true
				}
			}
		}
	}
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return User{}, false
	}
	u, err := a.Auth.Store.SessionUser(r.Context(), tokenDigest(c.Value))
	return u, err == nil
}

func (a *App) requireUser(next func(http.ResponseWriter, *http.Request, User)) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		u, ok := a.currentUser(r)
		if !ok {
			apiError(w, http.StatusUnauthorized, "sign in required")
			return
		}
		if !u.EmailVerified {
			apiError(w, http.StatusForbidden, "email_not_verified")
			return
		}
		if u.Disabled {
			apiError(w, http.StatusForbidden, "account_disabled")
			return
		}
		next(w, r, u)
	}
}

func (a *App) requireAdmin(next func(http.ResponseWriter, *http.Request, User)) func(http.ResponseWriter, *http.Request) {
	return a.requireUser(func(w http.ResponseWriter, r *http.Request, u User) {
		if u.Role != RoleAdmin {
			apiError(w, http.StatusForbidden, "admin access required")
			return
		}
		next(w, r, u)
	})
}

// sendLink emails a one-time link; failures are logged, never shown to the caller (no account probing).
func (a *App) sendLink(ctx context.Context, u User, purpose string) {
	raw, digest, err := newToken()
	if err != nil {
		log.Printf("token: %v", err)
		return
	}
	ttl, path, subject, lead := verifyTTL, "/verify-email", "Verify your BSWA email", "Open this link to verify your email address:"
	if purpose == PurposeReset {
		ttl, path, subject, lead = resetTTL, "/reset-password", "Reset your BSWA password", "Open this link to choose a new password (valid for one hour):"
	}
	if err := a.Auth.Store.SaveToken(ctx, u.ID, purpose, digest, time.Now().Add(ttl)); err != nil {
		log.Printf("save token: %v", err)
		return
	}
	body := lead + "\n\n" + a.Auth.FrontendURL + path + "?token=" + raw + "\n\nIf you did not ask for this, you can ignore this message."
	if err := a.Auth.Mailer.Send(ctx, u.Email, subject, body); err != nil {
		log.Printf("send mail to %s: %v", u.Email, err)
	}
}

type registerReq struct {
	Session    string `json:"session"`
	Gender     string `json:"gender"`     // optional: female | male | other; empty means unspecified
	BloodGroup string `json:"bloodGroup"` // optional
	Name       string `json:"name"`
	Email      string `json:"email"`
	Password   string `json:"password"`
	Batch      int    `json:"batch"`
	Department string `json:"department"`
	Upazila    string `json:"upazila"`
	Union      string `json:"union"`
}

// validateProfile checks the member details shared by registration and "complete my profile".
func (a *App) validateProfile(q *registerReq) map[string]string {
	errs := map[string]string{}
	if !sessionRx.MatchString(strings.TrimSpace(q.Session)) {
		errs["session"] = "Enter your session, for example 2020-21."
	}
	if q.Gender != "" && q.Gender != "female" && q.Gender != "male" && q.Gender != "other" {
		errs["gender"] = "Choose female, male or other, or leave it blank."
	}
	if q.BloodGroup != "" && !bloodRx.MatchString(q.BloodGroup) {
		errs["bloodGroup"] = "Choose a valid blood group."
	}
	if n := utf8.RuneCountInString(strings.TrimSpace(q.Name)); n < 2 || n > 80 {
		errs["name"] = "Name must be 2-80 characters."
	}
	if q.Batch < 1 || q.Batch > 60 {
		errs["batch"] = "Choose your batch."
	}
	okDept := false
	for _, d := range a.Store.Depts {
		okDept = okDept || d == q.Department
	}
	if !okDept {
		errs["department"] = "Choose a department from the list."
	}
	okUp, okUn := false, false
	for _, u := range a.Store.Upazilas {
		if u.Slug == q.Upazila {
			okUp = true
			for _, x := range u.Unions {
				okUn = okUn || x == q.Union
			}
		}
	}
	if !okUp {
		errs["upazila"] = "Choose an upazila from the list."
	} else if !okUn {
		errs["union"] = "Choose a union of that upazila."
	}
	return errs
}

func (a *App) validateRegister(q *registerReq) map[string]string {
	errs := a.validateProfile(q)
	if !emailRx.MatchString(q.Email) || len(q.Email) > 254 {
		errs["email"] = "Enter a valid email address."
	}
	if n := utf8.RuneCountInString(q.Password); n < 8 || n > 128 {
		errs["password"] = "Password must be 8-128 characters."
	}
	return errs
}

func (a *App) register(w http.ResponseWriter, r *http.Request) {
	var q registerReq
	if !decode(w, r, &q) {
		return
	}
	q.Email, q.Name = normEmail(q.Email), strings.TrimSpace(q.Name)
	if !a.Auth.registerIP.Allow(clientIP(r)) {
		apiError(w, http.StatusTooManyRequests, "too many attempts, try again later")
		return
	}
	if errs := a.validateRegister(&q); len(errs) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": errs})
		return
	}
	hash, err := hashPassword(q.Password)
	if err != nil {
		apiError(w, 500, "could not create account")
		return
	}
	u, err := a.Auth.Store.CreateUser(r.Context(), NewUser{Email: q.Email, PasswordHash: hash, Role: RoleMember,
		Profile: &Profile{Name: q.Name, Batch: q.Batch, Department: q.Department, Upazila: q.Upazila, Union: q.Union,
			Session: strings.TrimSpace(q.Session), Gender: q.Gender, BloodGroup: q.BloodGroup}})
	switch err {
	case nil:
		a.sendLink(r.Context(), u, PurposeVerify)
	case ErrEmailTaken: // same response either way, so the form cannot be used to find registered emails
	default:
		log.Printf("register: %v", err)
		apiError(w, 500, "could not create account")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true})
}

func (a *App) verifyEmail(w http.ResponseWriter, r *http.Request) {
	var q struct {
		Token string `json:"token"`
	}
	if !decode(w, r, &q) {
		return
	}
	id, err := a.Auth.Store.ConsumeToken(r.Context(), PurposeVerify, tokenDigest(q.Token))
	if err != nil {
		apiError(w, http.StatusBadRequest, "this link is invalid or has expired")
		return
	}
	if err := a.Auth.Store.SetEmailVerified(r.Context(), id); err != nil {
		apiError(w, 500, "could not verify email")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) resendVerification(w http.ResponseWriter, r *http.Request) {
	var q struct {
		Email string `json:"email"`
	}
	if !decode(w, r, &q) {
		return
	}
	if !a.Auth.mailIP.Allow(clientIP(r)) {
		apiError(w, http.StatusTooManyRequests, "too many attempts, try again later")
		return
	}
	if u, err := a.Auth.Store.UserByEmail(r.Context(), normEmail(q.Email)); err == nil && !u.EmailVerified {
		a.sendLink(r.Context(), u, PurposeVerify)
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true})
}

func (a *App) login(w http.ResponseWriter, r *http.Request) {
	var q struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(w, r, &q) {
		return
	}
	email := normEmail(q.Email)
	if !a.Auth.loginIP.Allow(clientIP(r)) || !a.Auth.loginEmail.Allow(email) {
		apiError(w, http.StatusTooManyRequests, "too many attempts, try again later")
		return
	}
	u, err := a.Auth.Store.UserByEmail(r.Context(), email)
	hash := dummyHash
	if err == nil {
		hash = u.PasswordHash
	}
	if !verifyPassword(q.Password, hash) || err != nil {
		apiError(w, http.StatusUnauthorized, "incorrect email or password")
		return
	}
	if !u.EmailVerified {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "email_not_verified"})
		return
	}
	if u.Disabled {
		apiError(w, http.StatusForbidden, "account_disabled")
		return
	}
	if err := a.startSession(w, r, u.ID); err != nil {
		apiError(w, 500, "could not sign in")
		return
	}
	writeJSON(w, 200, a.meBody(r.Context(), u))
}

func (a *App) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		_ = a.Auth.Store.DeleteSession(r.Context(), tokenDigest(c.Value))
	}
	a.setSession(w, "", -time.Hour)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var q struct {
		Email string `json:"email"`
	}
	if !decode(w, r, &q) {
		return
	}
	if !a.Auth.mailIP.Allow(clientIP(r)) {
		apiError(w, http.StatusTooManyRequests, "too many attempts, try again later")
		return
	}
	if u, err := a.Auth.Store.UserByEmail(r.Context(), normEmail(q.Email)); err == nil {
		a.sendLink(r.Context(), u, PurposeReset)
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true})
}

func (a *App) resetPassword(w http.ResponseWriter, r *http.Request) {
	var q struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !decode(w, r, &q) {
		return
	}
	if n := utf8.RuneCountInString(q.Password); n < 8 || n > 128 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": map[string]string{"password": "Password must be 8-128 characters."}})
		return
	}
	id, err := a.Auth.Store.ConsumeToken(r.Context(), PurposeReset, tokenDigest(q.Token))
	if err != nil {
		apiError(w, http.StatusBadRequest, "this link is invalid or has expired")
		return
	}
	hash, err := hashPassword(q.Password)
	if err != nil || a.Auth.Store.SetPassword(r.Context(), id, hash) != nil {
		apiError(w, 500, "could not update password")
		return
	}
	_ = a.Auth.Store.SetEmailVerified(r.Context(), id) // the reset link proves mailbox ownership
	_ = a.Auth.Store.DeleteUserSessions(r.Context(), id)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) meBody(ctx context.Context, u User) map[string]any {
	body := map[string]any{"user": map[string]any{"id": u.ID, "email": u.Email, "role": u.Role, "emailVerified": u.EmailVerified}, "profile": nil}
	if p, err := a.Auth.Store.ProfileByUser(ctx, u.ID); err == nil {
		body["profile"] = p
	}
	return body
}

func (a *App) me(w http.ResponseWriter, r *http.Request) {
	u, ok := a.currentUser(r)
	if !ok {
		apiError(w, http.StatusUnauthorized, "not signed in")
		return
	}
	if u.Disabled {
		apiError(w, http.StatusForbidden, "account_disabled")
		return
	}
	writeJSON(w, 200, a.meBody(r.Context(), u))
}

var levels = map[string]bool{"public": true, "members": true, "hidden": true}

func (a *App) updateProfile(w http.ResponseWriter, r *http.Request, u User) {
	var q struct {
		Phone           *string `json:"phone"`
		BloodGroup      *string `json:"bloodGroup"`
		ShowInDirectory *bool   `json:"showInDirectory"`
		ShowPhone       *string `json:"showPhone"`
		ShowEmail       *string `json:"showEmail"`
		ShowBlood       *string `json:"showBlood"`
	}
	if !decode(w, r, &q) {
		return
	}
	errs := map[string]string{}
	if q.Phone != nil && *q.Phone != "" && !phoneRx.MatchString(*q.Phone) {
		errs["phone"] = "Use an 11-digit number starting with 01."
	}
	if q.BloodGroup != nil && *q.BloodGroup != "" && !bloodRx.MatchString(*q.BloodGroup) {
		errs["bloodGroup"] = "Choose a valid blood group."
	}
	for k, v := range map[string]*string{"showPhone": q.ShowPhone, "showEmail": q.ShowEmail, "showBlood": q.ShowBlood} {
		if v != nil && !levels[*v] {
			errs[k] = "Choose public, members or hidden."
		}
	}
	if len(errs) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": errs})
		return
	}
	err := a.Auth.Store.UpdateProfile(r.Context(), u.ID, ProfilePatch{Phone: q.Phone, BloodGroup: q.BloodGroup,
		ShowInDirectory: q.ShowInDirectory, ShowPhone: q.ShowPhone, ShowEmail: q.ShowEmail, ShowBlood: q.ShowBlood})
	if err == ErrNotFound {
		apiError(w, http.StatusNotFound, "no member profile for this account")
		return
	}
	if err != nil {
		apiError(w, 500, "could not save")
		return
	}
	writeJSON(w, 200, a.meBody(r.Context(), u))
}

func (a *App) createProfile(w http.ResponseWriter, r *http.Request, u User) {
	var q registerReq
	if !decode(w, r, &q) {
		return
	}
	q.Name = strings.TrimSpace(q.Name)
	if errs := a.validateProfile(&q); len(errs) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": errs})
		return
	}
	if existing, err := a.Auth.Store.ProfileByUser(r.Context(), u.ID); err == nil && existing.Status == StatusApproved {
		apiError(w, http.StatusConflict, "profile_locked") // approved details change only through the committee
		return
	}
	if err := a.Auth.Store.UpsertProfile(r.Context(), u.ID, Profile{
		UserID: u.ID, Name: q.Name, Batch: q.Batch, Department: q.Department,
		Upazila: q.Upazila, Union: q.Union, Session: strings.TrimSpace(q.Session), Gender: q.Gender, BloodGroup: q.BloodGroup,
	}); err != nil {
		log.Printf("profile upsert: %v", err)
		apiError(w, http.StatusInternalServerError, "could not create profile")
		return
	}
	writeJSON(w, http.StatusCreated, a.meBody(r.Context(), u))
}

func (a *App) adminOverview(w http.ResponseWriter, r *http.Request, _ User) {
	c, err := a.Auth.Store.Counts(r.Context())
	if err != nil {
		apiError(w, 500, "could not load")
		return
	}
	writeJSON(w, 200, map[string]any{"members": c})
}

func (a *App) adminMembers(w http.ResponseWriter, r *http.Request, _ User) {
	status := r.URL.Query().Get("status")
	if status != "" && status != StatusPending && status != StatusApproved && status != StatusRejected {
		apiError(w, 400, "unknown status")
		return
	}
	rows, err := a.Auth.Store.ListMembers(r.Context(), status)
	if err != nil {
		apiError(w, 500, "could not load")
		return
	}
	writeJSON(w, 200, map[string]any{"items": rows})
}

func (a *App) review(status string) func(http.ResponseWriter, *http.Request, User) {
	return func(w http.ResponseWriter, r *http.Request, _ User) {
		err := a.Auth.Store.ReviewProfile(r.Context(), r.PathValue("id"), status)
		if err == ErrNotFound {
			apiError(w, http.StatusNotFound, "member not found")
			return
		}
		if err != nil {
			apiError(w, 500, "could not update")
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "status": status})
	}
}

// directoryStudents returns imported students plus approved, directory-visible members.
func (a *App) directoryStudents(ctx context.Context) []Student {
	all := a.Store.Students
	if a.Auth != nil {
		if extra, err := a.Auth.Store.ApprovedDirectory(ctx); err == nil {
			all = append(append([]Student{}, all...), extra...)
		} else {
			log.Printf("approved directory: %v", err)
		}
	}
	return all
}

// originGuard rejects cross-site state-changing requests (CSRF defence for cookie sessions).
func (a *App) originGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
			if o := r.Header.Get("Origin"); o != "" && o != a.Origin && a.Origin != "*" {
				apiError(w, http.StatusForbidden, "cross-site request blocked")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// ---- role management (admins only; every rule is enforced in the store, not only here) ----

func (a *App) adminUsers(w http.ResponseWriter, r *http.Request, _ User) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if utf8.RuneCountInString(q) > 100 {
		apiError(w, http.StatusBadRequest, "search text is too long")
		return
	}
	role := r.URL.Query().Get("role")
	if role != "" && role != RoleMember && role != RoleAdmin {
		apiError(w, http.StatusBadRequest, "unknown role")
		return
	}
	v := r.URL.Query()
	if !userSorts[v.Get("sort")] || (v.Get("verified") != "" && v.Get("verified") != "yes" && v.Get("verified") != "no") ||
		(v.Get("account") != "" && v.Get("account") != "active" && v.Get("account") != "deactivated") {
		apiError(w, http.StatusBadRequest, "invalid filter")
		return
	}
	pg, limit := paging(r, 50)
	rows, total, err := a.Auth.Store.SearchUsers(r.Context(), UserQuery{Q: q, Role: role, Verified: v.Get("verified"), Account: v.Get("account"), Sort: v.Get("sort"), Limit: limit, Offset: (pg - 1) * limit})
	if err != nil {
		log.Printf("list users: %v", err)
		apiError(w, 500, "could not load")
		return
	}
	pages := (total + limit - 1) / limit
	if pages == 0 {
		pages = 1
	}
	writeJSON(w, 200, map[string]any{"items": rows, "total": total, "page": pg, "pages": pages})
}

func (a *App) setUserRole(w http.ResponseWriter, r *http.Request, actor User) {
	var q struct {
		Role string `json:"role"`
	}
	if !decode(w, r, &q) {
		return
	}
	// Promotion needs an approved membership (the store separately requires a confirmed email). Demotion has no such condition.
	if q.Role == RoleAdmin {
		if m, merr := a.Auth.Store.MemberAdmin(r.Context(), r.PathValue("id")); merr == nil {
			if m.Disabled {
				apiError(w, http.StatusConflict, "target_disabled")
				return
			}
			if m.Role != RoleAdmin && m.Status != StatusApproved {
				apiError(w, http.StatusConflict, "target_unapproved")
				return
			}
		} else if merr == ErrNotFound {
			if _, uerr := a.Auth.Store.UserByID(r.Context(), r.PathValue("id")); uerr == nil {
				apiError(w, http.StatusConflict, "target_unapproved") // an account with no member profile has no approved membership
				return
			}
		}
	}
	// The actor comes from the verified token, the target from the URL; nothing about identity or role is read from the body.
	u, err := a.Auth.Store.SetRole(r.Context(), actor.ID, r.PathValue("id"), q.Role)
	switch err {
	case nil:
		writeJSON(w, 200, map[string]any{"ok": true, "user": map[string]any{"id": u.ID, "email": u.Email, "role": u.Role}})
	case ErrInvalidRole:
		apiError(w, http.StatusUnprocessableEntity, "role must be member or admin")
	case ErrNotFound:
		apiError(w, http.StatusNotFound, "user not found")
	case ErrTargetUnverified:
		apiError(w, http.StatusConflict, "target_unverified")
	case ErrLastAdmin:
		apiError(w, http.StatusConflict, "last_admin")
	case ErrForbidden:
		apiError(w, http.StatusForbidden, "admin access required")
	default:
		log.Printf("set role: %v", err)
		apiError(w, 500, "could not change the role")
	}
}
