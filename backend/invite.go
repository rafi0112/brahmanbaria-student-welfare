package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// Activation invitations. An admin saves an email address on a directory record and asks Supabase Auth to invite it. Supabase
// sends the email through the project's own SMTP settings (the Google app password configured in the dashboard); this server
// never sends authentication email itself and never sees the SMTP password. "Sent" here means Supabase accepted the request,
// not that the message reached an inbox. The person then follows the single-use link, sets their own password and completes
// their profile, which creates a pending membership request.

var (
	ErrInviteExists      = errors.New("an account with this email already exists in Supabase Auth")
	ErrInviteRateLimited = errors.New("Supabase Auth is rate limiting email")
	ErrInviteNotAllowed  = errors.New("the Supabase admin key was refused")
	ErrInviteCompleted   = errors.New("this person has already activated their account")
	ErrInviteBadAddress  = errors.New("Supabase Auth rejected the recipient address")
	ErrInviteSMTP        = errors.New("Supabase Auth could not deliver the email through its SMTP settings")
)

type DirectoryInvite struct {
	ImportedID  string `json:"importedId"`
	Email       string `json:"email"`
	Status      string `json:"status"` // saved | sent | failed | completed
	AuthUserID  string `json:"-"`
	LastSentAt  string `json:"lastSentAt,omitempty"`
	SendCount   int    `json:"sendCount"`
	LastError   string `json:"lastError,omitempty"`
	CompletedAt string `json:"completedAt,omitempty"`
	CompletedUser string `json:"-"` // the account that activated through this record
	ReplacesUser  string `json:"-"` // the member's earlier account while a move to a new email awaits approval
}

type InviteStore interface {
	// SetInviteEmail saves the address for a record. ErrEmailTaken when another record uses it, ErrInviteCompleted once activated.
	SetInviteEmail(ctx context.Context, importedID, email string) error
	InviteFor(ctx context.Context, importedID string) (DirectoryInvite, error)
	InviteByEmail(ctx context.Context, email string) (DirectoryInvite, error)
	Invites(ctx context.Context) (map[string]DirectoryInvite, error)
	// RecordInvite stores the outcome of one attempt that reached the provider and logs it for the rate limits.
	RecordInvite(ctx context.Context, importedID string, sent bool, authUserID, note string) error
	InviteEvents(ctx context.Context, since time.Time) (int, error)
	CompleteInvite(ctx context.Context, importedID, userID string) error
	// DeleteInviteEmail forgets the saved address (ErrInviteCompleted once the person has activated; ErrNotFound if none is saved).
	// It never touches the Supabase Auth user an earlier invitation may have created.
	DeleteInviteEmail(ctx context.Context, importedID string) error
	// ClearReplaced forgets the earlier account once the move to the new email has been approved.
	ClearReplaced(ctx context.Context, importedID string) error
}

// ---------------------------------------------------------------- Supabase Auth admin client

type Inviter interface {
	Invite(ctx context.Context, email, redirectTo string) (authUserID string, err error)
}

type supabaseAdmin struct {
	baseURL string
	key     string // secret or legacy service-role key: server side only, never logged, never sent to the browser
	client  *http.Client
}

// Kind says which generation of key this is. New secret keys (sb_secret_...) are opaque strings, not JWTs, so they travel only
// in the apikey header; sending one as a Bearer token is rejected. Legacy service-role keys are JWTs and need both headers.
func (s *supabaseAdmin) Kind() string {
	if strings.HasPrefix(s.key, "sb_secret_") {
		return "secret"
	}
	if strings.Count(s.key, ".") == 2 {
		return "legacy-jwt"
	}
	return "unknown"
}

func (s *supabaseAdmin) setAuth(req *http.Request) {
	req.Header.Set("apikey", s.key)
	if s.Kind() != "secret" {
		req.Header.Set("Authorization", "Bearer "+s.key)
	}
}

// pickAdminKey prefers the new secret key and falls back to the legacy service-role key. It also refuses values that are
// plainly the wrong kind of key (a publishable/anon key is public by design and has no admin rights).
func pickAdminKey(secret, legacy string) (key, source string) {
	for _, c := range []struct{ v, name string }{{secret, "SUPABASE_SECRET_KEY"}, {legacy, "SUPABASE_SERVICE_ROLE_KEY"}} {
		v := strings.Trim(strings.TrimSpace(c.v), `"'`)
		if v != "" && !strings.HasPrefix(v, "sb_publishable_") {
			return v, c.name
		}
	}
	return "", ""
}

