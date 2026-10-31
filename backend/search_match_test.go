package main

import (
	"strings"
	"testing"
)

func TestNormBlood(t *testing.T) {
	for in, want := range map[string]string{"b+": "B+", "B +": "B+", "b positive": "B+", "O-ve": "O-", "ab neg": "AB-", "বি পজিটিভ": "B+", "ও নেগেটিভ": "O-",
		"এবি+": "AB+", "Rahim": "", "B": "", "": ""} {
		if got := normBlood(in); got != want {
			t.Errorf("normBlood(%q) = %q, want %q", in, got, want)
		}
	}
	if digits("০১৭১২-৩৪৫ 678") != "01712345678" {
		t.Fatal("digits keeps Bengali and Latin digits")
	}
}

// Blood group, phone and email searches work only for viewers who may see those details; names work for everyone.
func TestSearchByBloodPhoneAndName(t *testing.T) {
	e := cmsApp(t)
	for _, al := range []map[string]any{
		{"name": "Karim Alumnus", "batch": 9, "private": map[string]string{"phone": "01711111111", "email": "karim@example.org", "bloodGroup": "B+"}},
		{"name": "Salma Alumnus", "batch": 9, "private": map[string]string{"phone": "01822222222", "bloodGroup": "AB+"}},
		{"name": "Nadia Alumnus", "batch": 9, "private": map[string]string{"bloodGroup": "A+"}},
	} {
		if rec := adminJSON(e, "POST", "/api/v1/admin/alumni", al); rec.Code != 201 {
			t.Fatalf("create: %d %s", rec.Code, rec.Body)
		}
	}
	names := func(path string, auth ...string) string {
		var tok []string
		if len(auth) > 0 {
			tok = bearer(auth[0])
		}
		var res struct{ Items []alumnusView }
		decodeBody(t, e.do("GET", path, nil, nil, tok...), &res)
		out := []string{}
		for _, it := range res.Items {
			out = append(out, it.Name)
		}
		return strings.Join(out, ",")
	}
	if got := names("/api/v1/alumni?q=B%2B"); got != "" {
		t.Fatalf("the public cannot search by blood group: %q", got)
	}
	if got := names("/api/v1/alumni?q=01711"); got != "" {
		t.Fatalf("the public cannot search by phone: %q", got)
	}
	if got := names("/api/v1/alumni?q=Karim"); got != "Karim Alumnus" {
		t.Fatalf("names are searchable by everyone: %q", got)
	}
	approvedMember(t, e, "member-token", idMember, "Member One")
	if got := names("/api/v1/alumni?q=b+positive", "member-token"); got != "Karim Alumnus" {
		t.Fatalf("a member finds B+ only: %q", got)
	}
	if got := names("/api/v1/alumni?q=A%2B", "member-token"); got != "Nadia Alumnus" {
		t.Fatalf("A+ is not AB+: %q", got)
	}
	if got := names("/api/v1/alumni?q=01822-222", "member-token"); got != "Salma Alumnus" {
		t.Fatalf("a member finds by phone: %q", got)
	}
	if got := names("/api/v1/alumni?q=karim%40example", "member-token"); got != "Karim Alumnus" {
		t.Fatalf("a member finds by email: %q", got)
	}
}
