package op

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/zitadel/oidc/v3/example/server/storage"
	"github.com/zitadel/oidc/v3/pkg/op"
)

type authenticate interface {
	CheckUsernamePassword(username, password, id string) error
}

type Login struct {
	router   chi.Router
	storage  *storage.Storage
	callback func(context.Context, string) string
}

func NewLogin(storage *storage.Storage, issuerInterceptor *op.IssuerInterceptor, callback func(context.Context, string) string) *Login {
	l := &Login{
		storage:  storage,
		callback: callback,
	}
	l.router = l.newRouter(issuerInterceptor)
	return l
}

func (l *Login) newRouter(issuerInterceptor *op.IssuerInterceptor) chi.Router {
	router := chi.NewRouter()
	router.Post("/username", issuerInterceptor.HandlerFunc(l.handler))
	router.Get("/username", l.renderLoginPage)
	return router
}

func (l *Login) Router() chi.Router {
	return l.router
}

func (l *Login) handler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		ID       string `json:"id"`
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request")
		return
	}

	if payload.ID == "" {
		writeJSONError(w, http.StatusBadRequest, "auth request id is required")
		return
	}

	if payload.Username == "" || payload.Password == "" {
		writeJSONError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	if err := l.storage.CheckUsernamePassword(payload.Username, payload.Password, payload.ID); err != nil {
		slog.Error("login failed", "error", err)
		writeJSONError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	next := l.callback(r.Context(), payload.ID)
	response := struct {
		Next string `json:"next"`
	}{
		Next: next,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		slog.Error("failed to encode login response", "error", err)
	}
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": message,
	})
}

func (l *Login) renderLoginPage(w http.ResponseWriter, r *http.Request) {
	err := r.ParseForm()
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
		return
	}

	data := &struct {
		ID string
	}{
		ID: r.FormValue("authRequestID"),
	}

	err = templates.ExecuteTemplate(w, "login", data)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