func newSupabaseAdmin(baseURL, key string) *supabaseAdmin {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	for _, suffix := range []string{"/rest/v1", "/auth/v1"} {
		baseURL = strings.TrimSuffix(baseURL, suffix)
	}
	key = strings.TrimSpace(key)
	if baseURL == "" || key == "" {
		return nil
	}
	return &supabaseAdmin{baseURL: baseURL, key: key, client: &http.Client{Timeout: 15 * time.Second}}
}

// Check asks Supabase Auth's admin API for one user. It sends nothing and changes nothing; it only proves the key is accepted.
// The result never contains the key.
func (s *supabaseAdmin) Check(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/auth/v1/admin/users?page=1&per_page=1", nil)
	if err != nil {
		return err
	}
	s.setAuth(req)
	res, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("could not reach Supabase Auth")
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64<<10))
	switch {
	case res.StatusCode >= 200 && res.StatusCode < 300:
		return nil
	case res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden:
		return ErrInviteNotAllowed
	}
	return fmt.Errorf("Supabase Auth answered HTTP %d to the key check", res.StatusCode)
}

func (s *supabaseAdmin) Invite(ctx context.Context, email, redirectTo string) (string, error) {
	endpoint := s.baseURL + "/auth/v1/invite"
	if redirectTo != "" {
		endpoint += "?redirect_to=" + url.QueryEscape(redirectTo)
	}
	// no profile details travel with the invitation: only the address
	body, _ := json.Marshal(map[string]any{"email": email})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	s.setAuth(req)
	req.Header.Set("Content-Type", "application/json")
	res, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("invite request failed")
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 64<<10))
	var out struct {
		ID        string `json:"id"`
		ErrorCode string `json:"error_code"`
		Msg       string `json:"msg"`
	}
	_ = json.Unmarshal(raw, &out)
	switch {
	case res.StatusCode >= 200 && res.StatusCode < 300 && out.ID != "":
		return out.ID, nil
	case out.ErrorCode == "email_exists" || out.ErrorCode == "user_already_exists" || strings.Contains(strings.ToLower(out.Msg), "already been registered"):
		return "", ErrInviteExists
	case res.StatusCode == http.StatusTooManyRequests || out.ErrorCode == "over_email_send_rate_limit" || out.ErrorCode == "over_request_rate_limit":
		return "", ErrInviteRateLimited
	case res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden:
		return "", ErrInviteNotAllowed
	case out.ErrorCode == "email_address_invalid" || out.ErrorCode == "validation_failed" || (res.StatusCode < 500 && strings.Contains(strings.ToLower(out.Msg), "email") && strings.Contains(strings.ToLower(out.Msg), "invalid")):
		return "", ErrInviteBadAddress
	case res.StatusCode >= 500 && (strings.Contains(strings.ToLower(out.Msg), "sending") || strings.Contains(strings.ToLower(out.Msg), "smtp") || out.ErrorCode == "email_provider_disabled" || out.ErrorCode == "unexpected_failure"):
		return "", ErrInviteSMTP // the invitation itself was valid; Supabase's mail transport failed
	}
	return "", fmt.Errorf("supabase answered HTTP %d (%s)", res.StatusCode, out.ErrorCode)
}

// ---------------------------------------------------------------- limits

type InviteConfig struct {
	PerHour, PerDay int
	Cooldown        time.Duration
	ExpiryHours     int
	Redirect        string
}

func envInt(name string, def int) int {
	if v, err := strconv.Atoi(strings.TrimSpace(os.Getenv(name))); err == nil && v >= 0 {
		return v
	}
	return def
}

