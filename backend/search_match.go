package main

import "strings"

// Search on the Students and Alumni pages. Everyone can search by name (and department, workplace); a signed-in member
// or admin can also search by blood group, phone and email, but only among the details this viewer may see, so a
// search can never reveal what a card would not show.

var bloodGroups = map[string]bool{"A+": true, "A-": true, "B+": true, "B-": true, "AB+": true, "AB-": true, "O+": true, "O-": true}

// normBlood reads a blood group written in the usual ways ("b+", "B +", "B positive", "O-ve", "বি পজিটিভ", "ও নেগেটিভ")
// and returns it as "B+", or "" when it is not one.
func normBlood(s string) string {
	s = strings.ToUpper(strings.Join(strings.Fields(s), ""))
	s = strings.NewReplacer(
		"পজিটিভ", "+", "পজেটিভ", "+", "নেগেটিভ", "-", "নেগেটিব", "-",
		"POSITIVE", "+", "NEGATIVE", "-", "(+)", "+", "(-)", "-", "+VE", "+", "-VE", "-", "POS", "+", "NEG", "-",
		"−", "-", "–", "-",
	).Replace(s)
	for bn, en := range map[string]string{"এবি": "AB", "বি": "B", "এ": "A", "ও": "O"} {
		if strings.HasPrefix(s, bn) {
			s = en + strings.TrimPrefix(s, bn)
			break
		}
	}
	if bloodGroups[s] {
		return s
	}
	return ""
}

// digits keeps the digits of a phone number, Bengali digits included, so "01712-345 678" and "০১৭১২৩৪৫৬৭৮" compare.
func digits(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r >= '০' && r <= '৯':
			b.WriteRune('0' + (r - '০'))
		}
	}
	return b.String()
}

// searchHit says whether a typed search matches a person. names are always searched; phone, email and blood are what
// this viewer may see of the person ("" otherwise). A blood group search matches that group exactly ("A+" is not "AB+").
func searchHit(q string, names []string, phone, email, blood string) bool {
	q = strings.TrimSpace(q)
	if q == "" {
		return true
	}
	if bg := normBlood(q); bg != "" {
		return normBlood(blood) == bg
	}
	for _, s := range names {
		if contains(s, q) {
			return true
		}
	}
	if d := digits(q); len(d) >= 4 && len(d)*2 >= len([]rune(strings.ReplaceAll(q, " ", ""))) && strings.Contains(digits(phone), d) {
		return true
	}
	return email != "" && len(q) >= 3 && contains(email, q)
}
