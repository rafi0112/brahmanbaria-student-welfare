package main

import "unicode/utf8"

// The rule for a new password, the same as the sign-up form shows (frontend/src/lib/password.js): 4 to 72 characters,
// nothing else. The association asked for no other restriction. Supabase applies its own project minimum as well
// (Authentication > Sign In / Providers > Email > Minimum password length), which must be set to 4 there to match.
const (
	minPasswordLen = 4
	maxPasswordLen = 72 // bcrypt and Supabase use only the first 72 bytes
)

// passwordProblem returns why a new password is not acceptable, or "" when it is. email and name are not looked at.
func passwordProblem(pw, email, name string) string {
	if n := utf8.RuneCountInString(pw); n < minPasswordLen || len(pw) > maxPasswordLen {
		return "Use 4 to 72 characters."
	}
	return ""
}