// loadInviteConfig reads the application-level limits. They are safety defaults, not a statement about what Gmail or Supabase
// allow: the stricter of these and the provider limits applies, and the provider limits are set in the Supabase dashboard.
func loadInviteConfig(frontendURL string) InviteConfig {
	redirect := strings.TrimSpace(os.Getenv("INVITE_REDIRECT_URL"))
	if redirect == "" {
		redirect = strings.TrimRight(frontendURL, "/") + "/activate"
	}
	return InviteConfig{PerHour: envInt("INVITE_MAX_PER_HOUR", 20), PerDay: envInt("INVITE_MAX_PER_DAY", 100),
		Cooldown: time.Duration(envInt("INVITE_RESEND_COOLDOWN_MINUTES", 60)) * time.Minute, ExpiryHours: envInt("INVITE_LINK_EXPIRY_HOURS", 24), Redirect: redirect}
}

// keyState is what the startup check learned about the admin key: missing | checking | valid | invalid | unreachable.
var (
	keyMu    sync.Mutex
	keyState = "missing"
	keyKind  = ""
)

func setKeyState(state, kind string) { keyMu.Lock(); keyState, keyKind = state, kind; keyMu.Unlock() }
func getKeyState() (string, string) { keyMu.Lock(); defer keyMu.Unlock(); return keyState, keyKind }

// verifyAdminKey runs the harmless check once and logs a clear diagnostic. It is called at startup and again before a send when
// the last result was inconclusive.
func verifyAdminKey(ctx context.Context, adm *supabaseAdmin, source string) {
	setKeyState("checking", adm.Kind())
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	err := adm.Check(cctx)
	switch {
	case err == nil:
		setKeyState("valid", adm.Kind())
		log.Printf("member invitations ready: Supabase accepted the admin key from %s (%s key)", source, adm.Kind())
	case errors.Is(err, ErrInviteNotAllowed):
		setKeyState("invalid", adm.Kind())
		log.Printf("member invitations DISABLED: Supabase refused the key from %s (%s key). Copy the Secret key (sb_secret_...) from Supabase Project Settings > API Keys into SUPABASE_SECRET_KEY, and check that a legacy service_role key has not been disabled or rotated.", source, adm.Kind())
	default:
		setKeyState("unreachable", adm.Kind())
		log.Printf("member invitations: the admin key could not be checked (%v); it will be checked again before the next send", err)
	}
}

var inviteMu sync.Mutex // one send at a time, so two clicks cannot slip past the cooldown or the limits

// ---------------------------------------------------------------- handlers

func (a *App) inviteRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("PATCH /api/v1/admin/imported-students/{id}/email", adm(a.inviteSetEmail))
	m.HandleFunc("DELETE /api/v1/admin/imported-students/{id}/email", adm(a.inviteDeleteEmail))
	m.HandleFunc("POST /api/v1/admin/imported-students/{id}/invite", adm(a.inviteSend))
	m.HandleFunc("POST /api/v1/admin/invitations/send", adm(a.inviteBulk))
	m.HandleFunc("GET /api/v1/admin/invitations/status", adm(a.inviteStatus))
	m.HandleFunc("GET /api/v1/me/invitation", h(a.requireUser(a.myInvitation)))
}

// inviteState adds the derived "expired" flag and the age to a stored invite.
func (a *App) inviteView(inv DirectoryInvite) map[string]any {
	out := map[string]any{"email": inv.Email, "status": inv.Status, "lastSentAt": inv.LastSentAt, "sendCount": inv.SendCount, "lastError": inv.LastError, "completedAt": inv.CompletedAt}
	if inv.Status == "sent" && inv.LastSentAt != "" {
		if t, err := time.Parse(time.RFC3339, inv.LastSentAt); err == nil && a.Auth.Invite.ExpiryHours > 0 && time.Since(t) > time.Duration(a.Auth.Invite.ExpiryHours)*time.Hour {
			out["expired"] = true // the link has probably lapsed; a new invitation is needed
		}
	}
	return out
}

