package main

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// replyCapture records mail including the Reply-To, and can be told to fail.
type replyCapture struct {
	mu    sync.Mutex
	sent  []struct{ to, replyTo, subject, body string }
	fail  bool
	inner *captureMailer // account e-mails (verification links) still go to the usual capture
}

func (r *replyCapture) Send(ctx context.Context, to, subject, text string) error {
	if r.inner != nil {
		return r.inner.Send(ctx, to, subject, text)
	}
	return r.SendWithReplyTo(ctx, to, "", subject, text)
}

func (r *replyCapture) SendWithReplyTo(_ context.Context, to, replyTo, subject, text string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.fail {
		return errors.New("smtp down")
	}
	r.sent = append(r.sent, struct{ to, replyTo, subject, body string }{to, replyTo, subject, text})
	return nil
}

func contactEnv(t *testing.T) (*env2, *replyCapture) {
	e := authApp(t)
	rc := &replyCapture{inner: e.mail}
	e.app.Auth.Mailer = rc
	return e, rc
}

var goodContact = map[string]any{"name": "Rina Akter", "email": "rina@example.org", "subject": "Question about batch 16", "message": "Hello, how can I join the next meetup?"}

func listContact(t *testing.T, e *env2, ck *http.Cookie, query string) map[string]any {
	t.Helper()
	rec := e.do("GET", "/api/v1/admin/contact"+query, nil, ck)
	if rec.Code != 200 {
		t.Fatalf("list: %d %s", rec.Code, rec.Body)
	}
	var out map[string]any
	decodeBody(t, rec, &out)
	return out
}

func TestContactSavedNotifiedAndAdminOnly(t *testing.T) {
	t.Setenv("CONTACT_RECIPIENT_EMAIL", "inbox@bswa.example")
	e, mail := contactEnv(t)
	if rec := e.do("POST", "/api/v1/contact", goodContact, nil); rec.Code != 201 {
		t.Fatalf("submit: %d %s", rec.Code, rec.Body)
	}
	if len(mail.sent) != 1 || mail.sent[0].to != "inbox@bswa.example" || mail.sent[0].replyTo != "rina@example.org" || !strings.Contains(mail.sent[0].body, "not verified") {
		t.Fatalf("notification wrong: %+v", mail.sent)
	}
	// access control: nobody but an admin sees or touches the inbox
	member := e.member(t, "m1@example.com")
	for _, c := range []*http.Cookie{nil, member} {
		want := 401
		if c != nil {
			want = 403
		}
		for _, call := range [][2]string{{"GET", "/api/v1/admin/contact"}, {"GET", "/api/v1/admin/contact/x"}, {"POST", "/api/v1/admin/contact/x/status"}, {"POST", "/api/v1/admin/contact/x/delete"}} {
			if rec := e.do(call[0], call[1], map[string]string{"body": "hi there", "status": "read"}, c); rec.Code != want {
				t.Errorf("%s %s as %v: want %d got %d", call[0], call[1], c != nil, want, rec.Code)
			}
		}
	}
	admin := e.admin(t)
	res := listContact(t, e, admin, "")
	items := res["items"].([]any)
	if len(items) != 1 || res["counts"].(map[string]any)["new"].(float64) != 1 {
		t.Fatalf("inbox: %v", res)
	}
	m := items[0].(map[string]any)
	if m["notifyStatus"] != "sent" || m["status"] != "new" {
		t.Fatalf("states: %v", m)
	}
}

