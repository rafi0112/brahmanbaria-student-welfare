package main

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// The rules for a new password, the same as the sign-up form shows (frontend/src/lib/password.js): 10 to 72 characters,
// a lowercase and an uppercase letter, a number and a symbol, nothing from the person's name or email, and nothing built
// on a common word, a run like 1234 or a repeated character.
const (
	minPasswordLen = 10
	maxPasswordLen = 72 // bcrypt and Supabase use only the first 72 bytes
)

var commonPasswordParts = []string{"password", "passw0rd", "qwerty", "letmein", "welcome", "admin", "iloveyou", "monkey", "dragon",
	"football", "bangladesh", "dhaka", "brahmanbaria", "bswa", "jagannath", "jnu", "student", "abc123", "123456", "111111", "000000"}

var passwordSequences = []string{"abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiopasdfghjklzxcvbnm"}

func reverseString(s string) string {
	r := []rune(s)
	for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
		r[i], r[j] = r[j], r[i]
	}
	return string(r)
}

// passwordProblem returns why a new password is not acceptable, or "" when it is.
func passwordProblem(pw, email, name string) string {
	n := utf8.RuneCountInString(pw)
	if n < minPasswordLen || len(pw) > maxPasswordLen {
		return "Use 10 to 72 characters."
	}
	var lower, upper, digit, symbol bool
	for _, c := range pw {
		switch {
		case unicode.IsLower(c):
			lower = true
		case unicode.IsUpper(c):
			upper = true
		case unicode.IsDigit(c):
			digit = true
		case !unicode.IsSpace(c):
			symbol = true
		}
	}
	if !lower || !upper || !digit || !symbol {
		return "Use a lowercase and an uppercase letter, a number and a symbol."
	}
	l := strings.ToLower(pw)
	local := strings.ToLower(strings.SplitN(email, "@", 2)[0])
	words := append(strings.Fields(strings.ToLower(name)), local)
	words = append(words, strings.FieldsFunc(local, func(c rune) bool { return c == '.' || c == '_' || c == '-' || c == '+' || unicode.IsDigit(c) })...)
	for _, w := range words {
		if utf8.RuneCountInString(w) >= 3 && strings.Contains(l, w) {
			return "Do not use your name or email in the password."
		}
	}
	for _, w := range commonPasswordParts {
		if strings.Contains(l, w) {
			return "This password is too easy to guess."
		}
	}
	for _, seq := range passwordSequences {
		for i := 0; i+4 <= len(seq); i++ {
			if p := seq[i : i+4]; strings.Contains(l, p) || strings.Contains(l, reverseString(p)) {
				return "This password is too easy to guess."
			}
		}
	}
	r := []rune(pw)
	for i := 2; i < len(r); i++ {
		if r[i] == r[i-1] && r[i] == r[i-2] {
			return "This password is too easy to guess."
		}
	}
	return ""
}
