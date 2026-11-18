package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

// Contact inbox. Visitor messages are stored in PostgreSQL for a fixed 30 days, the configured mailbox is notified,
// and admins can read and answer them. The retention clock starts at submission and nothing an admin does changes it.

const contactRetention = 30 * 24 * time.Hour

type ContactReply struct {
	ID        int64  `json:"id"`
	SentBy    string `json:"sentBy"`
	Body      string `json:"body"`
	Status    string `json:"status"` // sent | failed
	Error     string `json:"error,omitempty"`
	CreatedAt string `json:"createdAt"`
}

type ContactMessage struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Email        string         `json:"email"`
	Subject      string         `json:"subject"`
	Message      string         `json:"message"`
	Status       string         `json:"status"`       // new | read | replied | archived
	NotifyStatus string         `json:"notifyStatus"` // pending | sent | failed | skipped
	CreatedAt    string         `json:"createdAt"`
	ExpiresAt    string         `json:"expiresAt"`
	ReadAt       string         `json:"readAt,omitempty"`
	RepliedAt    string         `json:"repliedAt,omitempty"`
	Replies      []ContactReply `json:"replies,omitempty"`
}

type ContactInput struct{ Name, Email, Subject, Message string }

type ContactQuery struct {
	Status   string // "" inbox (everything not archived), all, new, read, replied, archived
	Q        string
	From, To string // YYYY-MM-DD, inclusive, on the submission date
	Page     int
	Limit    int
}

type ContactStore interface {
	CreateContact(ctx context.Context, in ContactInput, expires time.Time) (ContactMessage, error)
	ListContacts(ctx context.Context, q ContactQuery) ([]ContactMessage, int, map[string]int, error)
	GetContact(ctx context.Context, id string) (ContactMessage, error)
	SetContactStatus(ctx context.Context, id, status string) error // new | read | archived only
	SetContactNotify(ctx context.Context, id, status string) error
	AddContactReply(ctx context.Context, id, actorID, body, status, errNote string) error
	DeleteContact(ctx context.Context, id string) error
	// PurgeExpiredContacts deletes every message past its expiry together with its replies and returns how many messages went.
	PurgeExpiredContacts(ctx context.Context) (int, error)
}

// oneLine removes anything that could break out of a single line (a subject shown in the admin panel and its exports).
func oneLine(s string, max int) string {
	s = strings.Join(strings.FieldsFunc(s, func(r rune) bool { return r == '\r' || r == '\n' || r == 0 || r == '\u2028' || r == '\u2029' }), " ")
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > max {
		s = string([]rune(s)[:max])
	}
	return s
}

// ---- public form ----

// submitContact stores the message for the admins' inbox and answers at once. No email is sent: admins read messages in
// the panel (and write back from their own mail if they want to).
func (a *App) submitContact(w http.ResponseWriter, r *http.Request, c contactReq) {
	in := ContactInput{Name: strings.TrimSpace(c.Name), Email: strings.ToLower(strings.TrimSpace(c.Email)), Subject: oneLine(c.Subject, 120), Message: strings.TrimSpace(c.Message)}
	m, err := a.Auth.Store.CreateContact(r.Context(), in, time.Now().Add(contactRetention))
	if err != nil {
		log.Printf("contact save: %v", err)
		apiError(w, http.StatusInternalServerError, "could not save message")
		return
	}
	if n, err := a.Auth.Store.PurgeExpiredContacts(r.Context()); err != nil {
		log.Printf("contact purge: %v", err)
	} else if n > 0 {
		log.Printf("contact purge: removed %d expired messages", n)
	}
	_ = a.Auth.Store.SetContactNotify(r.Context(), m.ID, "skipped") // no email is sent for contact messages
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

// ---- admin ----

func (a *App) contactRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/admin/contact", adm(a.listContact))
	m.HandleFunc("GET /api/v1/admin/contact/{id}", adm(a.contactOne))
	m.HandleFunc("POST /api/v1/admin/contact/{id}/status", adm(a.contactStatus))
	m.HandleFunc("POST /api/v1/admin/contact/{id}/delete", adm(a.contactDelete))
}

func (a *App) contactFail(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrNotFound) {
		apiError(w, http.StatusNotFound, "message not found")
		return
	}
	log.Printf("contact: %v", err)
	apiError(w, http.StatusInternalServerError, "could not complete the request")
}

func (a *App) listContact(w http.ResponseWriter, r *http.Request, _ User) {
	pg, limit := paging(r, 50)
	q := ContactQuery{Status: r.URL.Query().Get("status"), Q: strings.TrimSpace(r.URL.Query().Get("q")), From: r.URL.Query().Get("from"), To: r.URL.Query().Get("to"), Page: pg, Limit: limit}
	if q.Status != "" && q.Status != "all" && q.Status != "new" && q.Status != "read" && q.Status != "replied" && q.Status != "archived" {
		apiError(w, http.StatusBadRequest, "unknown status")
		return
	}
	if _, err := a.Auth.Store.PurgeExpiredContacts(r.Context()); err != nil {
		log.Printf("contact purge: %v", err)
	}
	items, total, counts, err := a.Auth.Store.ListContacts(r.Context(), q)
	if err != nil {
		a.contactFail(w, err)
		return
	}
	lo, hi, pages := window(total, pg, limit)
	_ = lo
	_ = hi
	writeJSON(w, 200, map[string]any{"items": items, "total": total, "page": pg, "pages": pages, "limit": limit, "counts": counts,
		"retentionDays": 30})
}

func (a *App) contactOne(w http.ResponseWriter, r *http.Request, _ User) {
	m, err := a.Auth.Store.GetContact(r.Context(), r.PathValue("id"))
	if err != nil {
		a.contactFail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"item": m})
}

func (a *App) contactStatus(w http.ResponseWriter, r *http.Request, u User) {
	var q struct {
		Status string `json:"status"`
	}
	if !decode(w, r, &q) {
		return
	}
	if q.Status != "new" && q.Status != "read" && q.Status != "archived" { // "replied" is only ever set by a successful reply
		apiError(w, http.StatusUnprocessableEntity, "status must be new, read or archived")
		return
	}
	id := r.PathValue("id")
	if err := a.Auth.Store.SetContactStatus(r.Context(), id, q.Status); err != nil {
		a.contactFail(w, err)
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "contact.status", "contact", id, map[string]any{"status": q.Status})
	m, _ := a.Auth.Store.GetContact(r.Context(), id)
	writeJSON(w, 200, map[string]any{"item": m})
}

func (a *App) contactDelete(w http.ResponseWriter, r *http.Request, u User) {
	id := r.PathValue("id")
	if err := a.Auth.Store.DeleteContact(r.Context(), id); err != nil {
		a.contactFail(w, err)
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "contact.delete", "contact", id, nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// purgeContactLoop is a supplement for a long-running server; the dependable triggers are the purge on every submission and
// inbox view, and the `purge-contact` command (or a database cron job) documented in docs/contact-inbox.md.
func purgeContactLoop(ctx context.Context, s ContactStore) {
	t := time.NewTicker(6 * time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if n, err := s.PurgeExpiredContacts(ctx); err != nil {
				log.Printf("contact purge: %v", err)
			} else if n > 0 {
				log.Printf("contact purge: removed %d expired messages", n)
			}
		}
	}
}