func (a *App) inviteSetEmail(w http.ResponseWriter, r *http.Request, u User) {
	var q struct {
		Email string `json:"email"`
	}
	if !decode(w, r, &q) {
		return
	}
	id := r.PathValue("id")
	if _, ok := a.importedFind(r.Context(), id); !ok {
		apiError(w, http.StatusNotFound, "imported record not found")
		return
	}
	email := strings.ToLower(strings.TrimSpace(q.Email))
	if !emailRx.MatchString(email) || utf8.RuneCountInString(email) > 120 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": map[string]string{"email": "Enter a real email address."}})
		return
	}
	if _, err := a.Auth.Store.UserByEmail(r.Context(), email); err == nil {
		apiError(w, http.StatusConflict, "email_in_use") // a registered account already uses it; that person signs in or resets their password
		return
	}
	if cur, err := a.Auth.Store.InviteFor(r.Context(), id); err == nil && cur.Status == "completed" && !strings.EqualFold(cur.Email, email) && cur.CompletedUser != "" {
		if owner, err := a.Auth.Store.UserByID(r.Context(), cur.CompletedUser); err == nil && owner.Role == RoleAdmin {
			apiError(w, http.StatusConflict, "admin_account") // an administrator's sign-in is never moved by this flow
			return
		}
	}
	switch err := a.Auth.Store.SetInviteEmail(r.Context(), id, email); {
	case err == nil:
	case errors.Is(err, ErrEmailTaken):
		apiError(w, http.StatusConflict, "email_taken")
		return
	case errors.Is(err, ErrInviteCompleted):
		apiError(w, http.StatusConflict, "already_completed")
		return
	default:
		log.Printf("invite email: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "invite.email", "imported", id, nil) // never the address itself
	inv, _ := a.Auth.Store.InviteFor(r.Context(), id)
	writeJSON(w, 200, a.inviteView(inv))
}

func (a *App) inviteDeleteEmail(w http.ResponseWriter, r *http.Request, u User) {
	id := r.PathValue("id")
	if _, ok := a.importedFind(r.Context(), id); !ok {
		apiError(w, http.StatusNotFound, "imported record not found")
		return
	}
	inviteMu.Lock()
	defer inviteMu.Unlock()
	switch err := a.Auth.Store.DeleteInviteEmail(r.Context(), id); {
	case err == nil:
	case errors.Is(err, ErrNotFound):
		apiError(w, http.StatusNotFound, "no_email")
		return
	case errors.Is(err, ErrInviteCompleted):
		apiError(w, http.StatusConflict, "already_completed") // the person already owns an account through this address
		return
	default:
		log.Printf("invite email delete: %v", err)
		apiError(w, 500, "could not delete")
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "invite.email.delete", "imported", id, nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// sendInvite runs every check and the provider call for one record. code is the API error to report ("" on success).
func (a *App) sendInvite(ctx context.Context, actor User, id string) (inv DirectoryInvite, code string, status int, extra map[string]any) {
	inviteMu.Lock()
	defer inviteMu.Unlock()
	if _, ok := a.importedFind(ctx, id); !ok {
		return inv, "not_found", http.StatusNotFound, nil
	}
	inv, err := a.Auth.Store.InviteFor(ctx, id)
	if err != nil || inv.Email == "" {
		return inv, "no_email", http.StatusUnprocessableEntity, nil
	}
	if inv.Status == "completed" {
		return inv, "already_completed", http.StatusConflict, nil
	}
	if a.Auth.Inviter == nil {
		return inv, "invite_not_configured", http.StatusServiceUnavailable, nil
	}
	if adm, ok := a.Auth.Inviter.(*supabaseAdmin); ok {
		if st, _ := getKeyState(); st != "valid" {
			if st != "invalid" {
				verifyAdminKey(ctx, adm, "the configured key") // inconclusive so far: try again now
			}
			if st, _ = getKeyState(); st == "invalid" {
				return inv, "invite_key_invalid", http.StatusServiceUnavailable, nil
			}
		}
	}
	cfg := a.Auth.Invite
	if inv.LastSentAt != "" && inv.Status != "failed" {
		if t, perr := time.Parse(time.RFC3339, inv.LastSentAt); perr == nil && time.Since(t) < cfg.Cooldown {
			return inv, "cooldown", http.StatusTooManyRequests, map[string]any{"retryAfterSeconds": int((cfg.Cooldown - time.Since(t)).Seconds()) + 1}
		}
	}
	if cfg.PerHour > 0 {
		if n, _ := a.Auth.Store.InviteEvents(ctx, time.Now().Add(-time.Hour)); n >= cfg.PerHour {
			return inv, "limit_hour", http.StatusTooManyRequests, map[string]any{"limit": cfg.PerHour}
		}
	}
	if cfg.PerDay > 0 {
		if n, _ := a.Auth.Store.InviteEvents(ctx, time.Now().Add(-24*time.Hour)); n >= cfg.PerDay {
			return inv, "limit_day", http.StatusTooManyRequests, map[string]any{"limit": cfg.PerDay}
		}
	}
	if _, uerr := a.Auth.Store.UserByEmail(ctx, inv.Email); uerr == nil {
		return inv, "account_exists", http.StatusConflict, nil // never create a second account; they should use Forgot password
	}
	cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	authID, ierr := a.Auth.Inviter.Invite(cctx, inv.Email, cfg.Redirect)
	switch {
	case ierr == nil:
		if err := a.Auth.Store.RecordInvite(ctx, id, true, authID, ""); err != nil {
			// Supabase accepted the invitation but we could not store that: tell the admin instead of claiming a clean success
			log.Printf("invite: sent but not recorded: %v", err)
			return inv, "recorded_failed", http.StatusInternalServerError, nil
		}
		_ = a.Auth.Store.Audit(ctx, actor.ID, "invite.send", "imported", id, map[string]any{"resend": inv.SendCount > 0})
	case errors.Is(ierr, ErrInviteExists):
		return inv, "account_exists", http.StatusConflict, nil
	case errors.Is(ierr, ErrInviteRateLimited):
		_ = a.Auth.Store.RecordInvite(ctx, id, false, "", "provider rate limit")
		return inv, "provider_rate_limited", http.StatusTooManyRequests, nil
	case errors.Is(ierr, ErrInviteNotAllowed):
		setKeyState("invalid", "")
		return inv, "invite_key_invalid", http.StatusServiceUnavailable, nil
	case errors.Is(ierr, ErrInviteBadAddress):
		_ = a.Auth.Store.RecordInvite(ctx, id, false, "", "recipient rejected")
		return inv, "invalid_recipient", http.StatusUnprocessableEntity, nil
	case errors.Is(ierr, ErrInviteSMTP):
		_ = a.Auth.Store.RecordInvite(ctx, id, false, "", "email delivery failed in Supabase SMTP")
		return inv, "smtp_failed", http.StatusBadGateway, nil
	default:
		log.Printf("invite: %v", ierr)
		_ = a.Auth.Store.RecordInvite(ctx, id, false, "", "provider error")
		return inv, "invite_failed", http.StatusBadGateway, nil
	}
	inv, _ = a.Auth.Store.InviteFor(ctx, id)
	return inv, "", http.StatusOK, nil
}

func (a *App) inviteSend(w http.ResponseWriter, r *http.Request, u User) {
	inv, code, status, extra := a.sendInvite(r.Context(), u, r.PathValue("id"))
	if code != "" {
		body := map[string]any{"error": code}
		for k, v := range extra {
			body[k] = v
		}
		writeJSON(w, status, body)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "invite": a.inviteView(inv), "note": "accepted_by_provider"})
}

// inviteBulk sends the next batch of saved-but-unsent invitations, one at a time, and stops as soon as a limit or a provider
// problem appears. It never retries failures by itself; failed records are retried one by one by an admin.
func (a *App) inviteBulk(w http.ResponseWriter, r *http.Request, u User) {
	invites, err := a.Auth.Store.Invites(r.Context())
	if err != nil {
		apiError(w, 500, "could not load")
		return
	}
	const max = 20 // one batch never exceeds this; the hourly and daily limits stop it sooner when they are lower
	sent, failed, skipped := 0, 0, 0
	stopped := ""
	tried := 0
	for id, inv := range invites {
		if inv.Status != "saved" {
			continue
		}
		if tried >= max {
			stopped = "batch_size"
			break
		}
		tried++
		_, code, _, _ := a.sendInvite(r.Context(), u, id)
		switch code {
		case "":
			sent++
		case "account_exists", "no_email", "already_completed", "cooldown", "not_found":
			skipped++
		case "limit_hour", "limit_day", "provider_rate_limited", "invite_not_configured", "invite_key_invalid":
			stopped = code
		default:
			failed++
			stopped = code // a provider failure slows the batch to a stop instead of hammering it
		}
		if stopped != "" {
			break
		}
	}
	writeJSON(w, 200, map[string]any{"sent": sent, "failed": failed, "skipped": skipped, "stopped": stopped})
}

func (a *App) inviteStatus(w http.ResponseWriter, r *http.Request, _ User) {
	cfg := a.Auth.Invite
	h, _ := a.Auth.Store.InviteEvents(r.Context(), time.Now().Add(-time.Hour))
	d, _ := a.Auth.Store.InviteEvents(r.Context(), time.Now().Add(-24*time.Hour))
	invites, _ := a.Auth.Store.Invites(r.Context())
	counts := map[string]int{"saved": 0, "sent": 0, "failed": 0, "completed": 0}
	for _, inv := range invites {
		counts[inv.Status]++
	}
	ks, kk := getKeyState()
	if a.Auth.Inviter == nil {
		ks = "missing"
	} else if _, real := a.Auth.Inviter.(*supabaseAdmin); !real {
		ks, kk = "valid", "test"
	}
	writeJSON(w, 200, map[string]any{"configured": a.Auth.Inviter != nil && ks != "invalid", "keyStatus": ks, "keyKind": kk, "perHour": cfg.PerHour, "perDay": cfg.PerDay, "usedHour": h, "usedDay": d,
		"cooldownMinutes": int(cfg.Cooldown / time.Minute), "linkExpiryHours": cfg.ExpiryHours, "counts": counts})
}

// myInvitation answers the activation page: if the signed-in, email-verified person was invited, it returns the details of their
// directory record to prefill the form. Nothing is returned for unverified addresses, so the data is only released to whoever
// really controls the invited mailbox.
func (a *App) myInvitation(w http.ResponseWriter, r *http.Request, u User) {
	none := map[string]any{"invited": false}
	if !u.EmailVerified {
		writeJSON(w, 200, none)
		return
	}
	if p, err := a.Auth.Store.ProfileByUser(r.Context(), u.ID); err == nil && p != nil {
		writeJSON(w, 200, map[string]any{"invited": false, "hasProfile": true})
		return
	}
	inv, err := a.Auth.Store.InviteByEmail(r.Context(), u.Email)
	if err != nil || inv.Status == "completed" {
		writeJSON(w, 200, none)
		return
	}
	rec, ok := a.importedFind(r.Context(), inv.ImportedID)
	if !ok {
		writeJSON(w, 200, none)
		return
	}
	batch := 0
	if rec.Batch != nil {
		batch = *rec.Batch
	}
	writeJSON(w, 200, map[string]any{"invited": true, "profile": map[string]any{"name": rec.Name, "batch": batch, "department": rec.Department, "session": rec.Session, "upazila": rec.Upazila}})
}

// completeInviteFor marks the invitation done once the person's profile exists. It never creates a second profile or request:
// the profile is the one createProfile just wrote for this account.
func (a *App) completeInviteFor(ctx context.Context, u User) {
	if !u.EmailVerified {
		return
	}
	inv, err := a.Auth.Store.InviteByEmail(ctx, u.Email)
	if err != nil || inv.Status == "completed" {
		return
	}
	if err := a.Auth.Store.CompleteInvite(ctx, inv.ImportedID, u.ID); err != nil {
		log.Printf("invite complete: %v", err)
		return
	}
	_ = a.Auth.Store.Audit(ctx, u.ID, "invite.completed", "imported", inv.ImportedID, nil)
}

// ---------------------------------------------------------------- memory store

type memInvite struct {
	DirectoryInvite
	sentAt time.Time
}

func (m *memStore) SetInviteEmail(_ context.Context, importedID, email string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.invites == nil {
		m.invites = map[string]*memInvite{}
	}
	for id, iv := range m.invites {
		if strings.EqualFold(iv.Email, email) && id != importedID {
			return ErrEmailTaken
		}
	}
	if cur, ok := m.invites[importedID]; ok {
		if cur.Status == "completed" && strings.EqualFold(cur.Email, email) {
			return ErrInviteCompleted
		}
		if !strings.EqualFold(cur.Email, email) {
			if cur.ReplacesUser == "" {
				cur.ReplacesUser = cur.CompletedUser
			}
			cur.Status, cur.AuthUserID, cur.LastError, cur.CompletedUser, cur.CompletedAt = "saved", "", "", "", ""
		}
		cur.Email = email
		return nil
	}
	m.invites[importedID] = &memInvite{DirectoryInvite: DirectoryInvite{ImportedID: importedID, Email: email, Status: "saved"}}
	return nil
}

func (m *memStore) InviteFor(_ context.Context, importedID string) (DirectoryInvite, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if iv, ok := m.invites[importedID]; ok {
		return iv.DirectoryInvite, nil
	}
	return DirectoryInvite{}, ErrNotFound
}

func (m *memStore) InviteByEmail(_ context.Context, email string) (DirectoryInvite, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, iv := range m.invites {
		if strings.EqualFold(iv.Email, email) {
			return iv.DirectoryInvite, nil
		}
	}
	return DirectoryInvite{}, ErrNotFound
}

func (m *memStore) Invites(_ context.Context) (map[string]DirectoryInvite, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]DirectoryInvite{}
	for id, iv := range m.invites {
		out[id] = iv.DirectoryInvite
	}
	return out, nil
}

func (m *memStore) RecordInvite(_ context.Context, importedID string, sent bool, authUserID, note string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	iv, ok := m.invites[importedID]
	if !ok {
		return ErrNotFound
	}
	now := time.Now().UTC()
	m.inviteLog = append(m.inviteLog, now)
	if sent {
		iv.Status, iv.AuthUserID, iv.LastError = "sent", authUserID, ""
		iv.LastSentAt, iv.sentAt = now.Format(time.RFC3339), now
		iv.SendCount++
	} else {
		iv.Status, iv.LastError = "failed", note
	}
	return nil
}

func (m *memStore) InviteEvents(_ context.Context, since time.Time) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, at := range m.inviteLog {
		if at.After(since) {
			n++
		}
	}
	return n, nil
}

