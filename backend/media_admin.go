package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"
)

// Housekeeping for the shared picture registry (migration 023): how many pictures and bytes there are, linking pictures to
// the content that shows them, and removing pictures nobody uses any more.
//
// Removal is deliberately cautious. A picture is removed only when ALL of these hold, checked again under a row lock right
// before the Storage file is deleted:
//   1. it is ready and no content_media reference exists;
//   2. it has been unused for longer than the grace period (default 14 days);
//   3. no content entry and no site setting mentions its file name any more (the content tables themselves are searched,
//      so a reference that was never recorded can not be missed);
//   4. it is not part of an upload that is still running.
// The file goes through the Storage API with the server's key (never by deleting rows of storage.objects), and the registry
// row only after Storage confirmed. Nothing here runs by itself: an admin starts it, and the default is a dry run.

const mediaGrace = 14 * 24 * time.Hour

type MediaStats struct {
	Assets      int   `json:"assets"`
	Bytes       int64 `json:"bytes"`
	Unused      int   `json:"unused"`
	UnusedBytes int64 `json:"unusedBytes"`
	References  int   `json:"references"`
}

type MediaCandidate struct {
	ID     string `json:"id"`
	Path   string `json:"path"`
	Bucket string `json:"bucket"`
	Size   int64  `json:"size"`
}

// MediaStore is implemented by the PostgreSQL store only; the in-memory test store has no registry.
type MediaStore interface {
	MediaStats(ctx context.Context) (MediaStats, error)
	// MediaSyncRefs records which entries and settings show which ready picture and returns the references now known.
	MediaSyncRefs(ctx context.Context) (int, error)
	// MediaCandidates lists ready pictures that have been unused for longer than grace and are not mentioned anywhere.
	MediaCandidates(ctx context.Context, grace time.Duration, limit int) ([]MediaCandidate, error)
	// MediaPurge re-checks one candidate under a row lock (a concurrent upload of the same picture waits on it), calls del to remove
	// the Storage file and only when that worked deletes the registry row. It reports whether the picture was removed.
	MediaPurge(ctx context.Context, id string, grace time.Duration, del func(context.Context, MediaCandidate) error) (bool, error)
}

// ObjectDeleter removes one file through the Storage API.
type ObjectDeleter interface {
	DeleteObject(ctx context.Context, bucket, name string) error
}

func (s *supabaseAdmin) DeleteObject(ctx context.Context, bucket, name string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, s.baseURL+"/storage/v1/object/"+url.PathEscape(bucket)+"/"+url.PathEscape(name), nil)
	if err != nil {
		return err
	}
	s.setAuth(req)
	res, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("storage delete request failed")
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64<<10))
	if res.StatusCode/100 == 2 || res.StatusCode == http.StatusNotFound { // already gone is the goal
		return nil
	}
	return fmt.Errorf("storage returned %d", res.StatusCode)
}

func (a *App) mediaStore(w http.ResponseWriter) MediaStore {
	if m, ok := a.Auth.Store.(MediaStore); ok {
		return m
	}
	apiError(w, http.StatusNotImplemented, "media registry is not available")
	return nil
}

func (a *App) mediaStats(w http.ResponseWriter, r *http.Request, _ User) {
	m := a.mediaStore(w)
	if m == nil {
		return
	}
	if _, err := m.MediaSyncRefs(r.Context()); err != nil {
		log.Printf("media sync: %v", err)
		apiError(w, http.StatusInternalServerError, "could not read the picture registry")
		return
	}
	st, err := m.MediaStats(r.Context())
	if err != nil {
		log.Printf("media stats: %v", err)
		apiError(w, http.StatusInternalServerError, "could not read the picture registry")
		return
	}
	writeJSON(w, 200, st)
}

// POST /admin/media/cleanup?apply=1 — without apply it only lists what would be removed.
func (a *App) mediaCleanup(w http.ResponseWriter, r *http.Request, u User) {
	m := a.mediaStore(w)
	if m == nil {
		return
	}
	ctx := r.Context()
	if _, err := m.MediaSyncRefs(ctx); err != nil { // first record what is shown where, so nothing in use looks unused
		log.Printf("media sync: %v", err)
		apiError(w, http.StatusInternalServerError, "could not read the picture registry")
		return
	}
	list, err := m.MediaCandidates(ctx, mediaGrace, 100)
	if err != nil {
		log.Printf("media candidates: %v", err)
		apiError(w, http.StatusInternalServerError, "could not read the picture registry")
		return
	}
	apply := r.URL.Query().Get("apply") == "1"
	out := map[string]any{"apply": apply, "graceDays": int(mediaGrace.Hours() / 24), "candidates": list, "removed": 0, "bytes": int64(0)}
	if apply && len(list) > 0 {
		del, ok := a.Auth.Inviter.(ObjectDeleter)
		if !ok {
			apiError(w, http.StatusServiceUnavailable, "the storage key is not configured on the server")
			return
		}
		removed, bytes := 0, int64(0)
		for _, c := range list {
			gone, err := m.MediaPurge(ctx, c.ID, mediaGrace, func(ctx context.Context, c MediaCandidate) error { return del.DeleteObject(ctx, c.Bucket, c.Path) })
			if err != nil {
				log.Printf("media cleanup: %s: %v (nothing was removed)", c.Path, err)
				continue
			}
			if gone {
				removed++
				bytes += c.Size
			}
		}
		out["removed"], out["bytes"] = removed, bytes
		log.Printf("media cleanup by %s: %d pictures, %d bytes", u.ID, removed, bytes)
	}
	writeJSON(w, 200, out)
}
