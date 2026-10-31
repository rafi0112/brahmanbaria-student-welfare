package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
)

// What the Alumni page adds to each card beyond the four public fields:
//   - a photo, for everyone: a member's own uploaded photo, or the public photo link an admin saved on an alumni record
//     (or the original form carried). The link itself is never sent out; the server fetches it once and serves the image.
//   - contact details (phone, email, Facebook) and blood group, only to signed-in approved members and admins. A member's
//     own privacy choices for phone, email and blood group still apply.

type alumnusExtra struct {
	Source                 string // record (an alumni record) | directory | member
	Phone, Email, Facebook string
	BloodGroup             string
	PhotoLink, PhotoVer    string
	ShowPhone, ShowEmail   string
	ShowBlood              string
}

type alumnusContact struct {
	Phone    string `json:"phone,omitempty"`
	Email    string `json:"email,omitempty"`
	Facebook string `json:"facebook,omitempty"`
	Blood    string `json:"bloodGroup,omitempty"`
}

type alumnusView struct {
	Alumnus
	Photo   string          `json:"photo,omitempty"`
	Contact *alumnusContact `json:"contact,omitempty"`
}

// alumniExtras collects contact and photo sources for everyone the Alumni page can show, keyed by the same ids.
func (a *App) alumniExtras(ctx context.Context) map[string]alumnusExtra {
	d := a.data()
	out := map[string]alumnusExtra{}
	for _, al := range d.Alumni {
		pv := d.Private[al.ID]
		out[al.ID] = alumnusExtra{Source: "record", Phone: pv["phone"], Email: pv["email"], Facebook: pv["facebook"], BloodGroup: pv["bloodGroup"], PhotoLink: pv["photoLink"]}
	}
	for _, p := range a.directoryPeople(ctx) {
		if _, ok := out[p.ID]; ok {
			continue
		}
		out[p.ID] = alumnusExtra{Source: p.Source, Phone: p.Phone, Email: p.Email, Facebook: p.Extra["facebook"], PhotoLink: p.Extra["photoLink"],
			BloodGroup: p.BloodGroup, PhotoVer: p.PhotoVer, ShowPhone: p.ShowPhone, ShowEmail: p.ShowEmail, ShowBlood: p.ShowBlood}
	}
	return out
}

// photo is the card's image address, or "" when the person has none.
func (x alumnusExtra) photo(id string) string {
	if x.Source == "member" && x.PhotoVer != "" {
		return "/api/v1/alumni/" + id + "/photo?v=" + x.PhotoVer
	}
	return photoLinkURL("/api/v1/alumni/", id, x.PhotoLink)
}

// contact is what this viewer may see; nil for the public and when there is nothing to show.
func (x alumnusExtra) contact(v viewer) *alumnusContact {
	if v.Kind != "member" && v.Kind != "admin" {
		return nil
	}
	c := alumnusContact{Facebook: strings.TrimSpace(x.Facebook)}
	if x.Source == "member" {
		if levelAllows(x.ShowPhone, v.Kind) {
			c.Phone = x.Phone
		}
		if levelAllows(x.ShowEmail, v.Kind) {
			c.Email = x.Email
		}
		if levelAllows(x.ShowBlood, v.Kind) {
			c.Blood = x.BloodGroup
		}
	} else {
		c.Phone, c.Email, c.Blood = x.Phone, x.Email, x.BloodGroup
	}
	c.Phone, c.Email, c.Blood = strings.TrimSpace(c.Phone), strings.TrimSpace(c.Email), strings.TrimSpace(c.Blood)
	if c == (alumnusContact{}) {
		return nil
	}
	return &c
}

type cachedPhoto struct {
	data []byte
	at   time.Time
}