func (m *memStore) DeleteInviteEmail(_ context.Context, importedID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	iv, ok := m.invites[importedID]
	if !ok {
		return ErrNotFound
	}
	if iv.Status == "completed" {
		return ErrInviteCompleted
	}
	if iv.ReplacesUser != "" {
		return ErrInviteCompleted
	}
	delete(m.invites, importedID)
	return nil
}

func (m *memStore) ClearReplaced(_ context.Context, importedID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if iv, ok := m.invites[importedID]; ok {
		iv.ReplacesUser = ""
	}
	return nil
}

func (m *memStore) CompleteInvite(_ context.Context, importedID, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	iv, ok := m.invites[importedID]
	if !ok {
		return ErrNotFound
	}
	iv.Status, iv.CompletedAt, iv.CompletedUser = "completed", time.Now().UTC().Format(time.RFC3339), userID
	return nil
}

// ---------------------------------------------------------------- PostgreSQL store

const inviteCols = `imported_id, email, status, auth_user_id, COALESCE(to_char(last_sent_at AT TIME ZONE 'UTC', ` + tsFmt + `), ''), send_count, last_error, COALESCE(to_char(completed_at AT TIME ZONE 'UTC', ` + tsFmt + `), ''), COALESCE(completed_user::text, ''), COALESCE(replaces_user::text, '')`

