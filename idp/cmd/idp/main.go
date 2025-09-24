package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/zitadel/oidc/v3/example/server/storage"
	"github.com/zitadel/oidc/v3/pkg/op"

	"idp/internal/data"
	internalop "idp/internal/op"
)

type Config struct {
	HTTPAddr         string
	Issuer           string
	UsersPath        string
	ClientsPath      string
	LoginURLTemplate string
}

func main() {
	cfg := loadConfig()

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

	store := newStorageWithOverrides(userStore, cfg.LoginURLTemplate)

	router := internalop.SetupServer(cfg.Issuer, store, logger, false)

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
		HTTPAddr:         httpAddr,
		Issuer:           issuer,
		UsersPath:        getEnv("IDP_USERS_PATH", "data/users.json"),
		ClientsPath:      getEnv("IDP_CLIENTS_PATH", "data/clients.json"),
		LoginURLTemplate: getEnv("IDP_LOGIN_URL_TEMPLATE", ""),
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

func newStorageWithOverrides(userStore *data.UserStore, loginTemplate string) *storageWithOverrides {
	return &storageWithOverrides{
		Storage:          storage.NewStorage(userStore),
		loginURLTemplate: loginTemplate,
	}
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

type storageWithOverrides struct {
	*storage.Storage
	loginURLTemplate string
}

func (s *storageWithOverrides) GetClientByClientID(ctx context.Context, clientID string) (op.Client, error) {
	client, err := s.Storage.GetClientByClientID(ctx, clientID)
	if err != nil {
		return nil, err
	}

	postLogout := data.PostLogoutRedirectURIs(clientID)

	return clientWithOverrides{
		Client:           client,
		postLogout:       postLogout,
		loginURLTemplate: s.loginURLTemplate,
	}, nil
}

type clientWithOverrides struct {
	op.Client
	postLogout       []string
	loginURLTemplate string
}

func (c clientWithOverrides) PostLogoutRedirectURIs() []string {
	if len(c.postLogout) == 0 {
		return c.Client.PostLogoutRedirectURIs()
	}
	return append([]string(nil), c.postLogout...)
}

func (c clientWithOverrides) RedirectURIGlobs() []string {
	if with, ok := c.Client.(op.HasRedirectGlobs); ok {
		return with.RedirectURIGlobs()
	}
	return nil
}

func (c clientWithOverrides) PostLogoutRedirectURIGlobs() []string {
	if with, ok := c.Client.(op.HasRedirectGlobs); ok {
		return with.PostLogoutRedirectURIGlobs()
	}
	return nil
}

func (c clientWithOverrides) LoginURL(id string) string {
	if c.loginURLTemplate == "" {
		return c.Client.LoginURL(id)
	}
	if strings.Contains(c.loginURLTemplate, "%s") {
		return fmt.Sprintf(c.loginURLTemplate, url.QueryEscape(id))
	}
	parsed, err := url.Parse(c.loginURLTemplate)
	if err != nil {
		return c.Client.LoginURL(id)
	}
	query := parsed.Query()
	query.Set("authRequestID", id)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}
