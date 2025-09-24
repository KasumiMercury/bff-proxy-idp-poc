package exampleop

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"
	"github.com/zitadel/oidc/v3/pkg/op"
)

type login struct {
	storage  Storage
	router   chi.Router
	callback func(context.Context, string) string
}

func NewLogin(storage Storage, callback func(context.Context, string) string, issuerInterceptor *op.IssuerInterceptor) *login {
	l := &login{
		storage:  storage,
		callback: callback,
	}
	l.createRouter(issuerInterceptor)
	return l
}

func (l *login) createRouter(issuerInterceptor *op.IssuerInterceptor) {
	l.router = chi.NewRouter()
	l.router.Get("/context", issuerInterceptor.HandlerFunc(l.contextHandler))
	l.router.Post("/username", issuerInterceptor.HandlerFunc(l.apiLoginHandler))
	l.router.Get("/consent", l.consentHandler)
	l.router.Post("/consent", issuerInterceptor.HandlerFunc(l.handleConsent))
}

func (l *login) contextHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing auth request id")
		return
	}
	authReq, err := l.storage.AuthRequestByID(r.Context(), id)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, errMsg(err))
		return
	}
	client, err := l.storage.GetClientByClientID(r.Context(), authReq.GetClientID())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, errMsg(err))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		ID        string   `json:"id"`
		ClientID  string   `json:"client_id"`
		Scopes    []string `json:"scopes"`
		LoginHint string   `json:"login_hint"`
	}{
		ID:        id,
		ClientID:  client.GetID(),
		Scopes:    authReq.GetScopes(),
		LoginHint: authReq.GetSubject(),
	})
}

func (l *login) apiLoginHandler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		ID       string `json:"id"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("invalid payload: %s", errMsg(err)))
		return
	}
	if payload.ID == "" || payload.Username == "" || payload.Password == "" {
		writeJSONError(w, http.StatusBadRequest, "id, username and password are required")
		return
	}
	if _, err := l.storage.AuthRequestByID(r.Context(), payload.ID); err != nil {
		writeJSONError(w, http.StatusNotFound, errMsg(err))
		return
	}
	if err := l.storage.CheckUsernamePassword(payload.Username, payload.Password, payload.ID); err != nil {
		writeJSONError(w, http.StatusUnauthorized, errMsg(err))
		return
	}

	next := "/login/consent?id=" + url.QueryEscape(payload.ID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Next string `json:"next"`
	}{Next: next})
}

func (l *login) consentHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing auth request id", http.StatusBadRequest)
		return
	}
	authReq, err := l.storage.AuthRequestByID(r.Context(), id)
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot load auth request: %v", err), http.StatusInternalServerError)
		return
	}
	if authReq.GetSubject() == "" {
		http.Error(w, "login required", http.StatusUnauthorized)
		return
	}
	client, err := l.storage.GetClientByClientID(r.Context(), authReq.GetClientID())
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot load client: %v", err), http.StatusInternalServerError)
		return
	}
	renderConsent(w, consentData{
		ID:       id,
		ClientID: client.GetID(),
		Scopes:   authReq.GetScopes(),
	})
}

func (l *login) handleConsent(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
		return
	}
	id := r.FormValue("id")
	if id == "" {
		http.Error(w, "missing auth request id", http.StatusBadRequest)
		return
	}
	http.Redirect(w, r, l.callback(r.Context(), id), http.StatusFound)
}

type consentData struct {
	ID       string
	ClientID string
	Scopes   []string
}

func renderConsent(w http.ResponseWriter, data consentData) {
	if err := templates.ExecuteTemplate(w, "consent", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(struct {
		Error string `json:"error"`
	}{Error: message})
}
