package main

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

type memToken struct {
	userID  string
	purpose string
	expires time.Time
	used    bool
}

type memSession struct {
	userID  string
	expires time.Time
}

// memStore keeps everything in RAM. Used by tests and by AUTH_DEV_MEMORY=true; data is lost on restart.
type memStore struct {
	mu       sync.Mutex
	seq      int
	users    map[string]*User
	byEmail  map[string]string
	profiles map[string]*Profile
	tokens   map[string]*memToken
	sessions map[string]*memSession
	roleLog  []RoleChange
	cm       committeeMem
	cms      cmsMem
}

// RoleChange mirrors a row of role_changes (kept in memory for tests).
type RoleChange struct{ Target, Actor, Old, New, Source string }

func newMemStore() *memStore {
	return &memStore{users: map[string]*User{}, byEmail: map[string]string{}, profiles: map[string]*Profile{},
		tokens: map[string]*memToken{}, sessions: map[string]*memSession{}}
}

func (m *memStore) CreateUser(_ context.Context, n NewUser) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.byEmail[n.Email]; ok {
		return User{}, ErrEmailTaken
	}
	m.seq++
	id := fmt.Sprintf("u%04d", m.seq)
	u := &User{ID: id, Email: n.Email, PasswordHash: n.PasswordHash, Role: n.Role, EmailVerified: n.Verified}
	m.users[id], m.byEmail[n.Email] = u, id
	if n.Profile != nil {
		p := *n.Profile
		p.UserID, p.Status, p.ShowInDirectory = id, StatusPending, true
		p.ShowPhone, p.ShowEmail, p.ShowBlood = "hidden", "members", "members"
		p.CreatedAt = time.Now().UTC().Format(time.RFC3339)
		m.profiles[id] = &p
	}
	return *u, nil
}

func (m *memStore) UserByEmail(_ context.Context, email string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if id, ok := m.byEmail[email]; ok {
		return *m.users[id], nil
	}
	return User{}, ErrNotFound
}

func (m *memStore) UserByID(_ context.Context, id string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if u, ok := m.users[id]; ok {
		return *u, nil
	}
	return User{}, ErrNotFound
}

func (m *memStore) EnsureExternalUser(_ context.Context, id, email string, verified bool) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if u, ok := m.users[id]; ok {
		u.EmailVerified = u.EmailVerified || verified
		return *u, nil
	}
	if _, exists := m.byEmail[email]; exists {
		return User{}, ErrEmailTaken
	}
	u := &User{ID: id, Email: email, Role: RoleMember, EmailVerified: verified}
	m.users[id], m.byEmail[email] = u, id
	return *u, nil
}

func (m *memStore) SetEmailVerified(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if u, ok := m.users[id]; ok {
		u.EmailVerified = true
		return nil
	}
	return ErrNotFound
}

func (m *memStore) SetPassword(_ context.Context, id, hash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if u, ok := m.users[id]; ok {
		u.PasswordHash = hash
		return nil
	}
	return ErrNotFound
}

func (m *memStore) SaveToken(_ context.Context, userID, purpose, digest string, expires time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tokens[digest] = &memToken{userID: userID, purpose: purpose, expires: expires}
	return nil
}

func (m *memStore) ConsumeToken(_ context.Context, purpose, digest string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tokens[digest]
	if !ok || t.purpose != purpose || t.used || time.Now().After(t.expires) {
		return "", ErrNotFound
	}
	t.used = true
	return t.userID, nil
}

func (m *memStore) CreateSession(_ context.Context, userID, digest string, expires time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[digest] = &memSession{userID: userID, expires: expires}
	return nil
}

func (m *memStore) SessionUser(_ context.Context, digest string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[digest]
	if !ok || time.Now().After(s.expires) {
		return User{}, ErrNotFound
	}
	return *m.users[s.userID], nil
}

func (m *memStore) DeleteSession(_ context.Context, digest string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, digest)
	return nil
}

