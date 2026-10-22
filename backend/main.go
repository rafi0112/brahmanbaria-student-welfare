package main

import (
	"bufio"
	"context"
	_ "embed"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	loadDotEnv(".env")
	dataDir := env("DATA_DIR", "data")
	store, err := loadStore(dataDir)
	if err != nil {
		log.Fatalf("load data: %v", err)
	}
	app := &App{
		Store:      store,
		Origin:     env("CORS_ORIGIN", "http://localhost:5173"),
		ContactLog: env("CONTACT_LOG", dataDir+"/contact_messages.jsonl"),
		Limiter:    newLimiter(5, time.Hour),
	}

	authStore, closeAuth := openAuthStore()
	defer closeAuth()
	if len(os.Args) > 1 && os.Args[1] == "bootstrap-admin" {
		if err := bootstrapAdmins(authStore, os.Args[2:]); err != nil {
			log.Fatalf("bootstrap-admin: %v", err)
		}
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "storage-setup" {
		if err := storageSetup(authStore); err != nil {
			log.Fatalf("storage-setup: %v", err)
		}
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "purge-contact" { // for cron: removes contact messages older than 30 days
		if authStore == nil {
			log.Fatal("purge-contact: DATABASE_URL is not set")
		}
		n, err := authStore.PurgeExpiredContacts(context.Background())
		if err != nil {
			log.Fatalf("purge-contact: %v", err)
		}
		log.Printf("purge-contact: removed %d expired messages", n)
		return
	}
	if pg, ok := authStore.(*pgStore); ok {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		dbStore, contentErr := pg.Content(ctx, store)
		cancel()
		if contentErr != nil {
			log.Fatalf("load PostgreSQL content: %v", contentErr)
		}
		store = dbStore
	}

	if len(os.Args) > 1 && os.Args[1] == "create-admin" {
		if err := createAdmin(authStore); err != nil {
			log.Fatalf("create-admin: %v", err)
		}
		return
	}
	if authStore != nil {
		seedCtx, seedCancel := context.WithTimeout(context.Background(), 60*time.Second)
		if err := seedLegacyContent(seedCtx, authStore, store); err != nil {
			log.Fatalf("seed content: %v", err)
		}
		seedCancel()
		app.Auth = newAuth(authStore, openMailer(), env("FRONTEND_URL", "http://localhost:5173"),
			env("COOKIE_SECURE", "false") == "true", sameSite(env("COOKIE_SAMESITE", "lax")))
		go purgeContactLoop(context.Background(), authStore)
		if adm := newSupabaseAdmin(env("SUPABASE_URL", ""), os.Getenv("SUPABASE_SERVICE_ROLE_KEY")); adm != nil {
			app.Auth.Inviter = adm
		} else {
			log.Printf("member invitations disabled: set SUPABASE_SERVICE_ROLE_KEY in backend/.env (server side only)")
		}
		app.Auth.Verifier = newSupabaseVerifier(env("SUPABASE_URL", ""), env("SUPABASE_PUBLISHABLE_KEY", ""))
		if st := newSupabaseStorage(env("SUPABASE_URL", ""), env("SUPABASE_PUBLISHABLE_KEY", "")); st != nil {
			app.Auth.Images, app.Auth.PhotoBase, app.Auth.MediaBase = st, st.PublicBase(photoBucket), st.PublicBase(mediaBucket)
		}
		if app.Auth.Verifier == nil {
			log.Printf("Supabase bearer auth disabled: configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY")
		}
	} else {
		log.Printf("auth disabled: set DATABASE_URL (or AUTH_DEV_MEMORY=true for local testing)")
	}

	srv := &http.Server{
		Addr:              ":" + env("PORT", "8080"),
		Handler:           app.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	go func() {
		log.Printf("api listening on %s (sample student data: %v, auth: %v)", srv.Addr, store.Sample, app.Auth != nil)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

// openAuthStore picks Postgres when DATABASE_URL is set, an in-memory store only when explicitly asked.
func openAuthStore() (AuthStore, func()) {
	if url := os.Getenv("DATABASE_URL"); url != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		pg, err := openPostgres(ctx, url)
		if err != nil {
			log.Fatalf("database: %v", err)
		}
		log.Printf("connected to Postgres, migrations applied")
		return pg, pg.Close
	}
	if env("AUTH_DEV_MEMORY", "false") == "true" {
		if env("APP_ENV", "development") == "production" {
			log.Fatal("AUTH_DEV_MEMORY must not be used with APP_ENV=production")
		}
		log.Printf("WARNING: in-memory auth store, accounts are lost on restart")
		mem := newMemStore()
		if os.Getenv("ADMIN_EMAIL") != "" && os.Getenv("ADMIN_PASSWORD") != "" {
			if err := createAdmin(mem); err != nil {
				log.Fatalf("dev admin: %v", err)
			}
		}
		return mem, func() {}
	}
	return nil, func() {}
}

func openMailer() Mailer {
	key := os.Getenv("BREVO_API_KEY")
	if key == "" {
		if env("APP_ENV", "development") == "production" {
			log.Fatal("BREVO_API_KEY is required when APP_ENV=production")
		}
		log.Printf("no BREVO_API_KEY: emails are printed to this log (development only)")
		return logMailer{}
	}
	from := os.Getenv("MAIL_FROM")
	if from == "" {
		log.Fatal("MAIL_FROM is required with BREVO_API_KEY")
	}
	return newBrevoMailer(key, from, env("MAIL_FROM_NAME", "BSWA"))
}

func parseEmailSet(v string) map[string]bool {
	out := map[string]bool{}
	for _, e := range strings.Split(v, ",") {
		if e = normEmail(e); e != "" {
			out[e] = true
		}
	}
	return out
}

func sameSite(v string) http.SameSite {
	switch strings.ToLower(v) {
	case "none":
		return http.SameSiteNoneMode
	case "strict":
		return http.SameSiteStrictMode
	}
	return http.SameSiteLaxMode
}

// createAdmin makes the first admin: `ADMIN_EMAIL=... ADMIN_PASSWORD=... go run . create-admin`.
// The password comes from the environment so it never lands in shell history or source.
func createAdmin(s AuthStore) error {
	if s == nil {
		return fmt.Errorf("DATABASE_URL is not set")
	}
	email, pw := normEmail(os.Getenv("ADMIN_EMAIL")), os.Getenv("ADMIN_PASSWORD")
	if !emailRx.MatchString(email) {
		return fmt.Errorf("set ADMIN_EMAIL to a valid address")
	}
	if len(pw) < 12 {
		return fmt.Errorf("ADMIN_PASSWORD must be at least 12 characters")
	}
	hash, err := hashPassword(pw)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if _, err := s.CreateUser(ctx, NewUser{Email: email, PasswordHash: hash, Role: RoleAdmin, Verified: true}); err != nil {
		return err
	}
	fmt.Println("admin created:", email)
	return nil
}

// loadDotEnv reads KEY=VALUE lines from a local .env file without overriding real environment variables.
// JK_NO_DOTENV=1 skips it entirely, so an isolated test server can never pick up real database or Supabase settings.
func loadDotEnv(path string) {
	if os.Getenv("JK_NO_DOTENV") == "1" {
		return
	}
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k, v = strings.TrimSpace(k), strings.Trim(strings.TrimSpace(v), `"'`)
		if os.Getenv(k) == "" {
			os.Setenv(k, v)
		}
	}
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// bootstrapAdmins promotes the confirmed Supabase accounts listed in ADMIN_EMAILS to database admins.
// Run it yourself after registering and confirming your email:
//
//	go run . bootstrap-admin           (preview, changes nothing)
//	go run . bootstrap-admin --apply   (does it)
//
// It only ever adds admins, is safe to repeat, and refuses unknown or unconfirmed accounts.
func bootstrapAdmins(s AuthStore, args []string) error {
	if s == nil {
		return fmt.Errorf("DATABASE_URL is not set")
	}
	apply := false
	for _, a := range args {
		switch a {
		case "--apply":
			apply = true
		default:
			return fmt.Errorf("unknown argument %q (use --apply to make the change)", a)
		}
	}
	emails := parseEmailSet(os.Getenv("ADMIN_EMAILS"))
	if len(emails) == 0 {
		return fmt.Errorf("ADMIN_EMAILS is empty: add the email of your own account to backend/.env")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	ok, failed := 0, 0
	for email := range emails {
		_, changed, err := s.PromoteVerifiedByEmail(ctx, email, apply)
		switch {
		case err == ErrNotFound:
			failed++
			fmt.Printf("  %-32s NOT FOUND: register on the site first\n", email)
		case err == ErrTargetUnverified:
			failed++
			fmt.Printf("  %-32s NOT CONFIRMED: open the confirmation email first\n", email)
		case err != nil:
			return err
		case !changed:
			ok++
			fmt.Printf("  %-32s already an admin, nothing to do\n", email)
		case apply:
			ok++
			fmt.Printf("  %-32s promoted to admin\n", email)
		default:
			ok++
			fmt.Printf("  %-32s would be promoted (preview only, re-run with --apply)\n", email)
		}
	}
	if ok == 0 && failed > 0 {
		return fmt.Errorf("no account was promoted")
	}
	return nil
}

//go:embed storage/executive_photos.sql
var executivePhotosSQL string

// storageSetup creates the photo bucket and its upload policy (see storage/executive_photos.sql). Idempotent.
func storageSetup(s AuthStore) error {
	pg, ok := s.(*pgStore)
	if !ok {
		return fmt.Errorf("DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	tx, err := pg.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, executivePhotosSQL); err != nil {
		return fmt.Errorf("%w (paste backend/storage/executive_photos.sql into Supabase > SQL Editor instead)", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	fmt.Println("bucket executive-photos and its admin-only upload policy are in place")
	return nil
}