func scanInvite(r rowScanner) (DirectoryInvite, error) {
	var v DirectoryInvite
	err := r.Scan(&v.ImportedID, &v.Email, &v.Status, &v.AuthUserID, &v.LastSentAt, &v.SendCount, &v.LastError, &v.CompletedAt, &v.CompletedUser, &v.ReplacesUser)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, ErrNotFound
	}
	return v, err
}

func (s *pgStore) SetInviteEmail(ctx context.Context, importedID, email string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	cur, err := scanInvite(tx.QueryRow(ctx, `SELECT `+inviteCols+` FROM directory_invites WHERE imported_id = $1 FOR UPDATE`, importedID))
	if err != nil && !errors.Is(err, ErrNotFound) {
		return err
	}
	if err == nil && cur.Status == "completed" && strings.EqualFold(cur.Email, email) {
		return ErrInviteCompleted
	}
	if errors.Is(err, ErrNotFound) {
		_, err = tx.Exec(ctx, `INSERT INTO directory_invites (imported_id, email) VALUES ($1, $2)`, importedID, email)
	} else {
		// a changed address resets the invitation; if the person had already activated, the earlier account is remembered
		_, err = tx.Exec(ctx, `UPDATE directory_invites SET email = $2, updated_at = now(),
			replaces_user = CASE WHEN lower(email) = lower($2) THEN replaces_user ELSE COALESCE(replaces_user, completed_user) END,
			status = CASE WHEN lower(email) = lower($2) THEN status ELSE 'saved' END,
			auth_user_id = CASE WHEN lower(email) = lower($2) THEN auth_user_id ELSE '' END,
			last_error = CASE WHEN lower(email) = lower($2) THEN last_error ELSE '' END,
			completed_at = CASE WHEN lower(email) = lower($2) THEN completed_at ELSE NULL END,
			completed_user = CASE WHEN lower(email) = lower($2) THEN completed_user ELSE NULL END WHERE imported_id = $1`, importedID, email)
	}
	if err != nil {
		if isUnique(err) {
			return ErrEmailTaken
		}
		return err
	}
	return tx.Commit(ctx)
}

