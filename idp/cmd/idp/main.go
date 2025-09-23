package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	exampleop "github.com/zitadel/oidc/v2/example/server/exampleop"
	exampleStorage "github.com/zitadel/oidc/v2/example/server/storage"
	"github.com/zitadel/oidc/v2/pkg/op"

	"idp/internal/data"
)

type Config struct {
	HTTPAddr    string
	Issuer      string
	UsersPath   string
	ClientsPath string
}

func main() {
	cfg := loadConfig()

	clients, err := data.LoadClients(cfg.ClientsPath)
	if err != nil {
		log.Fatalf("failed to load clients: %v", err)
	}
	exampleStorage.RegisterClients(clients...)

	userStore, err := data.LoadUserStore(cfg.UsersPath)
	if err != nil {
		log.Fatalf("failed to load users: %v", err)
	}

	if len(clients) > 0 {
		userStore.SetExampleClientID(clients[0].GetID())
	}

	store := newStorageWithLogout(userStore)

	router := exampleop.SetupServer(cfg.Issuer, store)
	router.Use(requestLogger)
	router.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if err := store.Health(r.Context()); err != nil {
			http.Error(w, fmt.Sprintf("unhealthy: %v", err), http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}).Methods(http.MethodGet)

	srv := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: router,
	}

	go func() {
		log.Printf("OIDC provider starting on %s (issuer %s)", cfg.HTTPAddr, cfg.Issuer)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server failed: %v", err)
		}
	}()

	waitForShutdown(srv)
}

func loadConfig() Config {
	httpAddr := getEnv("IDP_HTTP_ADDR", ":8080")

	issuer, ok := lookupEnv("IDP_ISSUER")
	if !ok || issuer == "" {
		issuer = defaultIssuer(httpAddr)
	}

	return Config{
		HTTPAddr:    httpAddr,
		Issuer:      issuer,
		UsersPath:   getEnv("IDP_USERS_PATH", "data/users.json"),
		ClientsPath: getEnv("IDP_CLIENTS_PATH", "data/clients.json"),
	}
}

func defaultIssuer(addr string) string {
	host := "localhost"
	port := ""

	if strings.HasPrefix(addr, ":") {
		port = strings.TrimPrefix(addr, ":")
	} else {
		parsedHost, parsedPort, err := net.SplitHostPort(addr)
		if err != nil {
			host = addr
		} else {
			host = parsedHost
			port = parsedPort
		}
	}

	if port == "" {
		return fmt.Sprintf("http://%s", host)
	}

	return fmt.Sprintf("http://%s:%s", host, port)
}

func lookupEnv(key string) (string, bool) {
	val, ok := os.LookupEnv(key)
	return val, ok
}

func getEnv(key, fallback string) string {
	if val, ok := lookupEnv(key); ok && val != "" {
		return val
	}
	return fallback
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

func newStorageWithLogout(userStore *data.UserStore) *storageWithLogout {
	return &storageWithLogout{Storage: exampleStorage.NewStorage(userStore)}
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		record := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(record, r)
		duration := time.Since(start)
		log.Printf(
			"idp request %s %s -> %d (%d bytes) in %s from %s",
			r.Method,
			r.URL.Path,
			record.status,
			record.size,
			duration,
			r.RemoteAddr,
		)
	})
}

type responseRecorder struct {
	http.ResponseWriter
	status int
	size   int
}

func (r *responseRecorder) WriteHeader(statusCode int) {
	r.status = statusCode
	r.ResponseWriter.WriteHeader(statusCode)
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	n, err := r.ResponseWriter.Write(b)
	r.size += n
	return n, err
}

type storageWithLogout struct {
	*exampleStorage.Storage
}

func (s *storageWithLogout) GetClientByClientID(ctx context.Context, clientID string) (op.Client, error) {
	client, err := s.Storage.GetClientByClientID(ctx, clientID)
	if err != nil {
		return nil, err
	}

	postLogout := data.PostLogoutRedirectURIs(clientID)
	if len(postLogout) == 0 {
		return client, nil
	}

	return clientWithLogout{
		Client:     client,
		postLogout: postLogout,
	}, nil
}

type clientWithLogout struct {
	op.Client
	postLogout []string
}

func (c clientWithLogout) PostLogoutRedirectURIs() []string {
	if len(c.postLogout) == 0 {
		return c.Client.PostLogoutRedirectURIs()
	}
	return append([]string(nil), c.postLogout...)
}

func (c clientWithLogout) RedirectURIGlobs() []string {
	if with, ok := c.Client.(op.HasRedirectGlobs); ok {
		return with.RedirectURIGlobs()
	}
	return nil
}

func (c clientWithLogout) PostLogoutRedirectURIGlobs() []string {
	if with, ok := c.Client.(op.HasRedirectGlobs); ok {
		return with.PostLogoutRedirectURIGlobs()
	}
	return nil
}
