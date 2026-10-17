package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
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
	srv := &http.Server{
		Addr:              ":" + env("PORT", "8080"),
		Handler:           app.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	go func() {
		log.Printf("api listening on %s (sample student data: %v)", srv.Addr, store.Sample)
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

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
