package main

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

var (
	ErrSlugTaken     = errors.New("that URL name is already used")
	ErrParentInvalid = errors.New("the album does not exist")
	ErrAdminProtected = errors.New("demote the admin before deactivating the account")
	ErrSelfDisable   = errors.New("you cannot deactivate your own account")
	ErrStale         = errors.New("someone else changed this record after you opened it")
)

const (
	KindBlog  = "blog"
	KindPlace = "place"
	KindAlbum = "album"
	KindImage = "image"

	StatusDraft     = "draft"
	StatusPublished = "published"
	StatusArchived  = "archived"
)

// Entry is one editorial record: a blog post, heritage place, gallery album or gallery image.
type Entry struct {
	ID          string          `json:"id"`
	Kind        string          `json:"kind"`
	Slug        string          `json:"slug"`
	Title       string          `json:"title"`
	Status      string          `json:"status"`
	Featured    bool            `json:"featured"`
	SortOrder   int             `json:"sortOrder"`
	ParentID    string          `json:"parentId,omitempty"`
	Data        json.RawMessage `json:"data"`
	PublishedAt string          `json:"publishedAt,omitempty"`
	CreatedAt   string          `json:"createdAt"`
	UpdatedAt   string          `json:"updatedAt"`
	CreatedBy   string          `json:"createdBy,omitempty"`
	UpdatedBy   string          `json:"updatedBy,omitempty"`
	AuthorName  string          `json:"authorName,omitempty"` // display name of the creator, when known
}

type EntryInput struct {
	Kind      string
	Slug      string
	Title     string
	Featured  bool
	SortOrder *int
	ParentID  string
	Data      json.RawMessage
	// ExpectedUpdatedAt, when set on an update, must equal the record's current updatedAt, otherwise the save is refused
	// (another admin saved in between) and nothing is overwritten.
	ExpectedUpdatedAt string
}

// EntryQuery. Status "" lists everything except archived, "all" lists everything, anything else is exact.
type EntryQuery struct {
	Kind     string
	Q        string
	Status   string
	Parent   string // "" any, "none" = no album, otherwise an album id
	Featured string // "", "yes", "no"
	From, To string // YYYY-MM-DD on the publication (or creation) date
	Category string // matched against data.category
	Author   string // matched against data.author
	Upazila  string // matched against data.upazila
	Sort     string // updated (default), published, order, title
	Page     int
	Limit    int
	Public   bool // published rows only, whatever Status says
}

// Activity is one row of the audit trail shown to admins.
type Activity struct {
	At       string         `json:"at"`
	Actor    string         `json:"actor"`
	Action   string         `json:"action"`
	Entity   string         `json:"entity"`
	EntityID string         `json:"entityId"`
	Detail   map[string]any `json:"detail,omitempty"`
}

type RoleChangeRow struct {
	At     string `json:"at"`
	Target string `json:"target"`
	Actor  string `json:"actor"`
	From   string `json:"from"`
	To     string `json:"to"`
	Source string `json:"source"`
}

type MemberQuery struct {
	Q, Status, Department, Verified, Complete, Disabled string
	View                                               string // "" | review (needs an admin's attention) | verified (approved and email confirmed)
	Batch                                              int
	Page, Limit                                        int
	Sort                                               string // newest (default), oldest, name, batch, status
}

var memberSorts = map[string]bool{"": true, "newest": true, "oldest": true, "name": true, "batch": true, "status": true}
var userSorts = map[string]bool{"": true, "newest": true, "oldest": true, "name": true, "email": true, "role": true}

// MemberAdminRow is the admin's view of a registered member (never returned on public routes).
type MemberAdminRow struct {
	ID              string `json:"id"`
	Email           string `json:"email"`
	Name            string `json:"name"`
	Batch           int    `json:"batch"`
	Department      string `json:"department"`
	Upazila         string `json:"upazila"`
	Union           string `json:"union"`
	Phone           string `json:"phone"`
	BloodGroup      string `json:"bloodGroup"`
	Status          string `json:"status"`
	ShowInDirectory bool   `json:"showInDirectory"`
	Role            string `json:"role"`
	EmailVerified   bool   `json:"emailVerified"`
	Disabled        bool   `json:"disabled"`
	Complete        bool   `json:"complete"`
	CreatedAt       string `json:"createdAt"`
	Session         string   `json:"session"`
	Gender          string   `json:"gender"`
	Missing         []string `json:"missing"` // required profile fields that are still empty
	ReviewedAt      string   `json:"reviewedAt,omitempty"`
	ReviewedBy      string   `json:"reviewedBy,omitempty"`
	ReviewNote      string   `json:"reviewNote,omitempty"`
	PhotoURL        string   `json:"photoUrl,omitempty"` // filled by the API
}

