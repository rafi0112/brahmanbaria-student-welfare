package main

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testApp(t *testing.T) *App {
	t.Helper()
	s, err := loadStore("data")
	if err != nil {
		t.Fatal(err)
	}
	return &App{Store: s, Origin: "*", ContactLog: filepath.Join(t.TempDir(), "c.jsonl"), Limiter: newLimiter(2, time.Hour)}
}

func get(t *testing.T, a *App, url string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	a.Routes().ServeHTTP(rec, httptest.NewRequest("GET", url, nil))
	var v map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &v)
	return rec.Code, v
}

func TestStudentsPaginationAndFilter(t *testing.T) {
	a := testApp(t)
	code, v := get(t, a, "/api/v1/students?limit=5&page=1")
	if code != 200 || len(v["items"].([]any)) > 5 {
		t.Fatalf("bad page: %d", code)
	}
	total := int(v["total"].(float64))
	_, f := get(t, a, "/api/v1/students?q=zzzzzz-nothing")
	if int(f["total"].(float64)) != 0 || total == 0 {
		t.Fatal("filter or total wrong")
	}
	_, big := get(t, a, "/api/v1/students?limit=100000")
	if len(big["items"].([]any)) > 12 {
		t.Fatal("limit above max must fall back to default")
	}
}

func TestStudentsHidePrivateFields(t *testing.T) {
	a := testApp(t)
	rec := httptest.NewRecorder()
	a.Routes().ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/students?limit=48", nil))
	body := strings.ToLower(rec.Body.String())
	for _, bad := range []string{"phone", "mobile", "email", "facebook", "address"} {
		if strings.Contains(body, bad) {
			t.Fatalf("response leaks %q", bad)
		}
	}
}

func TestUpazilaDetail(t *testing.T) {
	a := testApp(t)
	if code, _ := get(t, a, "/api/v1/upazilas/sarail"); code != 200 {
		t.Fatal("sarail missing")
	}
	if code, _ := get(t, a, "/api/v1/upazilas/nowhere"); code != 404 {
		t.Fatal("expected 404")
	}
	_, v := get(t, a, "/api/v1/upazilas")
	if len(v["items"].([]any)) != 9 {
		t.Fatal("expected 9 upazilas")
	}
}

func TestContactValidationHoneypotAndLimit(t *testing.T) {
	a := testApp(t)
	post := func(body string) int {
		req := httptest.NewRequest("POST", "/api/v1/contact", strings.NewReader(body))
		req.RemoteAddr = "1.2.3.4:5555"
		rec := httptest.NewRecorder()
		a.Routes().ServeHTTP(rec, req)
		return rec.Code
	}
	if c := post(`{"name":"A","email":"bad","subject":"x","message":"short"}`); c != 422 {
		t.Fatalf("want 422 got %d", c)
	}
	good := `{"name":"Nusrat","email":"n@example.com","subject":"Hello","message":"This is a valid message."}`
	if c := post(good); c != 201 {
		t.Fatalf("want 201 got %d", c)
	}
	if c := post(`{"website":"spam.example","name":"x"}`); c != 202 {
		t.Fatalf("honeypot want 202 got %d", c)
	}
	_ = post(good)
	if c := post(good); c != 429 {
		t.Fatalf("want 429 got %d", c)
	}
}