func (m *memStore) DeleteUserSessions(_ context.Context, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, s := range m.sessions {
		if s.userID == userID {
			delete(m.sessions, k)
		}
	}
	return nil
}

func (m *memStore) ProfileByUser(_ context.Context, id string) (*Profile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p, ok := m.profiles[id]; ok {
		c := *p
		return &c, nil
	}
	return nil, ErrNotFound
}

func (m *memStore) UpdateProfile(_ context.Context, id string, c ProfilePatch) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.profiles[id]
	if !ok {
		return ErrNotFound
	}
	if c.Phone != nil {
		p.Phone = *c.Phone
	}
	if c.BloodGroup != nil {
		p.BloodGroup = *c.BloodGroup
	}
	if c.ShowInDirectory != nil {
		p.ShowInDirectory = *c.ShowInDirectory
	}
	if c.ShowPhone != nil {
		p.ShowPhone = *c.ShowPhone
	}
	if c.ShowEmail != nil {
		p.ShowEmail = *c.ShowEmail
	}
	if c.ShowBlood != nil {
		p.ShowBlood = *c.ShowBlood
	}
	return nil
}

func (m *memStore) UpsertProfile(_ context.Context, id string, p Profile) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cur, ok := m.profiles[id]; ok {
		cur.Name, cur.Batch, cur.Department, cur.Upazila, cur.Union = p.Name, p.Batch, p.Department, p.Upazila, p.Union
		if cur.Status == StatusRejected {
			cur.Status = StatusPending
		}
		return nil
	}
	p.UserID, p.Status, p.ShowInDirectory = id, StatusPending, true
	p.ShowPhone, p.ShowEmail, p.ShowBlood = "hidden", "members", "members"
	p.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	m.profiles[id] = &p
	return nil
}

func (m *memStore) ListMembers(_ context.Context, status string) ([]MemberRow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []MemberRow{}
	for id, p := range m.profiles {
		if status != "" && p.Status != status {
			continue
		}
		u := m.users[id]
		out = append(out, MemberRow{Profile: *p, Email: u.Email, EmailVerified: u.EmailVerified})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt < out[j].CreatedAt })
	return out, nil
}

func (m *memStore) ReviewProfile(_ context.Context, id, status string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p, ok := m.profiles[id]; ok {
		p.Status = status
		return nil
	}
	return ErrNotFound
}

func (m *memStore) ApprovedDirectory(_ context.Context) ([]Student, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []Student{}
	for id, p := range m.profiles {
		if u := m.users[id]; u != nil && u.Disabled {
			continue
		}
		if p.Status == StatusApproved && p.ShowInDirectory {
			b := p.Batch
			out = append(out, Student{ID: "m-" + id, Name: p.Name, Batch: &b, Department: p.Department, Upazila: p.Upazila})
		}
	}
	return out, nil
}

func (m *memStore) Counts(_ context.Context) (map[string]int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c := map[string]int{StatusPending: 0, StatusApproved: 0, StatusRejected: 0}
	for _, p := range m.profiles {
		c[p.Status]++
	}
	return c, nil
}

func (m *memStore) ListUsers(_ context.Context, q, role string, limit, offset int) ([]UserRow, int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	q = strings.ToLower(strings.TrimSpace(q))
	all := []UserRow{}
	for id, u := range m.users {
		name, status := "", ""
		if p, ok := m.profiles[id]; ok {
			name, status = p.Name, p.Status
		}
		if role != "" && u.Role != role {
			continue
		}
		if q != "" && !strings.Contains(strings.ToLower(u.Email), q) && !strings.Contains(strings.ToLower(name), q) {
			continue
		}
		all = append(all, UserRow{ID: id, Email: u.Email, Name: name, Role: u.Role, EmailVerified: u.EmailVerified, MemberStatus: status})
	}
	sort.Slice(all, func(i, j int) bool { return all[i].Email < all[j].Email })
	total := len(all)
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return all[offset:end], total, nil
}

