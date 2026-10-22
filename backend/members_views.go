package main

import (
	"context"
	"log"
	"net/http"
)

// memberCounts are the numbers behind the Students sidebar. Each one is a real query over the same registered-member data:
// Membership Requests are the pending members plus approved members’ profile-update requests, split by profile completeness; Members are everyone, those needing review and the verified.
func (a *App) memberCounts(ctx context.Context) (map[string]int, error) {
	s := a.Auth.Store
	count := func(q MemberQuery) (int, error) {
		q.Page, q.Limit = 1, 1
		_, n, err := s.ListMembersAdmin(ctx, q)
		return n, err
	}
	out := map[string]int{}
	for k, q := range map[string]MemberQuery{
		"all":               {},
		"approved":          {Status: StatusApproved, Disabled: "no"},
		"pending":           {Status: StatusPending},
		"pendingComplete":   {Status: StatusPending, Complete: "yes"},
		"pendingIncomplete": {Status: StatusPending, Complete: "no"},
		"review":            {View: "review"},
		"verified":          {View: "verified"},
	} {
		n, err := count(q)
		if err != nil {
			return nil, err
		}
		out[k] = n
	}
	// Profile-update requests from approved members wait in the same queue; their details are always complete.
	ch, err := s.ListProfileChanges(ctx)
	if err != nil {
		return nil, err
	}
	out["updates"] = len(ch)
	out["pending"] += len(ch)
	out["pendingComplete"] += len(ch)
	return out, nil
}

func (a *App) memberViewRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/admin/student-counts", adm(a.studentCounts))
	m.HandleFunc("GET /api/v1/admin/students/{id}/history", adm(a.studentHistory))
	m.HandleFunc("GET /api/v1/admin/directory-audit", adm(a.directoryAudit))
}

func (a *App) studentCounts(w http.ResponseWriter, r *http.Request, _ User) {
	c, err := a.memberCounts(r.Context())
	if err != nil {
		log.Printf("student counts: %v", err)
		apiError(w, 500, "could not load")
		return
	}
	writeJSON(w, 200, c)
}

func (a *App) studentHistory(w http.ResponseWriter, r *http.Request, _ User) {
	items, err := a.Auth.Store.MemberHistory(r.Context(), r.PathValue("id"))
	if err != nil {
		a.memberFail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

// directoryAudit explains how the original directory relates to real accounts. The directory stores no email address or other
// sign-in identifier, so no account can be created from it without inventing one; every record is therefore reported as
// unresolved rather than provisioned. Nothing here writes anything.
func (a *App) directoryAudit(w http.ResponseWriter, r *http.Request, _ User) {
	manual, err := a.Auth.Store.ListManualImported(r.Context())
	if err != nil {
		apiError(w, 500, "could not load")
		return
	}
	_, accounts, err := a.Auth.Store.ListUsers(r.Context(), "", "", 1, 0)
	if err != nil {
		apiError(w, 500, "could not load")
		return
	}
	_, registered, err := a.Auth.Store.ListMembersAdmin(r.Context(), MemberQuery{Page: 1, Limit: 1})
	if err != nil {
		apiError(w, 500, "could not load")
		return
	}
	total := len(a.Store.Students) + len(manual)
	writeJSON(w, 200, map[string]any{
		"directoryRecords": total, "withEmail": 0, "provisionable": 0, "unresolved": total,
		"accounts": accounts, "registeredMembers": registered,
		"reason": "no_identifier", // directory records carry no email address, so none can be turned into an account
	})
}
