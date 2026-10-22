package main

import (
	"context"
	"fmt"
	"sort"
	"time"
)

type memCommittee struct {
	Committee
	createdAt time.Time
}

type memExecutive struct {
	Executive
	removed bool
}

// CommitteeAudit mirrors a row of committee_audit (kept in memory for tests).
type CommitteeAudit struct{ Committee, Executive, Actor, Action string }

type committeeMem struct {
	committees map[string]*memCommittee
	executives map[string]*memExecutive
	audit      []CommitteeAudit
	seq        int
}

func (m *memStore) cmInit() {
	if m.cm.committees == nil {
		m.cm.committees = map[string]*memCommittee{}
		m.cm.executives = map[string]*memExecutive{}
	}
}

func (m *memStore) cmCount(id string) int {
	n := 0
	for _, e := range m.cm.executives {
		if e.CommitteeID == id && !e.removed {
			n++
		}
	}
	return n
}

func (m *memStore) cmView(c *memCommittee) Committee {
	v := c.Committee
	v.MemberCount = m.cmCount(c.ID)
	return v
}

func (m *memStore) cmMembers(id string) []Executive {
	out := []Executive{}
	for _, e := range m.cm.executives {
		if e.CommitteeID == id && !e.removed {
			out = append(out, e.Executive)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Order != out[j].Order {
			return out[i].Order < out[j].Order
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func (m *memStore) cmLog(committee, exec, actor, action string) {
	m.cm.audit = append(m.cm.audit, CommitteeAudit{committee, exec, actor, action})
}

// CommitteeAuditLog is for tests.
func (m *memStore) CommitteeAuditLog() []CommitteeAudit {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]CommitteeAudit(nil), m.cm.audit...)
}

func (m *memStore) ListCommittees(_ context.Context) ([]Committee, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmInit()
	out := []Committee{}
	for _, c := range m.cm.committees {
		out = append(out, m.cmView(c))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}

func (m *memStore) CommitteeDetail(_ context.Context, id string) (Committee, []Executive, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmInit()
	c, ok := m.cm.committees[id]
	if !ok {
		return Committee{}, nil, ErrNotFound
	}
	return m.cmView(c), m.cmMembers(id), nil
}

func (m *memStore) PublishedCommittee(_ context.Context) (Committee, []Executive, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmInit()
	for _, c := range m.cm.committees {
		if c.Status == CommitteePublished {
			return m.cmView(c), m.cmMembers(c.ID), nil
		}
	}
	return Committee{}, nil, ErrNotFound
}

func (m *memStore) CreateCommittee(_ context.Context, actorID string, in CommitteeInput) (Committee, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmInit()
	m.cm.seq++
	now := time.Now()
	c := &memCommittee{Committee: Committee{
		ID: fmt.Sprintf("c%04d", m.cm.seq), Name: in.Name, Term: in.Term, StartsOn: in.StartsOn, EndsOn: in.EndsOn,
		Status: CommitteeDraft, CreatedAt: now.Format(time.RFC3339Nano),
	}, createdAt: now}
	m.cm.committees[c.ID] = c
	m.cmLog(c.ID, "", actorID, "committee.create")
	return m.cmView(c), nil
}

func (m *memStore) UpdateCommittee(_ context.Context, actorID, id string, in CommitteeInput) (Committee, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmInit()
	c, ok := m.cm.committees[id]
	if !ok {
		return Committee{}, ErrNotFound
	}
	if c.Status == CommitteeArchived {
		return Committee{}, ErrCommitteeArchived
	}
	c.Name, c.Term, c.StartsOn, c.EndsOn = in.Name, in.Term, in.StartsOn, in.EndsOn
	m.cmLog(id, "", actorID, "committee.update")
	return m.cmView(c), nil
}

func (m *memStore) SetCommitteeStatus(_ context.Context, actorID, id, action string) (Committee, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmInit()
	c, ok := m.cm.committees[id]
	if !ok {
		return Committee{}, ErrNotFound
	}
	now := time.Now().Format(time.RFC3339Nano)
	switch action {
	case "publish":
		if c.Status != CommitteeDraft {
			return Committee{}, ErrBadState
		}
		if m.cmCount(id) == 0 {
			return Committee{}, ErrEmptyCommittee
		}
		for _, other := range m.cm.committees {
			if other.Status == CommitteePublished {
				other.Status, other.ArchivedAt = CommitteeArchived, now
				m.cmLog(other.ID, "", actorID, "committee.archive")
			}
		}
		c.Status, c.PublishedAt = CommitteePublished, now
	case "unpublish":
		if c.Status != CommitteePublished {
			return Committee{}, ErrBadState
		}
		c.Status = CommitteeDraft
	case "archive":
		if c.Status == CommitteeArchived {
			return Committee{}, ErrBadState
		}
		c.Status, c.ArchivedAt = CommitteeArchived, now
	default:
		return Committee{}, ErrBadState
	}
	m.cmLog(id, "", actorID, "committee."+action)
	return m.cmView(c), nil
}

func (m *memStore) cmWritable(committeeID string) (*memCommittee, error) {
	c, ok := m.cm.committees[committeeID]
	if !ok {
		return nil, ErrNotFound
	}
	if c.Status == CommitteeArchived {
		return nil, ErrCommitteeArchived
	}
	return c, nil
}

func (m *memStore) AddExecutive(_ context.Context, actorID, committeeID string, in ExecutiveInput) (Executive, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmInit()
	if _, err := m.cmWritable(committeeID); err != nil {
		return Executive{}, err
	}
	name := in.Name
	if in.UserID != "" {
		if _, ok := m.users[in.UserID]; !ok {
			return Executive{}, ErrUnknownMember
		}
		for _, e := range m.cm.executives {
			if e.CommitteeID == committeeID && e.UserID == in.UserID && !e.removed {
				return Executive{}, ErrDuplicateExecutive
			}
		}
		if name == "" {
			if p, ok := m.profiles[in.UserID]; ok {
				name = p.Name
			}
		}
		if name == "" {
			return Executive{}, ErrUnknownMember // a linked account with no profile name needs an explicit name
		}
	}
	order := 0
	if in.Order != nil {
		order = *in.Order
	} else {
		for _, e := range m.cmMembers(committeeID) {
			if e.Order >= order {
				order = e.Order + 1
			}
		}
	}
	m.cm.seq++
	x := &memExecutive{Executive: Executive{
		ID: fmt.Sprintf("x%04d", m.cm.seq), CommitteeID: committeeID, UserID: in.UserID, Name: name,
		Designation: in.Designation, Bio: in.Bio, Photo: in.Photo, Order: order,
	}}
	m.cm.executives[x.ID] = x
	m.cmLog(committeeID, x.ID, actorID, "executive.add")
	return x.Executive, nil
}

func (m *memStore) UpdateExecutive(_ context.Context, actorID, id string, p ExecutivePatch) (Executive, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmInit()
	x, ok := m.cm.executives[id]
	if !ok || x.removed {
		return Executive{}, ErrNotFound
	}
	if _, err := m.cmWritable(x.CommitteeID); err != nil {
		return Executive{}, err
	}
	if p.Name != nil {
		x.Name = *p.Name
	}
	if p.Designation != nil {
		x.Designation = *p.Designation
	}
	if p.Bio != nil {
		x.Bio = *p.Bio
	}
	if p.Photo != nil {
		x.Photo = *p.Photo
	}
	if p.Order != nil {
		x.Order = *p.Order
	}
	m.cmLog(x.CommitteeID, id, actorID, "executive.update")
	return x.Executive, nil
}

func (m *memStore) RemoveExecutive(_ context.Context, actorID, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmInit()
	x, ok := m.cm.executives[id]
	if !ok || x.removed {
		return ErrNotFound
	}
	if _, err := m.cmWritable(x.CommitteeID); err != nil {
		return err
	}
	x.removed = true // the seat only; the user account and profile are never touched
	m.cmLog(x.CommitteeID, id, actorID, "executive.remove")
	return nil
}

func (m *memStore) ReorderExecutives(_ context.Context, actorID, committeeID string, ids []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmInit()
	if _, err := m.cmWritable(committeeID); err != nil {
		return err
	}
	active := m.cmMembers(committeeID)
	if len(ids) != len(active) {
		return ErrReorderMismatch
	}
	seen := map[string]bool{}
	for _, id := range ids {
		x, ok := m.cm.executives[id]
		if !ok || x.removed || x.CommitteeID != committeeID || seen[id] {
			return ErrReorderMismatch
		}
		seen[id] = true
	}
	for i, id := range ids {
		m.cm.executives[id].Order = i + 1
	}
	m.cmLog(committeeID, "", actorID, "executive.reorder")
	return nil
}
