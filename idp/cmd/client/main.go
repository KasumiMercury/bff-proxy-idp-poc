package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

type config struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	RedirectURI  string
	ListenAddr   string
	Scopes       []string
}

type providerMetadata struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
}

type userInfo struct {
	Subject string `json:"sub"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Locale  string `json:"locale"`
	Raw     map[string]any
}

type sessionData struct {
	AccessToken  string
	RefreshToken string
	IDToken      string
	TokenType    string
	Scope        string
	ExpiresAt    time.Time
	User         userInfo
}

type pendingAuth struct {
	SessionID string
	Nonce     string
	Created   time.Time
}

type server struct {
	cfg       config
	provider  providerMetadata
	client    *http.Client
	templates *template.Template

	mu             sync.RWMutex
	sessions       map[string]*sessionData
	pendingByState map[string]pendingAuth
}

func main() {
	cfg := loadConfig()

	provider, err := discoverProvider(context.Background(), cfg.Issuer)
	if err != nil {
		log.Fatalf("failed to discover provider: %v", err)
	}

	srv := &server{
		cfg:            cfg,
		provider:       provider,
		client:         &http.Client{Timeout: 10 * time.Second},
		templates:      template.Must(template.New("index").Parse(indexTemplate)),
		sessions:       make(map[string]*sessionData),
		pendingByState: make(map[string]pendingAuth),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", srv.handleIndex)
	mux.HandleFunc("/login", srv.handleLogin)
	mux.HandleFunc("/logout", srv.handleLogout)
	mux.HandleFunc("/auth/callback", srv.handleCallback)

	server := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: mux,
	}

	log.Printf("OIDC client listening on %s", cfg.ListenAddr)
	log.Fatal(server.ListenAndServe())
}

func loadConfig() config {
	cfg := config{
		Issuer:       getenv("OIDC_ISSUER", "http://localhost:8080"),
		ClientID:     getenv("OIDC_CLIENT_ID", "third-web-app"),
		ClientSecret: getenv("OIDC_CLIENT_SECRET", "third-secret"),
		RedirectURI:  getenv("OIDC_REDIRECT_URI", "http://localhost:4000/auth/callback"),
		ListenAddr:   getenv("OIDC_LISTEN_ADDR", ":4000"),
	}
	scopes := getenv("OIDC_SCOPES", "openid profile email offline_access")
	cfg.Scopes = strings.Fields(scopes)
	return cfg
}

func discoverProvider(ctx context.Context, issuer string) (providerMetadata, error) {
	var metadata providerMetadata
	discoveryURL := strings.TrimSuffix(issuer, "/") + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discoveryURL, nil)
	if err != nil {
		return metadata, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return metadata, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return metadata, fmt.Errorf("discovery failed: %s", resp.Status)
	}
	if err := json.NewDecoder(resp.Body).Decode(&metadata); err != nil {
		return metadata, err
	}
	return metadata, nil
}

func (s *server) handleIndex(w http.ResponseWriter, r *http.Request) {
	session := s.sessionFromRequest(r)

	data := struct {
		Config   config
		Provider providerMetadata
		Session  *sessionData
	}{
		Config:   s.cfg,
		Provider: s.provider,
		Session:  session,
	}

	if err := s.templates.ExecuteTemplate(w, "index", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	sessionID := s.ensureSession(w, r)
	state := randomString(24)
	nonce := randomString(24)

	s.mu.Lock()
	s.pendingByState[state] = pendingAuth{SessionID: sessionID, Nonce: nonce, Created: time.Now()}
	s.mu.Unlock()

	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", s.cfg.ClientID)
	q.Set("redirect_uri", s.cfg.RedirectURI)
	q.Set("scope", strings.Join(s.cfg.Scopes, " "))
	q.Set("state", state)
	q.Set("nonce", nonce)

	http.Redirect(w, r, s.provider.AuthorizationEndpoint+"?"+q.Encode(), http.StatusFound)
}

func (s *server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie("oidc_client_session"); err == nil {
		s.mu.Lock()
		delete(s.sessions, c.Value)
		s.mu.Unlock()
		http.SetCookie(w, &http.Cookie{
			Name:   "oidc_client_session",
			Value:  "",
			Path:   "/",
			MaxAge: -1,
		})
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

func (s *server) handleCallback(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, fmt.Sprintf("cannot parse callback: %v", err), http.StatusBadRequest)
		return
	}
	state := r.FormValue("state")
	code := r.FormValue("code")
	if state == "" || code == "" {
		http.Error(w, "missing state or code", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	pending, ok := s.pendingByState[state]
	if ok {
		delete(s.pendingByState, state)
	}
	s.mu.Unlock()
	if !ok {
		http.Error(w, "unknown state", http.StatusBadRequest)
		return
	}

	token, err := s.exchangeCode(r.Context(), code)
	if err != nil {
		http.Error(w, fmt.Sprintf("token exchange failed: %v", err), http.StatusBadGateway)
		return
	}

	session := &sessionData{
		AccessToken:  token.AccessToken,
		RefreshToken: token.RefreshToken,
		IDToken:      token.IDToken,
		TokenType:    token.TokenType,
		Scope:        token.Scope,
	}
	if token.ExpiresIn > 0 {
		session.ExpiresAt = time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
	}

	if s.provider.UserinfoEndpoint != "" && token.AccessToken != "" {
		if ui, err := s.fetchUserInfo(r.Context(), token.AccessToken); err == nil {
			session.User = ui
		}
	}

	s.mu.Lock()
	s.sessions[pending.SessionID] = session
	s.mu.Unlock()

	http.Redirect(w, r, "/", http.StatusFound)
}

func (s *server) exchangeCode(ctx context.Context, code string) (tokenResponse, error) {
	values := url.Values{}
	values.Set("grant_type", "authorization_code")
	values.Set("code", code)
	values.Set("redirect_uri", s.cfg.RedirectURI)
	values.Set("client_id", s.cfg.ClientID)
	values.Set("client_secret", s.cfg.ClientSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.provider.TokenEndpoint, strings.NewReader(values.Encode()))
	if err != nil {
		return tokenResponse{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client.Do(req)
	if err != nil {
		return tokenResponse{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return tokenResponse{}, fmt.Errorf("token endpoint error: %s %s", resp.Status, string(body))
	}

	var token tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&token); err != nil {
		return tokenResponse{}, err
	}
	return token, nil
}

func (s *server) fetchUserInfo(ctx context.Context, accessToken string) (userInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.provider.UserinfoEndpoint, nil)
	if err != nil {
		return userInfo{}, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := s.client.Do(req)
	if err != nil {
		return userInfo{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return userInfo{}, fmt.Errorf("userinfo error: %s", resp.Status)
	}

	raw := make(map[string]any)
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return userInfo{}, err
	}

	ui := userInfo{Raw: raw}
	if sub, ok := raw["sub"].(string); ok {
		ui.Subject = sub
	}
	if email, ok := raw["email"].(string); ok {
		ui.Email = email
	}
	if name, ok := raw["name"].(string); ok {
		ui.Name = name
	}
	if locale, ok := raw["locale"].(string); ok {
		ui.Locale = locale
	}

	return ui, nil
}

func (s *server) sessionFromRequest(r *http.Request) *sessionData {
	c, err := r.Cookie("oidc_client_session")
	if err != nil {
		return nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sessions[c.Value]
}

func (s *server) ensureSession(w http.ResponseWriter, r *http.Request) string {
	if c, err := r.Cookie("oidc_client_session"); err == nil && c.Value != "" {
		return c.Value
	}
	sessionID := randomString(32)
	http.SetCookie(w, &http.Cookie{
		Name:     "oidc_client_session",
		Value:    sessionID,
		Path:     "/",
		Expires:  time.Now().Add(12 * time.Hour),
		HttpOnly: true,
	})
	return sessionID
}

func randomString(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)[:n]
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

const indexTemplate = `{{ define "index" }}
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <title>OIDC Test Client</title>
</head>
<body>
    <h1>OIDC Test Client</h1>
    <section>
        <h2>Configuration</h2>
        <ul>
            <li>Issuer: {{ .Config.Issuer }}</li>
            <li>Client ID: {{ .Config.ClientID }}</li>
            <li>Redirect URI: {{ .Config.RedirectURI }}</li>
            <li>Scopes: {{ range $i, $s := .Config.Scopes }}{{ if $i }}, {{ end }}{{ $s }}{{ end }}</li>
        </ul>
    </section>
    <section>
        <h2>Provider</h2>
        <ul>
            <li>Authorization Endpoint: {{ .Provider.AuthorizationEndpoint }}</li>
            <li>Token Endpoint: {{ .Provider.TokenEndpoint }}</li>
            <li>Userinfo Endpoint: {{ .Provider.UserinfoEndpoint }}</li>
        </ul>
    </section>
    <section>
        <h2>Session</h2>
        {{ if .Session }}
            <p><strong>Access Token:</strong> {{ .Session.AccessToken }}</p>
            <p><strong>ID Token:</strong> {{ .Session.IDToken }}</p>
            <p><strong>Refresh Token:</strong> {{ .Session.RefreshToken }}</p>
            <p><strong>Token Type:</strong> {{ .Session.TokenType }}</p>
            <p><strong>Scope:</strong> {{ .Session.Scope }}</p>
            <p><strong>Expires At:</strong> {{ .Session.ExpiresAt }}</p>
            {{ if .Session.User.Raw }}
                <h3>User Info</h3>
                <pre>{{ printf "%+v" .Session.User.Raw }}</pre>
            {{ end }}
            <p><a href="/logout">Clear Session</a></p>
        {{ else }}
            <p>No tokens yet.</p>
        {{ end }}
    </section>
    <p><a href="/login">Start Authorization Code Flow</a></p>
</body>
</html>
{{ end }}`
