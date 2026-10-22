package main

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type memContact struct {
	ContactMessage
	expires time.Time
	created time.Time
}

func (m *memStore) CreateContact(_ context.Context, in ContactInput, expires time.Time) (ContactMessage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.seq++
	now := time.Now().UTC()
	c := &memContact{expires: expires.UTC(), created: now, ContactMessage: ContactMessage{
		ID: fmt.Sprintf("c%04d", m.seq), Name: in.Name, Email: in.Email, Subject: in.Subject, Message: in.Message, Status: "new", NotifyStatus: "pending",
		CreatedAt: now.Format(time.RFC3339), ExpiresAt: expires.UTC().Format(time.RFC3339)}}
	m.contacts = append(m.contacts, c)
	return c.ContactMessage, nil
}

func (m *memStore) liveContacts() []*memContact {
	out := []*memContact{}
	for _, c := range m.contacts {
		if c.expires.After(time.Now()) {
			out = append(out, c)
		}
	}
	return out
}

func (m *memStore) ListContacts(_ context.Context, q ContactQuery) ([]ContactMessage, int, map[string]int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	counts := map[string]int{"new": 0, "read": 0, "replied": 0, "archived": 0}
	rows := []ContactMessage{}
	needle := strings.ToLower(q.Q)
	for _, c := range m.liveContacts() {
		counts[c.Status]++
		switch {
		case q.Status == "" && c.Status == "archived", q.Status != "" && q.Status != "all" && c.Status != q.Status:
			continue
		}
		if needle != "" && !strings.Contains(strings.ToLower(c.Name+" "+c.Email+" "+c.Subject), needle) {
			continue
		}
		day := c.created.Format("2006-01-02")
		if (q.From != "" && day < q.From) || (q.To != "" && day > q.To) {
			continue
		}
		cp := c.ContactMessage
		cp.Replies = nil
		rows = append(rows, cp)
	}
	// newest first
	for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 {
		rows[i], rows[j] = rows[j], rows[i]
	}
	total := len(rows)
	lo := (q.Page - 1) * q.Limit
	if lo > total {
		lo = total
	}
	hi := lo + q.Limit
	if hi > total {
		hi = total
	}
	return rows[lo:hi], total, counts, nil
}

func (m *memStore) findContact(id string) *memContact {
	for _, c := range m.liveContacts() {
		if c.ID == id {
			return c
		}
	}
	return nil
}

func (m *memStore) GetContact(_ context.Context, id string) (ContactMessage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c := m.findContact(id)
	if c == nil {
		return ContactMessage{}, ErrNotFound
	}
	cp := c.ContactMessage
	cp.Replies = append([]ContactReply(nil), c.Replies...)
	return cp, nil
}

func (m *memStore) SetContactStatus(_ context.Context, id, status string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	c := m.findContact(id)
	if c == nil {
		return ErrNotFound
	}
	now := time.Now().UTC().Format(time.RFC3339)
	switch status {
	case "new":
		c.Status, c.ReadAt = "new", ""
	case "read":
		if c.Status == "new" {
			c.Status = "read"
		}
		if c.ReadAt == "" {
			c.ReadAt = now
		}
	case "archived":
		c.Status = "archived"
	}
	return nil
}

func (m *memStore) SetContactNotify(_ context.Context, id, status string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, c := range m.contacts {
		if c.ID == id {
			c.NotifyStatus = status
			return nil
		}
	}
	return ErrNotFound
}

func (m *memStore) AddContactReply(_ context.Context, id, actorID, body, status, errNote string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	c := m.findContact(id)
	if c == nil {
		return ErrNotFound
	}
	now := time.Now().UTC().Format(time.RFC3339)
	m.seq++
	c.Replies = append(c.Replies, ContactReply{ID: int64(m.seq), SentBy: actorID, Body: body, Status: status, Error: errNote, CreatedAt: now})
	if status == "sent" {
		c.Status, c.RepliedAt = "replied", now
	}
	return nil
}

func (m *memStore) DeleteContact(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, c := range m.contacts {
		if c.ID == id && c.expires.After(time.Now()) {
			m.contacts = append(m.contacts[:i], m.contacts[i+1:]...)
			return nil
		}
	}
	return ErrNotFound
}

func (m *memStore) PurgeExpiredContacts(_ context.Context) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	keep, n := m.contacts[:0], 0
	for _, c := range m.contacts {
		if c.expires.After(time.Now()) {
			keep = append(keep, c)
		} else {
			n++
		}
	}
	m.contacts = keep
	return n, nil
}
