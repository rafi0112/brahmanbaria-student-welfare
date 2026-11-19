package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"unicode/utf8"
)

// The pictures admins choose for the public site, stored as one setting: the home page slides (in their order, each
// published or not), the picture at the top of each page, the featured picture of the Gallery page, and the picture of
// the "Explore Brahmanbaria" section. Every picture is one that was uploaded to the site's media storage (from the
// device, a link, or picked from the gallery). Where nothing is chosen the site shows its built-in picture.
const settingSiteImages = "site.images"

const maxHeroSlides = 12

// sitePageKeys are the pages whose top picture can be changed.
var sitePageKeys = map[string]bool{"students": true, "alumni": true, "committee": true, "events": true, "gallery": true, "heritage": true,
	"blog": true, "about": true, "help": true, "directory": true, "member": true,
	// pictures inside pages (not at their top): the two beside the About text, the small one and the community photo on Home
	"about-art-1": true, "about-art-2": true, "home-inset": true, "home-community": true,
	// the logo, the student profile cover and the pencil sketches
	"logo": true, "profile-cover": true, "sketch-river": true, "sketch-heritage": true, "sketch-students": true, "sketch-vine-tl": true,
	// the heritage page's discovery cards and culture pictures
	"heritage-discover-1": true, "heritage-discover-2": true, "heritage-discover-3": true,
	"heritage-culture-1": true, "heritage-culture-2": true, "heritage-culture-3": true, "heritage-culture-4": true}

type HeroSlide struct {
	ID        string `json:"id"`
	Image     string `json:"image"`
	ImageURL  string `json:"imageUrl,omitempty"`
	Video     string `json:"video,omitempty"` // an uploaded video (site-video bucket); shown instead of the picture
	VideoURL  string `json:"videoUrl,omitempty"`
	YouTube   string `json:"youtube,omitempty"` // a YouTube video id; shown instead of the picture
	CaptionBn string `json:"captionBn"`
	CaptionEn string `json:"captionEn"`
	Published bool   `json:"published"`
}

type SiteImages struct {
	Hero            []HeroSlide       `json:"hero"`
	Pages           map[string]string `json:"pages"`
	GalleryFeatured string            `json:"galleryFeatured"`
	Explore         string            `json:"explore"`
}

// okSiteImage: an uploaded picture, or one of the pictures bundled with the site (what older gallery entries use).
func okSiteImage(ref string) bool { return photoRx.MatchString(ref) || legacyImageRx.MatchString(ref) }

// siteImageURL is where the browser finds the picture: the media storage, or the site's own /images folder.
func (a *App) siteImageURL(ref string) string {
	if photoRx.MatchString(ref) {
		return a.mediaURL(ref)
	}
	if legacyImageRx.MatchString(ref) {
		return "/images/" + ref + "-1280.webp"
	}
	return ""
}

func siteImages(ctx context.Context, s SettingsStore) (SiteImages, error) {
	out := SiteImages{Hero: []HeroSlide{}, Pages: map[string]string{}}
	raw, err := s.Setting(ctx, settingSiteImages)
	if errors.Is(err, ErrNotFound) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return out, err
	}
	if out.Hero == nil {
		out.Hero = []HeroSlide{}
	}
	if out.Pages == nil {
		out.Pages = map[string]string{}
	}
	return out, nil
}

