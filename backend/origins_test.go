package main

import (
	"net/http/httptest"
	"testing"
)

// CORS_ORIGIN may list several sites (the Cloudflare site and a WordPress copy); each gets its own answer, others do not.
func TestSeveralAllowedOrigins(t *testing.T) {
	e := authApp(t)
	e.app.Origin = "https://bswa.pages.dev, https://bswa-wp.example.org/"
	for _, c := range []struct{ from, want string }{
		{"https://bswa.pages.dev", "https://bswa.pages.dev"},
		{"https://bswa-wp.example.org", "https://bswa-wp.example.org"},
		{"https://evil.example", "https://bswa.pages.dev"},
	} {
		rec := e.do("GET", "/api/v1/health", nil, nil, "Origin", c.from)
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != c.want {
			t.Errorf("from %s: got %q want %q", c.from, got, c.want)
		}
	}
	// state-changing requests from an unlisted site are refused; a listed one passes the guard
	if rec := e.do("POST", "/api/v1/contact", goodContact, nil, "Origin", "https://evil.example"); rec.Code != 403 {
		t.Fatalf("unlisted: %d", rec.Code)
	}
	if rec := e.do("POST", "/api/v1/contact", goodContact, nil, "Origin", "https://bswa-wp.example.org"); rec.Code != 201 {
		t.Fatalf("listed: %d %s", rec.Code, rec.Body)
	}
	_ = httptest.NewRecorder
}