func (m *memStore) SearchUsers(_ context.Context, q UserQuery) ([]UserRow, int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	needle := strings.ToLower(strings.TrimSpace(q.Q))
	all := []UserRow{}
	for id, u := range m.users {
		name, status, created := "", "", ""
		if p, ok := m.profiles[id]; ok {
			name, status, created = p.Name, p.Status, p.CreatedAt
		}
		if (q.Role != "" && u.Role != q.Role) || (q.Verified == "yes" && !u.EmailVerified) || (q.Verified == "no" && u.EmailVerified) ||
			(q.Account == "active" && u.Disabled) || (q.Account == "deactivated" && !u.Disabled) {
			continue
		}
		if needle != "" && !strings.Contains(strings.ToLower(u.Email), needle) && !strings.Contains(strings.ToLower(name), needle) {
			continue
		}
		all = append(all, UserRow{ID: id, Email: u.Email, Name: name, Role: u.Role, EmailVerified: u.EmailVerified, MemberStatus: status, CreatedAt: created, Disabled: u.Disabled})
	}
	label := func(r UserRow) string {
		if r.Name != "" {
			return strings.ToLower(r.Name)
		}
		return strings.ToLower(r.Email)
	}
	sort.SliceStable(all, func(i, j int) bool {
		switch q.Sort {
		case "name":
			return label(all[i]) < label(all[j])
		case "email":
			return strings.ToLower(all[i].Email) < strings.ToLower(all[j].Email)
		case "role":
			if all[i].Role != all[j].Role {
				return all[i].Role < all[j].Role
			}
			return all[i].Email < all[j].Email
		case "oldest":
			return all[i].ID < all[j].ID
		}
		return all[i].ID > all[j].ID // newest first (ids grow with registration order)
	})
	total := len(all)
	lo := q.Offset
	if lo > total {
		lo = total
	}
	hi := lo + q.Limit
	if hi > total {
		hi = total
	}
	return all[lo:hi], total, nil
}

func (m *memStore) otherActiveAdmins(exclude string) int {
	n := 0
	for id, u := range m.users {
		if id != exclude && u.Role == RoleAdmin && u.EmailVerified {
			n++
		}
	}
	return n
}

func (m *memStore) SetRole(_ context.Context, actorID, targetID, role string) (User, error) {
	if role != RoleMember && role != RoleAdmin {
		return User{}, ErrInvalidRole
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.users[targetID]
	if !ok {
		return User{}, ErrNotFound
	}
	if t.Role == role {
		return *t, nil
	}
	if role == RoleAdmin && !t.EmailVerified {
		return User{}, ErrTargetUnverified
	}
	if role == RoleMember && m.otherActiveAdmins(targetID) < 1 {
		return User{}, ErrLastAdmin
	}
	if a, ok := m.users[actorID]; !ok || a.Role != RoleAdmin || !a.EmailVerified {
		return User{}, ErrForbidden
	}
	m.roleLog = append(m.roleLog, RoleChange{Target: targetID, Actor: actorID, Old: t.Role, New: role, Source: "admin_ui"})
	t.Role = role
	return *t, nil
}

func (m *memStore) PromoteVerifiedByEmail(_ context.Context, email string, apply bool) (User, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.byEmail[normEmail(email)]
	if !ok {
		return User{}, false, ErrNotFound
	}
	u := m.users[id]
	if !u.EmailVerified {
		return User{}, false, ErrTargetUnverified
	}
	if u.Role == RoleAdmin {
		return *u, false, nil
	}
	if apply {
		m.roleLog = append(m.roleLog, RoleChange{Target: id, Old: u.Role, New: RoleAdmin, Source: "bootstrap"})
		u.Role = RoleAdmin
	}
	return *u, true, nil
}

func (m *memStore) RoleLog() []RoleChange {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]RoleChange{}, m.roleLog...)
}

func (m *memStore) Ping(context.Context) error { return nil }

func normEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }
