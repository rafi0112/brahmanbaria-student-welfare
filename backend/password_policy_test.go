package main

import "testing"

func TestPasswordPolicyMatchesTheForm(t *testing.T) {
	// length is the only rule: anything of 6 to 72 characters passes
	for _, pw := range []string{"123456", "abcdef", "aaaaaa", "password", "Kp7#mQ2vRt", "amar sonar bangla", "নিরাপদ", "nusrat@example.com", "Nusrat Jahan"} {
		if msg := passwordProblem(pw, "nusrat@example.com", "Nusrat Jahan"); msg != "" {
			t.Errorf("%q should pass: %s", pw, msg)
		}
	}
	for _, pw := range []string{"", "a", "12345", "অআই"} {
		if msg := passwordProblem(pw, "", ""); msg == "" {
			t.Errorf("%q is shorter than 6 and must be refused", pw)
		}
	}
	if msg := passwordProblem(string(make([]byte, 73)), "", ""); msg == "" {
		t.Error("more than 72 bytes must be refused, since only the first 72 are used")
	}
}
