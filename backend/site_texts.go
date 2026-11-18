package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"
)

// The words of the public site that admins changed from the panel, stored as one setting: for each text (by the same
// key the site's built-in texts use) the Bangla and English wording. A text that is not here, or a language left empty,
// shows the built-in wording, so removing a change brings the original back.
const settingSiteTexts = "site.texts"

const (
	maxSiteTexts   = 3000
	maxSiteTextLen = 5000
)

var siteTextKeyRx = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_.-]{0,99}$`)

type SiteText struct {
	Bn string `json:"bn,omitempty"`
	En string `json:"en,omitempty"`
}

func siteTexts(ctx context.Context, s SettingsStore) (map[string]SiteText, error) {
	out := map[string]SiteText{}
	raw, err := s.Setting(ctx, settingSiteTexts)
	if errors.Is(err, ErrNotFound) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return map[string]SiteText{}, err
	}
	return out, nil
}

// checkSiteTexts drops the texts with nothing in them and reports the first problem it finds ("" when all is well).
func checkSiteTexts(in map[string]SiteText) (map[string]SiteText, string) {
	if len(in) > maxSiteTexts {
		return nil, "Too many texts in one save."
	}
	out := map[string]SiteText{}
	for k, v := range in {
		if !siteTextKeyRx.MatchString(k) {
			return nil, "One of the texts has an invalid name."
		}
		v.Bn, v.En = strings.TrimSpace(v.Bn), strings.TrimSpace(v.En)
		if utf8.RuneCountInString(v.Bn) > maxSiteTextLen || utf8.RuneCountInString(v.En) > maxSiteTextLen {
			return nil, "Keep each text within 5000 characters."
		}
		if strings.ContainsRune(v.Bn, 0) || strings.ContainsRune(v.En, 0) {
			return nil, "One of the texts has characters that can not be saved."
		}
		if v.Bn == "" && v.En == "" {
			continue
		}
		out[k] = v
	}
	return out, ""
}

func (a *App) siteTextsRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/site-texts", h(a.siteTextsPublic))
	m.HandleFunc("GET /api/v1/admin/settings/site-texts", adm(a.siteTextsGet))
	m.HandleFunc("PUT /api/v1/admin/settings/site-texts", adm(a.siteTextsPut))
}

func (a *App) siteTextsPublic(w http.ResponseWriter, r *http.Request) {
	tx := map[string]SiteText{}
	if a.Auth != nil {
		var err error
		if tx, err = siteTexts(r.Context(), a.Auth.Store); err != nil {
			log.Printf("site texts: %v", err) // the site still works with its built-in wording
			tx = map[string]SiteText{}
		}
	}
	w.Header().Set("Cache-Control", "no-cache") // a saved change shows on the next page load
	writeJSON(w, 200, map[string]any{"texts": tx})
}

func (a *App) siteTextsGet(w http.ResponseWriter, r *http.Request, _ User) {
	tx, err := siteTexts(r.Context(), a.Auth.Store)
	if err != nil {
		log.Printf("site texts: %v", err)
		apiError(w, 500, "could not load")
		return
	}
	writeJSON(w, 200, map[string]any{"texts": tx})
}

func (a *App) siteTextsPut(w http.ResponseWriter, r *http.Request, u User) {
	var body struct {
		Texts map[string]SiteText `json:"texts"`
	}
	if !decodeLarge(w, r, &body) {
		return
	}
	tx, problem := checkSiteTexts(body.Texts)
	if problem != "" {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": map[string]string{"texts": problem}})
		return
	}
	if err := a.Auth.Store.SetSetting(r.Context(), u.ID, settingSiteTexts, tx); err != nil {
		log.Printf("site texts: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	writeJSON(w, 200, map[string]any{"texts": tx})
}
