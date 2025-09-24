package router

import (
	internalop "idp/internal/op"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/zitadel/logging"
	"github.com/zitadel/oidc/v3/pkg/op"
)

func NewRouter(
	issuer string,
	storage op.Storage,
	logger *slog.Logger,
) chi.Router {
	router := chi.NewRouter()
	router.Use(logging.Middleware(
		logging.WithLogger(logger),
		logging.WithIDFunc(func() slog.Attr {
			return slog.Int64("id", time.Now().UnixNano())
		}),
	))

	provider, err := internalop.NewOpenIDProvider(
		storage,
		issuer,
	)
	if err != nil {
		slog.Error("failed to create openid provider", "error", err)
		os.Exit(1)
	}

	handler := http.Handler(provider)
	router.Mount("/", handler)

	return router
}