func (s *pgStore) InviteFor(ctx context.Context, importedID string) (DirectoryInvite, error) {
	return scanInvite(s.db.QueryRow(ctx, `SELECT `+inviteCols+` FROM directory_invites WHERE imported_id = $1`, importedID))
}

func (s *pgStore) InviteByEmail(ctx context.Context, email string) (DirectoryInvite, error) {
	return scanInvite(s.db.QueryRow(ctx, `SELECT `+inviteCols+` FROM directory_invites WHERE lower(email) = lower($1)`, email))
}

func (s *pgStore) Invites(ctx context.Context) (map[string]DirectoryInvite, error) {
	rows, err := s.db.Query(ctx, `SELECT `+inviteCols+` FROM directory_invites`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]DirectoryInvite{}
	for rows.Next() {
		v, err := scanInvite(rows)
		if err != nil {
			return nil, err
		}
		out[v.ImportedID] = v
	}
	return out, rows.Err()
}

func (s *pgStore) RecordInvite(ctx context.Context, importedID string, sent bool, authUserID, note string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var tag int64
	if sent {
		t, err := tx.Exec(ctx, `UPDATE directory_invites SET status = 'sent', auth_user_id = $2, last_error = '', last_sent_at = now(), send_count = send_count + 1, updated_at = now() WHERE imported_id = $1`, importedID, authUserID)
		if err != nil {
			return err
		}
		tag = t.RowsAffected()
	} else {
		t, err := tx.Exec(ctx, `UPDATE directory_invites SET status = 'failed', last_error = $2, updated_at = now() WHERE imported_id = $1`, importedID, note)
		if err != nil {
			return err
		}
		tag = t.RowsAffected()
	}
	if tag == 0 {
		return ErrNotFound
	}
	outcome := "failed"
	if sent {
		outcome = "sent"
	}
	if _, err := tx.Exec(ctx, `INSERT INTO invite_log (imported_id, outcome) VALUES ($1, $2)`, importedID, outcome); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *pgStore) InviteEvents(ctx context.Context, since time.Time) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM invite_log WHERE at > $1`, since.UTC()).Scan(&n)
	return n, err
}

func (s *pgStore) DeleteInviteEmail(ctx context.Context, importedID string) error {
	t, err := s.db.Exec(ctx, `DELETE FROM directory_invites WHERE imported_id = $1 AND status <> 'completed' AND replaces_user IS NULL`, importedID)
	if err != nil {
		return err
	}
	if t.RowsAffected() == 0 {
		cur, err := scanInvite(s.db.QueryRow(ctx, `SELECT `+inviteCols+` FROM directory_invites WHERE imported_id = $1`, importedID))
		if err != nil {
			return err // ErrNotFound when nothing is saved
		}
		if cur.Status == "completed" || cur.ReplacesUser != "" {
			return ErrInviteCompleted
		}
	}
	return nil
}

func (s *pgStore) ClearReplaced(ctx context.Context, importedID string) error {
	_, err := s.db.Exec(ctx, `UPDATE directory_invites SET replaces_user = NULL, updated_at = now() WHERE imported_id = $1`, importedID)
	return err
}

func (s *pgStore) CompleteInvite(ctx context.Context, importedID, userID string) error {
	t, err := s.db.Exec(ctx, `UPDATE directory_invites SET status = 'completed', completed_at = now(), completed_user = NULLIF($2, '')::uuid, updated_at = now() WHERE imported_id = $1`, importedID, userID)
	if err != nil {
		return err
	}
	if t.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
