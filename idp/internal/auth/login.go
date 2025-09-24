package auth

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zitadel/oidc/v3/example/server/storage"
)

type authenticate interface {
	CheckUsernamePassword(username, password, id string) error
}

type Login struct {
	router  chi.Router
	storage *storage.Storage
}

func NewLogin(storage *storage.Storage) *Login {
	l := &Login{
		storage: storage,
	}
	l.router = l.newRouter()
	return l
}

func (l *Login) newRouter() chi.Router {
	router := chi.NewRouter()
	router.Post("/", l.handler)
	return router
}

func (l *Login) Router() chi.Router {
	return l.router
}

func (l *Login) handler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
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

	if err := l.storage.CheckUsernamePassword(payload.Username, payload.Password, uuid.New().String()); err != nil {
		slog.Error("login failed", "error", err)
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
	}

	w.WriteHeader(http.StatusOK)
}
