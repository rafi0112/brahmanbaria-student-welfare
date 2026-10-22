package main

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrDuplicateExecutive = errors.New("this member already holds a seat in this committee")
	ErrCommitteeArchived  = errors.New("archived committees are read-only")
	ErrEmptyCommittee     = errors.New("add at least one executive before publishing")
	ErrBadState           = errors.New("that action is not available in the committee's current state")
	ErrUnknownMember      = errors.New("no such registered member")
	ErrReorderMismatch    = errors.New("the order must list every active executive exactly once")
)

const (
	CommitteeDraft     = "draft"
	CommitteePublished = "published"
	CommitteeArchived  = "archived"
)

// Committee is one term of the executive committee.
type Committee struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Term        string `json:"term"`
	StartsOn    string `json:"startsOn"`
	EndsOn      string `json:"endsOn"`
	Status      string `json:"status"`
	MemberCount int    `json:"memberCount"`
	PublishedAt string `json:"publishedAt,omitempty"`
	ArchivedAt  string `json:"archivedAt,omitempty"`
	CreatedAt   string `json:"createdAt"`
}

type CommitteeInput struct {
	Name     string `json:"name"`
	Term     string `json:"term"`
	StartsOn string `json:"startsOn"`
	EndsOn   string `json:"endsOn"`
}

// Executive is one seat. UserID links to a registered member when there is one.
type Executive struct {
	ID          string `json:"id"`
	CommitteeID string `json:"committeeId"`
	UserID      string `json:"userId,omitempty"`
	Name        string `json:"name"`
	Designation string `json:"designation"`
	Bio         string `json:"bio"`
	Photo       string `json:"photo"`
	PhotoURL    string `json:"photoUrl"`
	Order       int    `json:"order"`
}

type ExecutiveInput struct {
	UserID      string `json:"userId"`
	Name        string `json:"name"`
	Designation string `json:"designation"`
	Bio         string `json:"bio"`
	Photo       string `json:"photo"`
	Order       *int   `json:"order"`
}

// ExecutivePatch: nil means "leave as is".
type ExecutivePatch struct {
	Name        *string `json:"name"`
	Designation *string `json:"designation"`
	Bio         *string `json:"bio"`
	Photo       *string `json:"photo"`
	Order       *int    `json:"order"`
}

// CommitteeStore holds committee terms and executive seats. Every rule (one published panel, no duplicate seats,
// archived terms are frozen, removal never touches accounts) lives in the store so no caller can bypass it.
type CommitteeStore interface {
	ListCommittees(ctx context.Context) ([]Committee, error)
	CommitteeDetail(ctx context.Context, id string) (Committee, []Executive, error)
	PublishedCommittee(ctx context.Context) (Committee, []Executive, error)
	CreateCommittee(ctx context.Context, actorID string, in CommitteeInput) (Committee, error)
	UpdateCommittee(ctx context.Context, actorID, id string, in CommitteeInput) (Committee, error)
	// SetCommitteeStatus applies "publish" (draft -> published, replacing any published panel by archiving it),
	// "unpublish" (published -> draft) or "archive" (draft/published -> archived).
	SetCommitteeStatus(ctx context.Context, actorID, id, action string) (Committee, error)
	AddExecutive(ctx context.Context, actorID, committeeID string, in ExecutiveInput) (Executive, error)
	UpdateExecutive(ctx context.Context, actorID, id string, p ExecutivePatch) (Executive, error)
	RemoveExecutive(ctx context.Context, actorID, id string) error
	ReorderExecutives(ctx context.Context, actorID, committeeID string, ids []string) error
}

var (
	dateRx  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	photoRx = regexp.MustCompile(`^[0-9a-f-]{36}\.(jpg|png)$`)
)

func runes(s string) int { return utf8.RuneCountInString(strings.TrimSpace(s)) }

func validDate(s string) bool {
	if s == "" {
		return true
	}
	if !dateRx.MatchString(s) {
		return false
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

func (in *CommitteeInput) clean() map[string]string {
	in.Name, in.Term = strings.TrimSpace(in.Name), strings.TrimSpace(in.Term)
	errs := map[string]string{}
	if n := runes(in.Name); n < 2 || n > 100 {
		errs["name"] = "Committee name must be 2-100 characters."
	}
	if runes(in.Term) > 80 {
		errs["term"] = "Term must be at most 80 characters."
	}
	if !validDate(in.StartsOn) {
		errs["startsOn"] = "Use a valid start date."
	}
	if !validDate(in.EndsOn) {
		errs["endsOn"] = "Use a valid end date."
	}
	if errs["startsOn"] == "" && errs["endsOn"] == "" && in.StartsOn != "" && in.EndsOn != "" && in.EndsOn < in.StartsOn {
		errs["endsOn"] = "The end date cannot be before the start date."
	}
	return errs
}

// clean validates a new seat. Name may be empty when a member is linked (it then defaults to their profile name).
func (in *ExecutiveInput) clean() map[string]string {
	in.UserID, in.Name = strings.TrimSpace(in.UserID), strings.TrimSpace(in.Name)
	in.Designation, in.Bio = strings.TrimSpace(in.Designation), strings.TrimSpace(in.Bio)
	errs := map[string]string{}
	if in.UserID == "" {
		if n := runes(in.Name); n < 2 || n > 80 {
			errs["name"] = "Name must be 2-80 characters."
		}
	} else if in.Name != "" && (runes(in.Name) < 2 || runes(in.Name) > 80) {
		errs["name"] = "Name must be 2-80 characters."
	}
	if n := runes(in.Designation); n < 2 || n > 80 {
		errs["designation"] = "Designation must be 2-80 characters."
	}
	if runes(in.Bio) > 500 {
		errs["bio"] = "Biography must be at most 500 characters."
	}
	if in.Photo != "" && !photoRx.MatchString(in.Photo) {
		errs["photo"] = "Upload the photo again."
	}
	if in.Order != nil && (*in.Order < 0 || *in.Order > 1000) {
		errs["order"] = "Order must be between 0 and 1000."
	}
	return errs
}

func (p *ExecutivePatch) clean() map[string]string {
	errs := map[string]string{}
	trim := func(s *string) {
		if s != nil {
			*s = strings.TrimSpace(*s)
		}
	}
	trim(p.Name)
	trim(p.Designation)
	trim(p.Bio)
	if p.Name != nil && (runes(*p.Name) < 2 || runes(*p.Name) > 80) {
		errs["name"] = "Name must be 2-80 characters."
	}
	if p.Designation != nil && (runes(*p.Designation) < 2 || runes(*p.Designation) > 80) {
		errs["designation"] = "Designation must be 2-80 characters."
	}
	if p.Bio != nil && runes(*p.Bio) > 500 {
		errs["bio"] = "Biography must be at most 500 characters."
	}
	if p.Photo != nil && *p.Photo != "" && !photoRx.MatchString(*p.Photo) {
		errs["photo"] = "Upload the photo again."
	}
	if p.Order != nil && (*p.Order < 0 || *p.Order > 1000) {
		errs["order"] = "Order must be between 0 and 1000."
	}
	return errs
}