func TestContactValidationAndAbuse(t *testing.T) {
	e, mail := contactEnv(t)
	admin := e.admin(t)
	bad := map[string]any{"name": "R", "email": "nope", "subject": "x", "message": "short"}
	if rec := e.do("POST", "/api/v1/contact", bad, nil); rec.Code != 422 || !strings.Contains(rec.Body.String(), "fields") {
		t.Fatalf("validation: %d %s", rec.Code, rec.Body)
	}
	trap := map[string]any{"name": "Bot Bot", "email": "bot@example.org", "subject": "Buy now", "message": "spam spam spam spam", "website": "http://spam"}
	if rec := e.do("POST", "/api/v1/contact", trap, nil); rec.Code != 202 {
		t.Fatalf("honeypot: %d", rec.Code)
	}
	if n := len(listContact(t, e, admin, "?status=all")["items"].([]any)); n != 0 || len(mail.sent) != 0 {
		t.Fatalf("invalid and honeypot messages must not be stored or mailed (stored %d, mailed %d)", n, len(mail.sent))
	}
	// a CR/LF in the subject cannot add headers or lines to the notification subject
	t.Setenv("CONTACT_RECIPIENT_EMAIL", "inbox@bswa.example")
	inj := map[string]any{"name": "Eve Smith", "email": "eve@example.org", "subject": "Hello\r\nBcc: victim@example.org", "message": "A normal message body here."}
	if rec := e.do("POST", "/api/v1/contact", inj, nil); rec.Code != 201 {
		t.Fatalf("inj: %d %s", rec.Code, rec.Body)
	}
	if s := mail.sent[0].subject; strings.ContainsAny(s, "\r\n") {
		t.Fatalf("header injection: %q", s)
	}
}

func TestContactNotificationFailureKeepsMessage(t *testing.T) {
	t.Setenv("CONTACT_RECIPIENT_EMAIL", "inbox@bswa.example")
	e, mail := contactEnv(t)
	admin := e.admin(t)
	mail.fail = true
	if rec := e.do("POST", "/api/v1/contact", goodContact, nil); rec.Code != 201 || strings.Contains(rec.Body.String(), "smtp") {
		t.Fatalf("visitor result must stay accurate and free of internals: %d %s", rec.Code, rec.Body)
	}
	m := listContact(t, e, admin, "")["items"].([]any)[0].(map[string]any)
	if m["notifyStatus"] != "failed" {
		t.Fatalf("failure not recorded: %v", m)
	}
	// retry once the mail system works again
	mail.fail = false
	id := m["id"].(string)
	if rec := e.do("POST", "/api/v1/admin/contact/"+id+"/notify", map[string]string{}, admin); rec.Code != 200 {
		t.Fatalf("retry: %d %s", rec.Code, rec.Body)
	}
	if got := listContact(t, e, admin, "")["items"].([]any)[0].(map[string]any)["notifyStatus"]; got != "sent" {
		t.Fatalf("after retry: %v", got)
	}
}

func TestContactNoRecipientConfigured(t *testing.T) {
	t.Setenv("CONTACT_RECIPIENT_EMAIL", "")
	e, mail := contactEnv(t)
	admin := e.admin(t)
	if rec := e.do("POST", "/api/v1/contact", goodContact, nil); rec.Code != 201 {
		t.Fatalf("submit: %d", rec.Code)
	}
	res := listContact(t, e, admin, "")
	if len(mail.sent) != 0 || res["items"].([]any)[0].(map[string]any)["notifyStatus"] != "skipped" || res["recipientConfigured"] != false {
		t.Fatalf("missing recipient must be reported, not faked: %v %v", mail.sent, res)
	}
}

func TestContactHasNoReplyFromThePanel(t *testing.T) {
	t.Setenv("CONTACT_RECIPIENT_EMAIL", "inbox@bswa.example")
	e, mail := contactEnv(t)
	admin := e.admin(t)
	e.do("POST", "/api/v1/contact", goodContact, nil)
	id := listContact(t, e, admin, "")["items"].([]any)[0].(map[string]any)["id"].(string)
	sent := len(mail.sent)
	if rec := e.do("POST", "/api/v1/admin/contact/"+id+"/reply", map[string]string{"body": "Come on Friday at 5pm."}, admin); rec.Code != 404 && rec.Code != 405 {
		t.Fatalf("replying is not offered: %d %s", rec.Code, rec.Body)
	}
	if len(mail.sent) != sent {
		t.Fatal("no email may leave through the inbox")
	}
	// "replied" cannot be set by hand either
	if rec := e.do("POST", "/api/v1/admin/contact/"+id+"/status", map[string]string{"status": "replied"}, admin); rec.Code != 422 {
		t.Fatalf("manual replied: %d", rec.Code)
	}
}

