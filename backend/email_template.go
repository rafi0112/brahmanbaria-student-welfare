package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// apply-email-template publishes docs/email-templates/invite.html as the "Invite user" email of the Supabase project, using the
// Supabase Management API. The Auth admin keys cannot do this: changing email templates needs a personal access token
// (SUPABASE_ACCESS_TOKEN, created at supabase.com/dashboard/account/tokens). Without --apply it only compares and reports.
// The token stays in this process: it is never printed or logged.

const defaultInviteSubject = "Activate your BSWA account"

func projectRef(supabaseURL string) string {
	u, err := url.Parse(strings.TrimSpace(supabaseURL))
	if err != nil {
		return ""
	}
	host := u.Hostname()
	if i := strings.Index(host, "."); i > 0 && strings.HasSuffix(host, ".supabase.co") {
		return host[:i]
	}
	return ""
}

func short(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:])[:10] }

type mgmt struct {
	base, token string
	client      *http.Client
}

func (m *mgmt) do(ctx context.Context, method, path string, body any) ([]byte, int, error) {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, m.base+path, rd)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+m.token)
	req.Header.Set("Content-Type", "application/json")
	res, err := m.client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("could not reach the Supabase Management API")
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	return b, res.StatusCode, nil
}

// applyInviteTemplate returns a human-readable report. With apply=false nothing is changed.
func applyInviteTemplate(ctx context.Context, m *mgmt, ref, html, subject string, apply bool) (string, error) {
	b, code, err := m.do(ctx, http.MethodGet, "/v1/projects/"+ref+"/config/auth", nil)
	if err != nil {
		return "", err
	}
	switch code {
	case http.StatusUnauthorized, http.StatusForbidden:
		return "", fmt.Errorf("the access token was refused (HTTP %d): create a personal access token at supabase.com/dashboard/account/tokens and put it in SUPABASE_ACCESS_TOKEN", code)
	case http.StatusNotFound:
		return "", fmt.Errorf("project %q was not found for this token", ref)
	}
	if code != http.StatusOK {
		return "", fmt.Errorf("the Management API answered HTTP %d", code)
	}
	var cur struct {
		Subject string `json:"mailer_subjects_invite"`
		Content string `json:"mailer_templates_invite_content"`
	}
	_ = json.Unmarshal(b, &cur)
	same := cur.Content == html && cur.Subject == subject
	report := fmt.Sprintf("project %s\ncurrent invite subject: %q\ncurrent template: %d bytes (fingerprint %s)\nnew template:     %d bytes (fingerprint %s)\nnew subject: %q\n",
		ref, cur.Subject, len(cur.Content), short(cur.Content), len(html), short(html), subject)
	if same {
		return report + "already up to date; nothing to do\n", nil
	}
	if !apply {
		return report + "different: run again with --apply to publish it\n", nil
	}
	_, code, err = m.do(ctx, http.MethodPatch, "/v1/projects/"+ref+"/config/auth", map[string]string{"mailer_subjects_invite": subject, "mailer_templates_invite_content": html})
	if err != nil {
		return "", err
	}
	if code < 200 || code >= 300 {
		return "", fmt.Errorf("the Management API refused the change (HTTP %d)", code)
	}
	return report + "published: the Invite user email now uses the new template\n", nil
}

func runApplyEmailTemplate(args []string) error {
	apply := false
	path := "../docs/email-templates/invite.html"
	for _, a := range args {
		switch {
		case a == "--apply":
			apply = true
		case strings.HasPrefix(a, "--file="):
			path = strings.TrimPrefix(a, "--file=")
		}
	}
	token := strings.TrimSpace(os.Getenv("SUPABASE_ACCESS_TOKEN"))
	if token == "" {
		return fmt.Errorf("SUPABASE_ACCESS_TOKEN is not set. Create a personal access token at supabase.com/dashboard/account/tokens and add it to backend/.env (server side only). Alternatively paste docs/email-templates/invite.html into Authentication > Email Templates > Invite user by hand")
	}
	ref := projectRef(os.Getenv("SUPABASE_URL"))
	if ref == "" {
		return fmt.Errorf("could not read the project reference from SUPABASE_URL")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("cannot read the template: %v", err)
	}
	html := string(raw)
	if !strings.Contains(html, "{{ .ConfirmationURL }}") {
		return fmt.Errorf("the template does not contain {{ .ConfirmationURL }}; refusing to publish an invitation without its link")
	}
	// the leading comment is documentation for people; the published email starts at the doctype
	if i := strings.Index(html, "<!DOCTYPE html>"); i > 0 {
		html = html[i:]
	}
	base := os.Getenv("SUPABASE_MANAGEMENT_URL")
	if base == "" {
		base = "https://api.supabase.com"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	report, err := applyInviteTemplate(ctx, &mgmt{base: strings.TrimRight(base, "/"), token: token, client: &http.Client{Timeout: 25 * time.Second}}, ref, html, defaultInviteSubject, apply)
	if err != nil {
		return err
	}
	fmt.Print(report)
	return nil
}
