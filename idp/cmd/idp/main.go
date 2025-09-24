package main

import (
	"context"
	"errors"
	"idp/internal/config"
	"idp/internal/op"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"idp/internal/data"

	"github.com/zitadel/oidc/v3/example/server/storage"
)

func main() {
	cfg := config.LoadConfig()

	logger := slog.New(
		slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			AddSource: true,
			Level:     slog.LevelDebug,
		}),
	)

	clients, err := data.LoadClients(cfg.ClientsPath)
	if err != nil {
		log.Fatalf("failed to load clients: %v", err)
	}
	storage.RegisterClients(clients...)

	userStore, err := data.LoadUserStore(cfg.UsersPath)
	if err != nil {
		log.Fatalf("failed to load users: %v", err)
	}

	if len(clients) > 0 {
		userStore.SetExampleClientID(clients[0].GetID())
	}

	store := storage.NewStorage(userStore)

	r := op.NewRouter(cfg.Issuer, store, logger)

	srv := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: r,
	}

	go func() {
		slog.Info(
			"OIDC provider starting",
			"address", cfg.HTTPAddr,
			"issuer", cfg.Issuer,
		)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("http server failed", "error", err)
		}
	}()

	waitForShutdown(srv)
}

func waitForShutdown(server *http.Server) {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Printf("shutdown signal received, closing server")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}
