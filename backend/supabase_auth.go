package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

type supabaseVerifier struct {
	baseURL string
	apiKey  string
	client  *http.Client

	mu    sync.Mutex
	cache map[string]cachedUser
}

type cachedUser struct {
	user    supabaseUser
	expires time.Time
}

const verifyCacheTTL = 30 * time.Second

type supabaseUser struct {
	ID               string `json:"id"`
	Email            string `json:"email"`
	EmailConfirmedAt string `json:"email_confirmed_at"`
}

func newSupabaseVerifier(baseURL, apiKey string) *supabaseVerifier {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	// People often paste the REST endpoint; the project URL is what we need.
	for _, suffix := range []string{"/rest/v1", "/auth/v1"} {
		baseURL = strings.TrimSuffix(baseURL, suffix)
	}
	apiKey = strings.TrimSpace(apiKey)
	if baseURL == "" || apiKey == "" {
		return nil
	}
	return &supabaseVerifier{baseURL: baseURL, apiKey: apiKey, client: &http.Client{Timeout: 5 * time.Second}, cache: map[string]cachedUser{}}
}

func (v *supabaseVerifier) verify(ctx context.Context, accessToken string) (supabaseUser, error) {
	key := tokenDigest(accessToken)
	v.mu.Lock()
	if c, ok := v.cache[key]; ok && time.Now().Before(c.expires) {
		v.mu.Unlock()
		return c.user, nil
	}
	v.mu.Unlock()
	user, err := v.fetch(ctx, accessToken)
	if err != nil {
		return supabaseUser{}, err
	}
	v.mu.Lock()
	if len(v.cache) > 2000 { // keep memory bounded
		v.cache = map[string]cachedUser{}
	}
	v.cache[key] = cachedUser{user: user, expires: time.Now().Add(verifyCacheTTL)}
	v.mu.Unlock()
	return user, nil
}

func (v *supabaseVerifier) fetch(ctx context.Context, accessToken string) (supabaseUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.baseURL+"/auth/v1/user", nil)
	if err != nil {
		return supabaseUser{}, err
	}
	req.Header.Set("apikey", v.apiKey)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	res, err := v.client.Do(req)
	if err != nil {
		return supabaseUser{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return supabaseUser{}, errors.New("invalid Supabase access token")
	}
	var user supabaseUser
	if err := json.NewDecoder(res.Body).Decode(&user); err != nil {
		return supabaseUser{}, fmt.Errorf("decode Supabase user: %w", err)
	}
	if user.ID == "" || user.Email == "" {
		return supabaseUser{}, errors.New("Supabase user response is incomplete")
	}
	return user, nil
}
