package main

import (
	"context"
	"errors"
	"time"
)

var (
	ErrNotFound   = errors.New("not found")
	ErrEmailTaken = errors.New("email already registered")

	ErrTargetUnverified = errors.New("account email is not verified")
	ErrLastAdmin        = errors.New("cannot remove the last active admin")
	ErrInvalidRole      = errors.New("invalid role")
	ErrForbidden        = errors.New("forbidden")
)

const (
	RoleMember = "member"
	RoleAdmin  = "admin"

	StatusPending  = "pending"
	StatusApproved = "approved"
	StatusRejected = "rejected"

	PurposeVerify = "verify"
	PurposeReset  = "reset"
)

type User struct {
	ID            string
	Email         string
	PasswordHash  string
	Role          string
	EmailVerified bool
	Disabled      bool
}

type Profile struct {
	UserID          string `json:"userId,omitempty"`
	Name            string `json:"name"`
	Batch           int    `json:"batch"`
	Department      string `json:"department"`
	Upazila         string `json:"upazila"`
	Union           string `json:"union"`
	Phone           string `json:"phone"`
	BloodGroup      string `json:"bloodGroup"`
	Status          string `json:"status"`
	ShowInDirectory bool   `json:"showInDirectory"`
	ShowPhone       string `json:"showPhone"`
	ShowEmail       string `json:"showEmail"`
	ShowBlood       string `json:"showBlood"`
	CreatedAt       string `json:"createdAt,omitempty"`
}

// UserRow is what admins see in the role-management list.
type UserRow struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	Name          string `json:"name"`
	Role          string `json:"role"`
	EmailVerified bool   `json:"emailVerified"`
	MemberStatus  string `json:"memberStatus"`
	CreatedAt     string `json:"createdAt"`
}

// MemberRow is what admins see in the approval queue.
type MemberRow struct {
	Profile
	Email         string `json:"email"`
	EmailVerified bool   `json:"emailVerified"`
}

type NewUser struct {
	Email        string
	PasswordHash string
	Role         string
	Verified     bool
	Profile      *Profile
}

// ProfilePatch holds optional changes; nil means "leave as is".
type ProfilePatch struct {
	Phone           *string
	BloodGroup      *string
	ShowInDirectory *bool
	ShowPhone       *string
	ShowEmail       *string
	ShowBlood       *string
}

// AuthStore is the persistence boundary. Postgres is used in production;
// the in-memory implementation is for tests and explicit local development.
type AuthStore interface {
	CommitteeStore
	CMSStore

	CreateUser(ctx context.Context, n NewUser) (User, error)
	UserByEmail(ctx context.Context, email string) (User, error)
	UserByID(ctx context.Context, id string) (User, error)
	SetEmailVerified(ctx context.Context, userID string) error
	SetPassword(ctx context.Context, userID, hash string) error

	SaveToken(ctx context.Context, userID, purpose, tokenHash string, expires time.Time) error
	// ConsumeToken marks an unused, unexpired token as used and returns its user.
	ConsumeToken(ctx context.Context, purpose, tokenHash string) (string, error)

	CreateSession(ctx context.Context, userID, tokenHash string, expires time.Time) error
	SessionUser(ctx context.Context, tokenHash string) (User, error)
	DeleteSession(ctx context.Context, tokenHash string) error
	DeleteUserSessions(ctx context.Context, userID string) error

	ProfileByUser(ctx context.Context, userID string) (*Profile, error)
	EnsureExternalUser(ctx context.Context, userID, email string, verified bool) (User, error)
	UpsertProfile(ctx context.Context, userID string, p Profile) error
	UpdateProfile(ctx context.Context, userID string, p ProfilePatch) error
	ListMembers(ctx context.Context, status string) ([]MemberRow, error)
	ReviewProfile(ctx context.Context, userID, status string) error
	ApprovedDirectory(ctx context.Context) ([]Student, error)
	Counts(ctx context.Context) (map[string]int, error)

	// Roles. SetRole enforces every rule itself (self-change, verification, last admin, actor must be an admin)
	// atomically, so no caller can skip them. PromoteVerifiedByEmail is the operator-only bootstrap: it promotes
	// an account whose email Supabase has confirmed; with apply=false it only reports what it would do.
	ListUsers(ctx context.Context, q, role string, limit, offset int) ([]UserRow, int, error)
	SetRole(ctx context.Context, actorID, targetID, role string) (User, error)
	PromoteVerifiedByEmail(ctx context.Context, email string, apply bool) (user User, changed bool, err error)
	Ping(ctx context.Context) error
}
