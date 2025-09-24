package op

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/zitadel/logging"
	"github.com/zitadel/oidc/v3/example/server/storage"
	"github.com/zitadel/oidc/v3/pkg/op"
)

func NewRouter(
	issuer string,
	storage *storage.Storage,
	logger *slog.Logger,
) chi.Router {
	router := chi.NewRouter()
	router.Use(logging.Middleware(
		logging.WithLogger(logger),
		logging.WithIDFunc(func() slog.Attr {
			return slog.Int64("id", time.Now().UnixNano())
		}),
	))

	provider, err := NewOpenIDProvider(
		logger,
		storage,
		issuer,
	)
	if err != nil {
		slog.Error("failed to create openid provider", "error", err)
		os.Exit(1)
	}

	l := NewLogin(storage, op.NewIssuerInterceptor(provider.IssuerFromRequest))
	router.Mount("/login", http.StripPrefix("/login", l.Router()))

	handler := http.Handler(provider)
	router.Mount("/", handler)

	return router
}
