package main

import "testing"

func TestPasswordPolicyMatchesTheForm(t *testing.T) {
	ok := []string{"Kp7#mQ2vRt", "Xq9#mvTz!Lp4", "Correct#Horse91"}
	for _, pw := range ok {
		if msg := passwordProblem(pw, "nusrat@example.com", "Nusrat Jahan"); msg != "" {
			t.Errorf("%q should pass: %s", pw, msg)
		}
	}
	bad := map[string]string{
		"Kp7#mQ2v":       "length",
		"kp7#mq2vrtx":    "no uppercase",
		"Kp7mQ2vRtxy":    "no symbol",
		"Password#2024":  "common word",
		"Xy#1234zQwv":    "sequence",
		"Xy#aaa9zQwvK":   "repeat",
		"Nusrat#Strong9": "own name",
		"Xq9#example!Lp": "fine: example is the domain, not the local part",
	}
	for pw, why := range bad {
		msg := passwordProblem(pw, "nusrat@example.com", "Nusrat Jahan")
		if why == "fine: example is the domain, not the local part" {
			if msg != "" {
				t.Errorf("%q: %s", pw, msg)
			}
			continue
		}
		if msg == "" {
			t.Errorf("%q should fail (%s)", pw, why)
		}
	}
}
