package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

type Mailer interface {
	Send(ctx context.Context, to, subject, text string) error
}

// logMailer prints messages instead of sending them (local development only).
type logMailer struct{}

func (logMailer) Send(_ context.Context, to, subject, text string) error {
	log.Printf("DEV MAIL to=%s subject=%q\n%s", to, subject, text)
	return nil
}

// brevoMailer sends transactional email through Brevo's HTTPS API.
type brevoMailer struct {
	apiKey, fromEmail, fromName string
	client                      *http.Client
}

func newBrevoMailer(key, fromEmail, fromName string) *brevoMailer {
	return &brevoMailer{apiKey: key, fromEmail: fromEmail, fromName: fromName, client: &http.Client{Timeout: 10 * time.Second}}
}

func (b *brevoMailer) Send(ctx context.Context, to, subject, text string) error {
	return b.SendWithReplyTo(ctx, to, "", subject, text)
}

// SendWithReplyTo sends from the configured sender address; replyTo (when set) is where answers will go.
func (b *brevoMailer) SendWithReplyTo(ctx context.Context, to, replyTo, subject, text string) error {
	payload := map[string]any{
		"sender":      map[string]string{"email": b.fromEmail, "name": b.fromName},
		"to":          []map[string]string{{"email": to}},
		"subject":     subject,
		"textContent": text,
	}
	if replyTo != "" {
		payload["replyTo"] = map[string]string{"email": replyTo}
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.brevo.com/v3/smtp/email", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("api-key", b.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	res, err := b.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return fmt.Errorf("brevo returned HTTP %d", res.StatusCode)
	}
	return nil
}
