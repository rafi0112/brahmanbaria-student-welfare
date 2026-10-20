package main

import (
	"net/url"
	"testing"
)

func TestNormalizeDatabaseURL(t *testing.T) {
	good := "postgresql://postgres.abc:simplepass@aws-0-x.pooler.supabase.com:6543/postgres"
	if got := normalizeDatabaseURL(good); got != good {
		t.Fatalf("valid URL changed: %s", got)
	}
	for _, pw := range []string{"p@ss:word/with#chars", "abc:m8R@xyz", "plain%40already"} {
		raw := "postgresql://postgres.abc:" + pw + "@aws-0-x.pooler.supabase.com:5432/postgres?sslmode=require"
		got := normalizeDatabaseURL(raw)
		u, err := url.Parse(got)
		if err != nil {
			t.Fatalf("%q did not normalise: %v", pw, err)
		}
		if u.Hostname() != "aws-0-x.pooler.supabase.com" || u.Port() != "5432" || u.User.Username() != "postgres.abc" || u.Path != "/postgres" || u.RawQuery != "sslmode=require" {
			t.Fatalf("%q parsed wrongly: %s", pw, got)
		}
	}
	if got := normalizeDatabaseURL("not a url"); got != "not a url" {
		t.Fatal("garbage should pass through")
	}
}
