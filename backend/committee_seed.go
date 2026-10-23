package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

// seed-committee creates one committee and its seats from a JSON file (see data/committee-2026-2027.json), through the
// same store methods and validation the admin panel uses, so every seat is audited and can be edited, reordered, given a
// photo or removed in the admin panel afterwards. Without --apply it only prints what it would do. --publish publishes the
// new committee (which archives the one published before, exactly like the Publish button). It refuses to create a
// committee whose name already exists, so running it twice cannot duplicate anything.
type committeeSeed struct {
	Name        string `json:"name"`
	Term        string `json:"term"`
	Description string `json:"description"`
	StartsOn    string `json:"startsOn"`
	EndsOn      string `json:"endsOn"`
	Members     []struct {
		Name        string `json:"name"`
		Designation string `json:"designation"`
		Bio         string `json:"bio"`
	} `json:"members"`
}

func seedCommittee(s AuthStore, args []string) error {
	if s == nil {
		return fmt.Errorf("DATABASE_URL is not set")
	}
	file, apply, publish := "data/committee-2026-2027.json", false, false
	for _, a := range args {
		switch {
		case a == "--apply":
			apply = true
		case a == "--publish":
			publish = true
		case strings.HasPrefix(a, "--file="):
			file = strings.TrimPrefix(a, "--file=")
		default:
			return fmt.Errorf("unknown flag %q", a)
		}
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	var in committeeSeed
	if err := json.Unmarshal(raw, &in); err != nil {
		return fmt.Errorf("%s: %w", file, err)
	}
	ci := CommitteeInput{Name: in.Name, Term: in.Term, Description: in.Description, StartsOn: in.StartsOn, EndsOn: in.EndsOn}
	if errs := ci.clean(); len(errs) > 0 {
		return fmt.Errorf("committee: %v", errs)
	}
	seats := make([]ExecutiveInput, 0, len(in.Members))
	for i, m := range in.Members {
		order := i
		x := ExecutiveInput{Name: m.Name, Designation: m.Designation, Bio: m.Bio, Order: &order}
		if errs := x.clean(); len(errs) > 0 {
			return fmt.Errorf("member %d (%s): %v", i+1, m.Name, errs)
		}
		seats = append(seats, x)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	existing, err := s.ListCommittees(ctx)
	if err != nil {
		return err
	}
	for _, c := range existing {
		if strings.TrimSpace(c.Name) == ci.Name {
			return fmt.Errorf("a committee named %q already exists (status %s); nothing was changed", c.Name, c.Status)
		}
	}
	fmt.Printf("committee %q (%s), %d seats\n", ci.Name, ci.Term, len(seats))
	for i, x := range seats {
		fmt.Printf("  %2d. %s — %s\n", i+1, x.Name, x.Designation)
	}
	if !apply {
		fmt.Println("preview only: run again with --apply (and --publish to show it on the site)")
		return nil
	}
	c, err := s.CreateCommittee(ctx, "", ci)
	if err != nil {
		return err
	}
	for _, x := range seats {
		if _, err := s.AddExecutive(ctx, "", c.ID, x); err != nil {
			return fmt.Errorf("adding %s: %w (the committee %s stays as a draft)", x.Name, err, c.ID)
		}
	}
	fmt.Printf("created committee %s as a draft with %d seats\n", c.ID, len(seats))
	if publish {
		if _, err := s.SetCommitteeStatus(ctx, "", c.ID, "publish"); err != nil {
			return err
		}
		fmt.Println("published")
	}
	return nil
}
