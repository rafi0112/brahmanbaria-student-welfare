package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

type memEntry struct {
	Entry
	created time.Time
	updated time.Time
}

type memAudit struct {
	at                              time.Time
	actor, action, entity, entityID string
	detail                          map[string]any
}

type cmsMem struct {
	entries map[string]*memEntry
	audit   []memAudit
	seq     int
}

func (m *memStore) cmsInit() {
	if m.cms.entries == nil {
		m.cms.entries = map[string]*memEntry{}
	}
}

func stamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func (m *memStore) auditLocked(actor, action, entity, entityID string, detail map[string]any) {
	if actor == "" && !strings.HasPrefix(action, "cms.") {
		return
	}
	m.cms.audit = append(m.cms.audit, memAudit{time.Now(), actor, action, entity, entityID, detail})
}

func (m *memStore) Audit(_ context.Context, actorID, action, entity, entityID string, detail map[string]any) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.auditLocked(actorID, action, entity, entityID, detail)
	return nil
}

func (m *memStore) HasAuditAction(_ context.Context, action string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, a := range m.cms.audit {
		if a.action == action {
			return true, nil
		}
	}
	return false, nil
}

func (m *memStore) actorLabel(id string) string {
	if u, ok := m.users[id]; ok {
		return u.Email
	}
	return ""
}