// alumniPhoto serves one alumnus's photo. Only people the Alumni page lists have one here.
func (a *App) alumniPhoto(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	listed := false
	for _, al := range a.shownAlumni(r.Context()) {
		if al.ID == id {
			listed = true
			break
		}
	}
	x, ok := a.alumniExtras(r.Context())[id]
	if !listed || !ok {
		apiError(w, http.StatusNotFound, "no photo")
		return
	}
	if x.Source == "member" && x.PhotoVer != "" && a.Auth != nil {
		a.servePhoto(w, r, strings.TrimPrefix(id, "m-"))
		return
	}
	a.serveLinkedPhoto(w, r, id, x.PhotoLink)
}

// photoLinkURL is the address of a photo kept as a saved link, under the given list's path ("" without a usable link).
// The short hash changes when the link does, so browsers fetch the new picture.
func photoLinkURL(base, id, link string) string {
	link = strings.TrimSpace(link)
	if !strings.HasPrefix(strings.ToLower(link), "https://") || len(link) > 1000 {
		return ""
	}
	sum := sha256.Sum256([]byte(link))
	return base + id + "/photo?v=" + hex.EncodeToString(sum[:4])
}

// serveLinkedPhoto fetches a saved photo link (Google Drive or any public https image) once, keeps it for a day (a
// failed fetch for ten minutes, so a broken link is not fetched on every view) and serves it as a square JPEG.
func (a *App) serveLinkedPhoto(w http.ResponseWriter, r *http.Request, id, link string) {
	link = strings.TrimSpace(link)
	if a.Auth == nil || !strings.HasPrefix(strings.ToLower(link), "https://") || len(link) > 1000 {
		apiError(w, http.StatusNotFound, "no photo")
		return
	}
	key := id + "|" + link
	var img []byte
	if c, hit := a.alumniPhotos.Load(key); hit {
		cp := c.(cachedPhoto)
		if (cp.data != nil && time.Since(cp.at) < 24*time.Hour) || (cp.data == nil && time.Since(cp.at) < 10*time.Minute) {
			img = cp.data
			if img == nil {
				apiError(w, http.StatusNotFound, "no photo")
				return
			}
		}
	}
	if img == nil {
		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()
		raw, err := a.fetchLinked(ctx, link)
		if err == nil {
			img, err = squarePhoto(raw)
		}
		if err != nil {
			a.alumniPhotos.Store(key, cachedPhoto{at: time.Now()})
			apiError(w, http.StatusNotFound, "no photo")
			return
		}
		a.alumniPhotos.Store(key, cachedPhoto{data: img, at: time.Now()})
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(img)
}

// putRecordPhotoLink sets or clears the photo link of a directory record (a student or alumnus imported from the form,
// or an alumni record). An empty link removes the photo. The record's other details are left as they are.
func (a *App) putRecordPhotoLink(w http.ResponseWriter, r *http.Request, u User) {
	var b struct {
		PhotoLink string `json:"photoLink"`
	}
	if !decode(w, r, &b) {
		return
	}
	link := strings.TrimSpace(b.PhotoLink)
	if link != "" && (!strings.HasPrefix(strings.ToLower(link), "https://") || len(link) > 1000) {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": map[string]string{"photoLink": "Use a public https link to an image."}})
		return
	}
	rec, err := a.findRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, ErrNotFound) {
		apiError(w, http.StatusNotFound, "not_found")
		return
	} else if err != nil {
		log.Printf("photo link find: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	priv := map[string]string{}
	for k, v := range rec.Private {
		priv[k] = v
	}
	if link == "" {
		delete(priv, "photoLink")
	} else {
		priv["photoLink"] = link
	}
	rec.Private = priv
	if _, _, err := a.Auth.Store.UpsertDirectoryRecords(r.Context(), []DirectoryRecord{rec}); err != nil {
		log.Printf("photo link save: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	action := "directory.photo.set"
	if link == "" {
		action = "directory.photo.remove"
	}
	_ = a.Auth.Store.Audit(r.Context(), u.ID, action, "directory", rec.ID, map[string]any{"title": rec.Name})
	if err := a.reloadLive(r.Context()); err != nil {
		log.Printf("reload after photo link: %v", err)
	}
	writeJSON(w, 200, map[string]string{"photo": photoLinkURL("/api/v1/students/", rec.ID, link)})
}
