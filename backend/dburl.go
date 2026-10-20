package main

import (
	"net/url"
	"regexp"
)

var dbURLRx = regexp.MustCompile(`^(postgres(?:ql)?)://([^:/@]+):(.*)@([^@/]+)(/[^?]*)?(\?.*)?$`)

// normalizeDatabaseURL accepts a connection string whose password contains characters such as
// "@", ":" or "/" that should have been percent-encoded, and rebuilds it so drivers can parse it.
// Valid URLs are returned unchanged.
func normalizeDatabaseURL(raw string) string {
	if u, err := url.Parse(raw); err == nil && u.Host != "" && u.Port() != "" || err == nil && u.Hostname() != "" && u.User != nil && !hasStrayAt(raw) {
		return raw
	}
	m := dbURLRx.FindStringSubmatch(raw)
	if m == nil {
		return raw
	}
	pw := m[3]
	if dec, err := url.PathUnescape(pw); err == nil {
		pw = dec // already partly encoded: decode first so it is not double-encoded
	}
	out := url.URL{Scheme: m[1], User: url.UserPassword(m[2], pw), Host: m[4], Path: m[5]}
	if m[6] != "" {
		out.RawQuery = m[6][1:]
	}
	return out.String()
}

// hasStrayAt reports whether the part after the scheme contains more than one "@", which url.Parse
// would silently misread.
func hasStrayAt(raw string) bool {
	n := 0
	for _, c := range raw {
		if c == '@' {
			n++
		}
	}
	return n > 1
}
