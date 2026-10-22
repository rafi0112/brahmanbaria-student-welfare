package main

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

// smtpMailer sends plain-text mail through an SMTP account (for example the Gmail address with an app password that Supabase Auth
// already uses). Port 465 uses implicit TLS, any other port requires STARTTLS. The password never leaves this process.
type smtpMailer struct {
	host, port, user, pass, from, fromName string
	timeout                                time.Duration
}

func newSMTPMailer(host, port, user, pass, from, fromName string) *smtpMailer {
	if port == "" {
		port = "587"
	}
	if from == "" {
		from = user
	}
	return &smtpMailer{host: host, port: port, user: user, pass: pass, from: from, fromName: fromName, timeout: 15 * time.Second}
}

func (m *smtpMailer) Send(ctx context.Context, to, subject, text string) error {
	return m.SendWithReplyTo(ctx, to, "", subject, text)
}

func (m *smtpMailer) SendWithReplyTo(ctx context.Context, to, replyTo, subject, text string) error {
	clean := func(s string) string { return strings.NewReplacer("\r", "", "\n", "").Replace(s) }
	to, replyTo, subject = clean(to), clean(replyTo), clean(subject)
	rcpt, err := mail.ParseAddress(to)
	if err != nil {
		return fmt.Errorf("invalid recipient")
	}
	from := mail.Address{Name: m.fromName, Address: m.from}
	var h strings.Builder
	h.WriteString("From: " + from.String() + "\r\n")
	h.WriteString("To: " + rcpt.String() + "\r\n")
	if ra, err := mail.ParseAddress(replyTo); err == nil && replyTo != "" {
		h.WriteString("Reply-To: " + ra.String() + "\r\n")
	}
	h.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", subject) + "\r\n")
	h.WriteString("Date: " + time.Now().Format(time.RFC1123Z) + "\r\n")
	h.WriteString("MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n")
	enc := base64.StdEncoding.EncodeToString([]byte(strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\n", "\r\n")))
	for len(enc) > 76 {
		h.WriteString(enc[:76] + "\r\n")
		enc = enc[76:]
	}
	h.WriteString(enc + "\r\n")

	d := net.Dialer{Timeout: m.timeout}
	addr := net.JoinHostPort(m.host, m.port)
	var conn net.Conn
	if m.port == "465" {
		conn, err = tls.DialWithDialer(&d, "tcp", addr, &tls.Config{ServerName: m.host, MinVersion: tls.VersionTLS12})
	} else {
		conn, err = d.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("smtp connect: %w", err)
	}
	_ = conn.SetDeadline(time.Now().Add(m.timeout))
	c, err := smtp.NewClient(conn, m.host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("smtp greeting: %w", err)
	}
	defer c.Close()
	if m.port != "465" {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(&tls.Config{ServerName: m.host, MinVersion: tls.VersionTLS12}); err != nil {
				return fmt.Errorf("smtp starttls: %w", err)
			}
		} else if m.user != "" {
			return fmt.Errorf("smtp server offers no STARTTLS; refusing to send the password in clear text")
		}
	}
	if m.user != "" {
		if err := c.Auth(smtp.PlainAuth("", m.user, m.pass, m.host)); err != nil {
			return fmt.Errorf("smtp login refused") // never include the server text, it can echo the account
		}
	}
	if err := c.Mail(m.from); err != nil {
		return fmt.Errorf("smtp sender: %w", err)
	}
	if err := c.Rcpt(rcpt.Address); err != nil {
		return fmt.Errorf("smtp recipient: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write([]byte(h.String())); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp send: %w", err)
	}
	return c.Quit()
}