func (m *memStore) RecentActivity(_ context.Context, limit int) ([]Activity, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []Activity{}
	for _, a := range m.cms.audit {
		out = append(out, Activity{At: stamp(a.at), Actor: m.actorLabel(a.actor), Action: a.action, Entity: a.entity, EntityID: a.entityID, Detail: a.detail})
	}
	for _, c := range m.cm.audit {
		out = append(out, Activity{At: stamp(time.Now()), Actor: m.actorLabel(c.Actor), Action: c.Action, Entity: "committee", EntityID: c.Committee})
	}
	for _, r := range m.roleLog {
		out = append(out, Activity{At: stamp(time.Now()), Actor: m.actorLabel(r.Actor), Action: "role." + r.New, Entity: "user", EntityID: r.Target,
			Detail: map[string]any{"from": r.Old, "to": r.New, "source": r.Source}})
	}
	// newest first: later appends are newer within each log; the merged order keeps audit entries first, so sort by time then reverse insertion
	sort.SliceStable(out, func(i, j int) bool { return out[i].At > out[j].At })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (m *memStore) RoleHistory(_ context.Context, targetID string, limit int) ([]RoleChangeRow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []RoleChangeRow{}
	for i := len(m.roleLog) - 1; i >= 0; i-- {
		r := m.roleLog[i]
		if targetID != "" && r.Target != targetID {
			continue
		}
		out = append(out, RoleChangeRow{At: stamp(time.Now()), Target: m.actorLabel(r.Target), Actor: m.actorLabel(r.Actor), From: r.Old, To: r.New, Source: r.Source})
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

// ---------------------------------------------------------------- entries

func (m *memStore) slugTaken(kind, slug, except string) bool {
	if slug == "" {
		return false
	}
	for id, e := range m.cms.entries {
		if id != except && e.Kind == kind && e.Slug == slug {
			return true
		}
	}
	return false
}

func (m *memStore) ListEntries(_ context.Context, q EntryQuery) ([]Entry, int, error) {
	q.norm()
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmsInit()
	rows := []Entry{}
	for _, e := range m.cms.entries {
		if e.Kind != q.Kind {
			continue
		}
		switch {
		case q.Public:
			if e.Status != StatusPublished {
				continue
			}
		case q.Status == "":
			if e.Status == StatusArchived {
				continue
			}
		case q.Status != "all":
			if e.Status != q.Status {
				continue
			}
		}
		if q.Q != "" && !strings.Contains(entryText(e.Entry), strings.ToLower(q.Q)) {
			continue
		}
		switch q.Parent {
		case "":
		case "none":
			if e.ParentID != "" {
				continue
			}
		default:
			if e.ParentID != q.Parent {
				continue
			}
		}
		if (q.Featured == "yes" && !e.Featured) || (q.Featured == "no" && e.Featured) {
			continue
		}
		if q.Category != "" && dataField(e.Data, "category") != q.Category {
			continue
		}
		if q.Author != "" && dataField(e.Data, "author") != q.Author {
			continue
		}
		if q.Upazila != "" && dataField(e.Data, "upazila") != q.Upazila {
			continue
		}
		day := stamp(e.created)[:10]
		if e.PublishedAt != "" {
			day = e.PublishedAt[:10]
		}
		if (q.From != "" && day < q.From) || (q.To != "" && day > q.To) {
			continue
		}
		rows = append(rows, e.Entry)
	}
	byID := func(id string) *memEntry { return m.cms.entries[id] }
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := byID(rows[i].ID), byID(rows[j].ID)
		switch q.Sort {
		case "published":
			if rows[i].PublishedAt != rows[j].PublishedAt {
				return rows[i].PublishedAt > rows[j].PublishedAt
			}
		case "order":
			if rows[i].SortOrder != rows[j].SortOrder {
				return rows[i].SortOrder < rows[j].SortOrder
			}
			return a.created.Before(b.created)
		case "title":
			return strings.ToLower(rows[i].Title) < strings.ToLower(rows[j].Title)
		}
		return a.updated.After(b.updated)
	})
	total := len(rows)
	lo := (q.Page - 1) * q.Limit
	if lo > total {
		lo = total
	}
	hi := lo + q.Limit
	if hi > total {
		hi = total
	}
	return rows[lo:hi], total, nil
}

func (m *memStore) GetEntry(_ context.Context, kind, idOrSlug string, publicOnly bool) (Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmsInit()
	for _, e := range m.cms.entries {
		if e.Kind == kind && (e.ID == idOrSlug || (e.Slug != "" && e.Slug == idOrSlug)) {
			if publicOnly && e.Status != StatusPublished {
				return Entry{}, ErrNotFound
			}
			return e.Entry, nil
		}
	}
	return Entry{}, ErrNotFound
}

func (m *memStore) parentOK(kind, parent string) bool {
	if parent == "" {
		return true
	}
	p, ok := m.cms.entries[parent]
	return ok && kind == KindImage && p.Kind == KindAlbum
}

func (m *memStore) CreateEntry(_ context.Context, actorID string, in EntryInput) (Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmsInit()
	if m.slugTaken(in.Kind, in.Slug, "") {
		return Entry{}, ErrSlugTaken
	}
	if !m.parentOK(in.Kind, in.ParentID) {
		return Entry{}, ErrParentInvalid
	}
	m.cms.seq++
	now := time.Now()
	order := 0
	if in.SortOrder != nil {
		order = *in.SortOrder
	} else {
		for _, e := range m.cms.entries {
			if e.Kind == in.Kind && e.SortOrder >= order {
				order = e.SortOrder + 1
			}
		}
	}
	e := &memEntry{Entry: Entry{ID: fmt.Sprintf("e%05d", m.cms.seq), Kind: in.Kind, Slug: in.Slug, Title: in.Title, Status: StatusDraft,
		Featured: in.Featured, SortOrder: order, ParentID: in.ParentID, Data: append(json.RawMessage(nil), in.Data...),
		CreatedAt: stamp(now), UpdatedAt: stamp(now), CreatedBy: actorID, UpdatedBy: actorID, AuthorName: m.actorLabel(actorID)}, created: now, updated: now}
	m.cms.entries[e.ID] = e
	m.auditLocked(actorID, in.Kind+".create", in.Kind, e.ID, map[string]any{"title": in.Title})
	return e.Entry, nil
}

func (m *memStore) UpdateEntry(_ context.Context, actorID, id string, in EntryInput) (Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmsInit()
	e, ok := m.cms.entries[id]
	if !ok {
		return Entry{}, ErrNotFound
	}
	if in.ExpectedUpdatedAt != "" && in.ExpectedUpdatedAt != e.UpdatedAt {
		return Entry{}, ErrStale
	}
	if m.slugTaken(e.Kind, in.Slug, id) {
		return Entry{}, ErrSlugTaken
	}
	if !m.parentOK(e.Kind, in.ParentID) {
		return Entry{}, ErrParentInvalid
	}
	e.Slug, e.Title, e.Featured, e.ParentID = in.Slug, in.Title, in.Featured, in.ParentID
	if in.SortOrder != nil {
		e.SortOrder = *in.SortOrder
	}
	e.Data = append(json.RawMessage(nil), in.Data...)
	e.updated, e.UpdatedBy = time.Now(), actorID
	e.UpdatedAt = stamp(e.updated)
	m.auditLocked(actorID, e.Kind+".update", e.Kind, id, map[string]any{"title": e.Title})
	return e.Entry, nil
}

func (m *memStore) SetEntryStatus(_ context.Context, actorID, id, action string) (Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmsInit()
	e, ok := m.cms.entries[id]
	if !ok {
		return Entry{}, ErrNotFound
	}
	next := ""
	switch {
	case action == "publish" && e.Status != StatusPublished:
		next = StatusPublished
	case action == "unpublish" && e.Status == StatusPublished:
		next = StatusDraft
	case action == "archive" && e.Status != StatusArchived:
		next = StatusArchived
	case action == "restore" && e.Status == StatusArchived:
		next = StatusDraft
	default:
		return Entry{}, ErrBadState
	}
	e.Status = next
	e.updated, e.UpdatedBy = time.Now(), actorID
	e.UpdatedAt = stamp(e.updated)
	if next == StatusPublished && e.PublishedAt == "" {
		e.PublishedAt = stamp(e.updated)
	}
	m.auditLocked(actorID, e.Kind+"."+action, e.Kind, id, map[string]any{"title": e.Title})
	return e.Entry, nil
}

func (m *memStore) ReorderEntries(_ context.Context, actorID, kind string, ids []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmsInit()
	seen := map[string]bool{}
	for _, id := range ids {
		e, ok := m.cms.entries[id]
		if !ok || e.Kind != kind || seen[id] {
			return ErrReorderMismatch
		}
		seen[id] = true
	}
	for i, id := range ids {
		m.cms.entries[id].SortOrder = i + 1
	}
	m.auditLocked(actorID, kind+".reorder", kind, "", map[string]any{"count": len(ids)})
	return nil
}

func (m *memStore) CountEntries(_ context.Context) (map[string]map[string]int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmsInit()
	out := map[string]map[string]int{}
	for _, e := range m.cms.entries {
		if out[e.Kind] == nil {
			out[e.Kind] = map[string]int{}
		}
		out[e.Kind][e.Status]++
	}
	return out, nil
}

// ---------------------------------------------------------------- members as admins see them

func (m *memStore) memberRow(id string) (MemberAdminRow, bool) {
	u, ok := m.users[id]
	p, hasP := m.profiles[id]
	if !ok || !hasP {
		return MemberAdminRow{}, false
	}
	return MemberAdminRow{ID: id, Email: u.Email, Name: p.Name, Batch: p.Batch, Department: p.Department, Upazila: p.Upazila, Union: p.Union,
		Phone: p.Phone, BloodGroup: p.BloodGroup, Status: p.Status, ShowInDirectory: p.ShowInDirectory, Role: u.Role,
		EmailVerified: u.EmailVerified, Disabled: u.Disabled, CreatedAt: p.CreatedAt, Session: p.Session, Gender: p.Gender,
		Missing: missingProfileFields(p.Name, p.Batch, p.Department, p.Upazila, p.Union, p.Session), ReviewedAt: p.ReviewedAt, ReviewedBy: m.actorLabel(p.ReviewedBy), ReviewNote: p.ReviewNote}.withComplete(), true
}

func (m *memStore) ListMembersAdmin(_ context.Context, q MemberQuery) ([]MemberAdminRow, int, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 100 {
		q.Limit = 20
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	rows := []MemberAdminRow{}
	for id := range m.users {
		r, ok := m.memberRow(id)
		if !ok {
			continue
		}
		if q.Q != "" && !strings.Contains(strings.ToLower(r.Email+" "+r.Name), strings.ToLower(q.Q)) {
			continue
		}
		if (q.Status != "" && r.Status != q.Status) || (q.Department != "" && r.Department != q.Department) || (q.Batch > 0 && r.Batch != q.Batch) ||
			(q.BatchAbove > 0 && r.Batch <= q.BatchAbove) || (q.BatchUpTo > 0 && r.Batch > q.BatchUpTo) {
			continue
		}
		if (q.Verified == "yes" && !r.EmailVerified) || (q.Verified == "no" && r.EmailVerified) ||
			(q.Complete == "yes" && !r.Complete) || (q.Complete == "no" && r.Complete) ||
			(q.Disabled == "yes" && !r.Disabled) || (q.Disabled == "no" && r.Disabled) {
			continue
		}
		switch q.View {
		case "verified":
			if !(r.Status == StatusApproved && r.EmailVerified) {
				continue
			}
		case "review":
			if r.Status == StatusRejected || !(r.Status == StatusPending || !r.EmailVerified || !r.Complete) {
				continue
			}
		}
		rows = append(rows, r)
	}
	sort.SliceStable(rows, func(i, j int) bool {
		switch q.Sort {
		case "oldest":
			return rows[i].CreatedAt+rows[i].ID < rows[j].CreatedAt+rows[j].ID
		case "name":
			return strings.ToLower(rows[i].Name) < strings.ToLower(rows[j].Name)
		case "batch":
			if rows[i].Batch != rows[j].Batch {
				return rows[i].Batch > rows[j].Batch
			}
			return strings.ToLower(rows[i].Name) < strings.ToLower(rows[j].Name)
		case "status":
			if rows[i].Status != rows[j].Status {
				return rows[i].Status < rows[j].Status
			}
			return strings.ToLower(rows[i].Name) < strings.ToLower(rows[j].Name)
		}
		return rows[i].CreatedAt+rows[i].ID > rows[j].CreatedAt+rows[j].ID
	})
	total := len(rows)
	lo := (q.Page - 1) * q.Limit
	if lo > total {
		lo = total
	}
	hi := lo + q.Limit
	if hi > total {
		hi = total
	}
	return rows[lo:hi], total, nil
}

func (m *memStore) MemberAdmin(_ context.Context, userID string) (MemberAdminRow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if r, ok := m.memberRow(userID); ok {
		return r, nil
	}
	return MemberAdminRow{}, ErrNotFound
}

func (m *memStore) UpdateMemberAdmin(_ context.Context, actorID, userID string, patch MemberPatch) (MemberAdminRow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.profiles[userID]
	if !ok {
		return MemberAdminRow{}, ErrNotFound
	}
	if patch.Name != nil {
		p.Name = *patch.Name
	}
	if patch.Batch != nil {
		p.Batch = *patch.Batch
	}
	if patch.Department != nil {
		p.Department = *patch.Department
	}
	if patch.Upazila != nil {
		p.Upazila = *patch.Upazila
	}
	if patch.Union != nil {
		p.Union = *patch.Union
	}
	if patch.Phone != nil {
		p.Phone = *patch.Phone
	}
	if patch.BloodGroup != nil {
		p.BloodGroup = *patch.BloodGroup
	}
	if patch.ShowInDirectory != nil {
		p.ShowInDirectory = *patch.ShowInDirectory
	}
	if patch.Session != nil {
		p.Session = *patch.Session
	}
	if patch.Gender != nil {
		p.Gender = *patch.Gender
	}
	m.auditLocked(actorID, "member.update", "user", userID, nil)
	r, _ := m.memberRow(userID)
	return r, nil
}

func (m *memStore) ReviewMember(ctx context.Context, actorID, userID, status string, note ...string) error {
	if err := m.ReviewProfile(ctx, userID, status); err != nil {
		return err
	}
	why := ""
	if len(note) > 0 {
		why = note[0]
	}
	m.mu.Lock()
	p := m.profiles[userID]
	p.ReviewedAt, p.ReviewedBy, p.ReviewNote = time.Now().UTC().Format(time.RFC3339), actorID, why
	m.mu.Unlock()
	detail := map[string]any{}
	if why != "" {
		detail["reason"] = why
	}
	return m.Audit(ctx, actorID, "member."+status, "user", userID, detail)
}

func (m *memStore) MemberHistory(_ context.Context, userID string) ([]Activity, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []Activity{}
	for i := len(m.cms.audit) - 1; i >= 0; i-- {
		a := m.cms.audit[i]
		if a.entity == "user" && a.entityID == userID && strings.HasPrefix(a.action, "member.") {
			out = append(out, Activity{At: stamp(a.at), Actor: m.actorLabel(a.actor), Action: a.action, Entity: a.entity, EntityID: a.entityID, Detail: a.detail})
		}
	}
	return out, nil
}

func (r MemberAdminRow) withComplete() MemberAdminRow {
	r.Complete = len(r.Missing) == 0
	return r
}

func (m *memStore) SetAccountDisabled(_ context.Context, actorID, userID string, disabled bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[userID]
	if !ok {
		return ErrNotFound
	}
	if disabled {
		if actorID == userID {
			return ErrSelfDisable
		}
		if u.Role == RoleAdmin {
			return ErrAdminProtected
		}
		for tok, s := range m.sessions {
			if s.userID == userID {
				delete(m.sessions, tok)
			}
		}
	}
	u.Disabled = disabled
	action := "member.activate"
	if disabled {
		action = "member.deactivate"
	}
	m.auditLocked(actorID, action, "user", userID, nil)
	return nil
}

func (m *memStore) RemoveMember(ctx context.Context, actorID, userID string, external func(context.Context) error) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[userID]
	if !ok {
		return ErrNotFound
	}
	if actorID == userID {
		return ErrSelfDisable
	}
	if u.Role == RoleAdmin {
		return ErrAdminProtected
	}
	if external != nil {
		if err := external(ctx); err != nil {
			return err
		}
	}
	name := ""
	if p, ok := m.profiles[userID]; ok {
		name = p.Name
	}
	for tok, s := range m.sessions {
		if s.userID == userID {
			delete(m.sessions, tok)
		}
	}
	delete(m.byEmail, normEmail(u.Email))
	delete(m.profiles, userID)
	delete(m.users, userID)
	m.auditLocked(actorID, "member.remove", "user", userID, map[string]any{"title": name, "email": u.Email})
	return nil
}

func (m *memStore) DeleteEntry(_ context.Context, actorID, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmsInit()
	e, ok := m.cms.entries[id]
	if !ok {
		return ErrNotFound
	}
	for _, c := range m.cms.entries {
		if c.ParentID == id {
			return ErrBadState
		}
	}
	if e.Status != StatusArchived {
		return ErrBadState
	}
	delete(m.cms.entries, id)
	m.auditLocked(actorID, e.Kind+".delete", e.Kind, id, map[string]any{"title": e.Title})
	return nil
}
