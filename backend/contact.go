package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
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

// ---- mail helpers ----

// ReplyMailer is a Mailer that can also set a Reply-To address.
type ReplyMailer interface {
	SendWithReplyTo(ctx context.Context, to, replyTo, subject, text string) error
}

// simulated reports a mailer that prints instead of delivering, so the admin is never told a mail was delivered when it was not.
func simulated(m Mailer) bool { _, ok := m.(logMailer); return ok }

func sendMail(ctx context.Context, m Mailer, to, replyTo, subject, text string) error {
	if rm, ok := m.(ReplyMailer); ok && replyTo != "" {
		return rm.SendWithReplyTo(ctx, to, replyTo, subject, text)
	}
	return m.Send(ctx, to, subject, text)
}

// oneLine removes anything that could break out of a header or subject line.
func oneLine(s string, max int) string {
	s = strings.Join(strings.FieldsFunc(s, func(r rune) bool { return r == '\r' || r == '\n' || r == 0 || r == ' ' || r == ' ' }), " ")
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > max {
		s = string([]rune(s)[:max])
	}
	return s
}

func (a *App) contactRecipient() string { return strings.TrimSpace(os.Getenv("CONTACT_RECIPIENT_EMAIL")) }

// notifyContact tells the configured mailbox about a new message and records whether that worked.
func (a *App) notifyContact(ctx context.Context, m ContactMessage) string {
	to := a.contactRecipient()
	if to == "" || !emailRx.MatchString(to) {
		log.Printf("contact %s saved; CONTACT_RECIPIENT_EMAIL is not set, no notification sent", m.ID)
		_ = a.Auth.Store.SetContactNotify(ctx, m.ID, "skipped")
		return "skipped"
	}
	link := ""
	if a.Auth.FrontendURL != "" {
		link = "\n\nOpen the inbox: " + a.Auth.FrontendURL + "/admin/contact"
	}
	body := "New message from the website contact form.\n\n" +
		"Name: " + oneLine(m.Name, 80) + "\n" +
		"Email (typed by the visitor, not verified): " + oneLine(m.Email, 120) + "\n" +
		"Subject: " + oneLine(m.Subject, 120) + "\n" +
		"Received: " + m.CreatedAt + "\n\n" + m.Message + link
	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	status := "sent"
	if err := sendMail(cctx, a.Auth.Mailer, to, m.Email, "[Contact] "+oneLine(m.Subject, 120), body); err != nil {
		log.Printf("contact %s: notification failed: %v", m.ID, err)
		status = "failed"
	}
	_ = a.Auth.Store.SetContactNotify(ctx, m.ID, status)
	return status
}

// ---- public form ----

// submitContact stores the message first, then notifies. A mail failure never loses the message.
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
	a.notifyContact(r.Context(), m)
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

// ---- admin ----

func (a *App) contactRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/admin/contact", adm(a.listContact))
	m.HandleFunc("GET /api/v1/admin/contact/{id}", adm(a.contactOne))
	m.HandleFunc("POST /api/v1/admin/contact/{id}/status", adm(a.contactStatus))
	m.HandleFunc("POST /api/v1/admin/contact/{id}/reply", adm(a.contactReply))
	m.HandleFunc("POST /api/v1/admin/contact/{id}/notify", adm(a.contactRenotify))
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
		"retentionDays": 30, "recipientConfigured": a.contactRecipient() != "", "simulated": simulated(a.Auth.Mailer)})
}

func (a *App) contactOne(w http.ResponseWriter, r *http.Request, _ User) {
	m, err := a.Auth.Store.GetContact(r.Context(), r.PathValue("id"))
	if err != nil {
		a.contactFail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"item": m, "simulated": simulated(a.Auth.Mailer)})
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

func (a *App) contactReply(w http.ResponseWriter, r *http.Request, u User) {
	var q struct {
		Body string `json:"body"`
	}
	if !decode(w, r, &q) {
		return
	}
	body := strings.TrimSpace(q.Body)
	if n := utf8.RuneCountInString(body); n < 2 || n > 5000 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": map[string]string{"body": "Write a reply of 2-5000 characters."}})
		return
	}
	if !a.Auth.replyUser.Allow(u.ID) {
		apiError(w, http.StatusTooManyRequests, "rate_limited")
		return
	}
	id := r.PathValue("id")
	m, err := a.Auth.Store.GetContact(r.Context(), id)
	if err != nil {
		a.contactFail(w, err)
		return
	}
	// the recipient is always the address stored with the message; the request cannot choose one
	subject := "Re: " + oneLine(strings.TrimPrefix(m.Subject, "Re: "), 110)
	cctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	sendErr := sendMail(cctx, a.Auth.Mailer, m.Email, a.contactRecipient(), subject, body+"\n\n--\nIn reply to your message \""+oneLine(m.Subject, 120)+"\" sent on "+m.CreatedAt+".")
	status, note := "sent", ""
	if sendErr != nil {
		log.Printf("contact %s: reply failed: %v", id, sendErr)
		status, note = "failed", "delivery failed"
	}
	if err := a.Auth.Store.AddContactReply(r.Context(), id, u.ID, body, status, note); err != nil {
		a.contactFail(w, err)
		return
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "contact.reply", "contact", id, map[string]any{"status": status}) // never the text itself
	fresh, _ := a.Auth.Store.GetContact(r.Context(), id)
	code := http.StatusOK
	if sendErr != nil {
		code = http.StatusBadGateway
	}
	writeJSON(w, code, map[string]any{"ok": sendErr == nil, "delivered": sendErr == nil && !simulated(a.Auth.Mailer), "simulated": simulated(a.Auth.Mailer), "item": fresh,
		"error": map[bool]string{true: "", false: "mail_failed"}[sendErr == nil]})
}

func (a *App) contactRenotify(w http.ResponseWriter, r *http.Request, u User) {
	id := r.PathValue("id")
	m, err := a.Auth.Store.GetContact(r.Context(), id)
	if err != nil {
		a.contactFail(w, err)
		return
	}
	st := a.notifyContact(r.Context(), m)
	_ = a.Auth.Store.Audit(r.Context(), u.ID, "contact.renotify", "contact", id, map[string]any{"result": st})
	fresh, _ := a.Auth.Store.GetContact(r.Context(), id)
	writeJSON(w, 200, map[string]any{"item": fresh, "result": st})
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