// requiredProfileFields are what a profile needs to count as complete. Phone, blood group, gender and photo are optional.
func missingProfileFields(name string, batch int, department, upazila, union, session string) []string {
	out := []string{}
	if strings.TrimSpace(name) == "" {
		out = append(out, "name")
	}
	if batch < 1 {
		out = append(out, "batch")
	}
	if department == "" {
		out = append(out, "department")
	}
	if session == "" {
		out = append(out, "session")
	}
	if upazila == "" {
		out = append(out, "upazila")
	}
	if union == "" {
		out = append(out, "union")
	}
	return out
}

type MemberPatch struct {
	Name            *string
	Batch           *int
	Department      *string
	Upazila         *string
	Union           *string
	Phone           *string
	BloodGroup      *string
	ShowInDirectory *bool
	Session         *string
	Gender          *string
}

// CMSStore is the persistence boundary for editorial content, members as seen by admins, and the audit trail.
// As with the other stores, every rule lives here so no caller can bypass it.
type CMSStore interface {
	ListEntries(ctx context.Context, q EntryQuery) ([]Entry, int, error)
	// GetEntry finds by id or by slug (within kind). publicOnly hides everything that is not published.
	GetEntry(ctx context.Context, kind, idOrSlug string, publicOnly bool) (Entry, error)
	CreateEntry(ctx context.Context, actorID string, in EntryInput) (Entry, error)
	UpdateEntry(ctx context.Context, actorID, id string, in EntryInput) (Entry, error)
	// SetEntryStatus: publish (draft/archived -> published), unpublish (published -> draft),
	// archive (draft/published -> archived), restore (archived -> draft).
	SetEntryStatus(ctx context.Context, actorID, id, action string) (Entry, error)
	ReorderEntries(ctx context.Context, actorID, kind string, ids []string) error
	CountEntries(ctx context.Context) (map[string]map[string]int, error)

	Audit(ctx context.Context, actorID, action, entity, entityID string, detail map[string]any) error
	HasAuditAction(ctx context.Context, action string) (bool, error)
	RecentActivity(ctx context.Context, limit int) ([]Activity, error)
	RoleHistory(ctx context.Context, targetID string, limit int) ([]RoleChangeRow, error)

	ListMembersAdmin(ctx context.Context, q MemberQuery) ([]MemberAdminRow, int, error)
	MemberAdmin(ctx context.Context, userID string) (MemberAdminRow, error)
	UpdateMemberAdmin(ctx context.Context, actorID, userID string, p MemberPatch) (MemberAdminRow, error)
	// ReviewMember records a membership decision; an optional note (the reason for a rejection) is kept with it.
	ReviewMember(ctx context.Context, actorID, userID, status string, note ...string) error
	MemberHistory(ctx context.Context, userID string) ([]Activity, error)
	SetAccountDisabled(ctx context.Context, actorID, userID string, disabled bool) error
}

var slugRx = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func validSlug(s string) bool { return len(s) >= 3 && len(s) <= 80 && slugRx.MatchString(s) }

// slugify makes a URL-safe name from ASCII letters and digits; titles with no Latin letters give "".
func slugify(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		default:
			if b.Len() > 0 && !dash {
				b.WriteByte('-')
				dash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) > 80 {
		out = strings.Trim(out[:80], "-")
	}
	return out
}

// entryText is what free-text search looks at.
func entryText(e Entry) string { return strings.ToLower(e.Title + " " + string(e.Data)) }

func (q *EntryQuery) norm() {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 100 {
		q.Limit = 20
	}
}

// dataField reads one top-level string field of an entry's JSON data.
func dataField(raw json.RawMessage, key string) string {
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return ""
	}
	s, _ := m[key].(string)
	return s
}