// checkSiteImages tidies what an admin sent and returns the problems by field ("" key never used).
func checkSiteImages(in *SiteImages) map[string]string {
	errs := map[string]string{}
	if len(in.Hero) > maxHeroSlides {
		errs["hero"] = "At most 12 slides."
	}
	seen := map[string]bool{}
	for i := range in.Hero {
		h := &in.Hero[i]
		h.ImageURL, h.VideoURL = "", ""
		h.Video = strings.TrimSpace(h.Video)
		if yt := youtubeID(h.YouTube); yt != "" || h.YouTube == "" {
			h.YouTube = yt
		}
		h.ID = strings.TrimSpace(h.ID)
		h.CaptionBn, h.CaptionEn = strings.TrimSpace(h.CaptionBn), strings.TrimSpace(h.CaptionEn)
		if h.ID == "" || len(h.ID) > 40 || seen[h.ID] {
			b := make([]byte, 6)
			_, _ = rand.Read(b)
			h.ID = hex.EncodeToString(b)
		}
		seen[h.ID] = true
		switch {
		case h.Video != "" && !videoRx.MatchString(h.Video):
			errs["hero"] = "One of the slide videos could not be used. Upload it again."
		case h.YouTube != "" && !youtubeRx.MatchString(h.YouTube):
			errs["hero"] = "One of the YouTube links is not a YouTube video."
		case h.Image != "" && !okSiteImage(h.Image):
			errs["hero"] = "One of the slide pictures could not be used. Upload it again."
		case h.Image == "" && h.Video == "" && h.YouTube == "":
			errs["hero"] = "Every slide needs a picture or a video."
		}
		if utf8.RuneCountInString(h.CaptionBn) > 120 || utf8.RuneCountInString(h.CaptionEn) > 120 {
			errs["hero"] = "Keep each caption within 120 characters."
		}
	}
	if in.Hero == nil {
		in.Hero = []HeroSlide{}
	}
	pages := map[string]string{}
	for k, v := range in.Pages {
		if v == "" {
			continue
		}
		if !sitePageKeys[k] || !okSiteImage(v) {
			errs["pages"] = "One of the page pictures could not be used. Upload it again."
			continue
		}
		pages[k] = v
	}
	in.Pages = pages
	if in.GalleryFeatured != "" && !okSiteImage(in.GalleryFeatured) {
		errs["galleryFeatured"] = "Upload the picture again."
	}
	if in.Explore != "" && !okSiteImage(in.Explore) {
		errs["explore"] = "Upload the picture again."
	}
	return errs
}

// withURLs fills the address of each picture. publicOnly drops unpublished slides and the stored paths' private bits.
func (a *App) siteImagesOut(si SiteImages, publicOnly bool) map[string]any {
	hero := []HeroSlide{}
	for _, h := range si.Hero {
		if publicOnly && !h.Published {
			continue
		}
		h.ImageURL = a.siteImageURL(h.Image)
		h.VideoURL = a.videoURL(h.Video)
		if publicOnly && h.ImageURL == "" && h.VideoURL == "" && h.YouTube == "" {
			continue
		}
		hero = append(hero, h)
	}
	pages := map[string]any{}
	for k, v := range si.Pages {
		if u := a.siteImageURL(v); u != "" {
			if publicOnly {
				pages[k] = u
			} else {
				pages[k] = map[string]string{"image": v, "imageUrl": u}
			}
		}
	}
	out := map[string]any{"hero": hero, "pages": pages}
	one := func(key, ref string) {
		u := a.siteImageURL(ref)
		switch {
		case publicOnly:
			out[key] = u
		case u == "":
			out[key] = nil
		default:
			out[key] = map[string]string{"image": ref, "imageUrl": u}
		}
	}
	one("galleryFeatured", si.GalleryFeatured)
	one("explore", si.Explore)
	return out
}

func (a *App) siteImagesRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("GET /api/v1/site-images", h(a.siteImagesPublic))
	m.HandleFunc("GET /api/v1/admin/settings/site-images", adm(a.siteImagesGet))
	m.HandleFunc("PUT /api/v1/admin/settings/site-images", adm(a.siteImagesPut))
}

func (a *App) siteImagesPublic(w http.ResponseWriter, r *http.Request) {
	si, err := siteImages(r.Context(), a.Auth.Store)
	if err != nil {
		log.Printf("site images: %v", err)
		si = SiteImages{}
	}
	w.Header().Set("Cache-Control", "no-cache") // a saved change shows on the next page load
	writeJSON(w, 200, a.siteImagesOut(si, true))
}

func (a *App) siteImagesGet(w http.ResponseWriter, r *http.Request, _ User) {
	si, err := siteImages(r.Context(), a.Auth.Store)
	if err != nil {
		log.Printf("site images: %v", err)
		apiError(w, 500, "could not load")
		return
	}
	writeJSON(w, 200, a.siteImagesOut(si, false))
}

func (a *App) siteImagesPut(w http.ResponseWriter, r *http.Request, u User) {
	var in SiteImages
	if !decode(w, r, &in) {
		return
	}
	if errs := checkSiteImages(&in); len(errs) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "validation failed", "fields": errs})
		return
	}
	if err := a.Auth.Store.SetSetting(r.Context(), u.ID, settingSiteImages, in); err != nil {
		log.Printf("site images: %v", err)
		apiError(w, 500, "could not save")
		return
	}
	writeJSON(w, 200, a.siteImagesOut(in, false))
}
