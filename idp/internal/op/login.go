package op

import (
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
	router  chi.Router
	storage *storage.Storage
}

func NewLogin(storage *storage.Storage, issuerInterceptor *op.IssuerInterceptor) *Login {
	l := &Login{
		storage: storage,
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
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if payload.Username == "" || payload.Password == "" {
		http.Error(w, "username and password are required", http.StatusBadRequest)
	}

	if err := l.storage.CheckUsernamePassword(payload.Username, payload.Password, payload.ID); err != nil {
		slog.Error("login failed", "error", err)
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
	}

	w.WriteHeader(http.StatusOK)
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
