package main

import (
	"bufio"
	"context"
	"net"
	"strings"
	"testing"
)

// fakeSMTP is a minimal server that records one message; it offers no TLS or AUTH.
func fakeSMTP(t *testing.T) (port string, got chan string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	got = make(chan string, 1)
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		r := bufio.NewReader(c)
		w := func(s string) { c.Write([]byte(s + "\r\n")) }
		w("220 fake")
		var data strings.Builder
		inData := false
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			if inData {
				if line == ".\r\n" {
					inData = false
					got <- data.String()
					w("250 ok")
					continue
				}
				data.WriteString(line)
				continue
			}
			up := strings.ToUpper(line)
			switch {
			case strings.HasPrefix(up, "EHLO"), strings.HasPrefix(up, "HELO"):
				w("250 fake")
			case strings.HasPrefix(up, "MAIL"), strings.HasPrefix(up, "RCPT"):
				data.WriteString(strings.TrimSpace(line) + "\n")
				w("250 ok")
			case strings.HasPrefix(up, "DATA"):
				inData = true
				w("354 go")
			case strings.HasPrefix(up, "QUIT"):
				w("221 bye")
				return
			default:
				w("250 ok")
			}
		}
	}()
	_, port, _ = net.SplitHostPort(ln.Addr().String())
	return
}

func TestSMTPMailerDeliversWithReplyToAndSafeHeaders(t *testing.T) {
	port, got := fakeSMTP(t)
	m := newSMTPMailer("127.0.0.1", port, "", "", "site@example.org", "BSWA")
	err := m.SendWithReplyTo(context.Background(), "admin@example.org", "visitor@example.com", "[Contact] Hello\r\nBcc: evil@example.com", "Line one\nLine two")
	if err != nil {
		t.Fatal(err)
	}
	msg := <-got
	for _, want := range []string{"MAIL FROM:<site@example.org>", "RCPT TO:<admin@example.org>", "Reply-To: <visitor@example.com>", "From: \"BSWA\" <site@example.org>"} {
		if !strings.Contains(msg, want) {
			t.Fatalf("missing %q in:\n%s", want, msg)
		}
	}
	if strings.Contains(msg, "\nBcc:") || strings.Contains(msg, "\r\nBcc:") {
		t.Fatalf("header injection:\n%s", msg)
	}
	if err := m.Send(context.Background(), "not an address", "s", "b"); err == nil {
		t.Fatal("an invalid recipient must be refused")
	}
}

func TestSMTPMailerRefusesToSendAPasswordInClearText(t *testing.T) {
	port, _ := fakeSMTP(t)
	m := newSMTPMailer("127.0.0.1", port, "user@example.org", "secret", "", "BSWA")
	if err := m.Send(context.Background(), "admin@example.org", "s", "b"); err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatalf("expected a refusal that does not leak the password: %v", err)
	}
}

func TestContactRecipientFallsBackToTheSMTPAccount(t *testing.T) {
	a := &App{}
	t.Setenv("CONTACT_RECIPIENT_EMAIL", "")
	t.Setenv("SMTP_HOST", "smtp.gmail.com")
	t.Setenv("SMTP_USER", "club@gmail.com")
	if a.contactRecipient() != "club@gmail.com" {
		t.Fatal("the SMTP account must be the default recipient")
	}
	t.Setenv("CONTACT_RECIPIENT_EMAIL", "office@example.org")
	if a.contactRecipient() != "office@example.org" {
		t.Fatal("an explicit recipient wins")
	}
}