func TestContactStatusViewsSearchAndDelete(t *testing.T) {
	e, _ := contactEnv(t)
	admin := e.admin(t)
	ctx := context.Background()
	for _, n := range []string{"Aaa Person", "Bbb Person", "Ccc Person"} {
		if _, err := e.mem.CreateContact(ctx, ContactInput{Name: n, Email: strings.ToLower(n[:3]) + "@example.org", Subject: "Subject " + n, Message: "message body text"}, time.Now().Add(contactRetention)); err != nil {
			t.Fatal(err)
		}
	}
	ids := []string{}
	for _, it := range listContact(t, e, admin, "")["items"].([]any) {
		ids = append(ids, it.(map[string]any)["id"].(string))
	}
	e.do("POST", "/api/v1/admin/contact/"+ids[0]+"/status", map[string]string{"status": "read"}, admin)
	e.do("POST", "/api/v1/admin/contact/"+ids[1]+"/status", map[string]string{"status": "archived"}, admin)
	count := func(q string) int { return len(listContact(t, e, admin, q)["items"].([]any)) }
	if count("") != 3 || count("?status=all") != 3 || count("?status=archived") != 1 || count("?status=read") != 1 || count("?status=new") != 1 {
		t.Fatalf("views wrong: inbox %d all %d archived %d read %d new %d", count(""), count("?status=all"), count("?status=archived"), count("?status=read"), count("?status=new"))
	}
	if count("?q=aaa") != 1 || count("?q=nobody") != 0 {
		t.Fatal("search wrong")
	}
	if rec := e.do("GET", "/api/v1/admin/contact?status=bogus", nil, admin); rec.Code != 400 {
		t.Fatalf("bad status: %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/admin/contact/"+ids[2]+"/delete", map[string]string{}, admin); rec.Code != 200 {
		t.Fatalf("delete: %d", rec.Code)
	}
	if rec := e.do("GET", "/api/v1/admin/contact/"+ids[2], nil, admin); rec.Code != 404 {
		t.Fatalf("deleted message still readable: %d", rec.Code)
	}
}

// contactStoreSuite checks retention on any store: expired messages vanish from every view and are purged with their replies,
// and nothing an admin does moves the expiry.
func contactStoreSuite(t *testing.T, s ContactStore) {
	ctx := context.Background()
	live, err := s.CreateContact(ctx, ContactInput{Name: "Live Person", Email: "live@example.org", Subject: "Fresh", Message: "fresh message here"}, time.Now().Add(contactRetention))
	if err != nil {
		t.Fatal(err)
	}
	old, err := s.CreateContact(ctx, ContactInput{Name: "Old Person", Email: "old@example.org", Subject: "Stale", Message: "stale message here"}, time.Now().Add(-time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetContact(ctx, old.ID); err != ErrNotFound {
		t.Fatalf("an expired message must not be readable: %v", err)
	}
	rows, _, counts, err := s.ListContacts(ctx, ContactQuery{Status: "all", Page: 1, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.ID == old.ID {
			t.Fatal("expired message in the inbox list")
		}
	}
	_ = counts
	if err := s.AddContactReply(ctx, old.ID, "", "late reply", "sent", ""); err != ErrNotFound {
		t.Fatalf("cannot reply to an expired message: %v", err)
	}
	// reading and replying keep the expiry exactly as it was
	if err := s.SetContactStatus(ctx, live.ID, "read"); err != nil {
		t.Fatal(err)
	}
	if err := s.AddContactReply(ctx, live.ID, "", "an answer", "sent", ""); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetContact(ctx, live.ID)
	if err != nil || got.ExpiresAt != live.ExpiresAt || got.Status != "replied" || len(got.Replies) != 1 {
		t.Fatalf("after read+reply: %+v %v (expiry before %s)", got, err, live.ExpiresAt)
	}
	n, err := s.PurgeExpiredContacts(ctx)
	if err != nil || n < 1 {
		t.Fatalf("purge removed %d: %v", n, err)
	}
	if n, _ := s.PurgeExpiredContacts(ctx); n != 0 {
		t.Fatalf("second purge should find nothing, removed %d", n)
	}
	if _, err := s.GetContact(ctx, live.ID); err != nil {
		t.Fatalf("a live message must survive the purge: %v", err)
	}
	if err := s.SetContactStatus(ctx, "not-a-uuid", "read"); err != ErrNotFound {
		t.Fatalf("bad id: %v", err)
	}
	_ = s.DeleteContact(ctx, live.ID)
}

func TestMemContactStoreSuite(t *testing.T) { contactStoreSuite(t, newMemStore()) }
