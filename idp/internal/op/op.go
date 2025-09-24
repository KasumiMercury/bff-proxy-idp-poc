package exampleop

import (
	"crypto/sha256"
	"log"
	"log/slog"
	"math/rand"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/zitadel/logging"
	"golang.org/x/text/language"

	"github.com/zitadel/oidc/v3/pkg/op"
)

const (
	pathLoggedOut = "/logged-out"
)

type Storage interface {
	op.Storage
	deviceAuthenticate
	CheckUsernamePassword(username, password, id string) error
}

func SetupServer(issuer string, storage Storage, logger *slog.Logger, wrapServer bool, extraOptions ...op.Option) chi.Router {
	key := sha256.Sum256([]byte("test"))

	router := chi.NewRouter()
	router.Use(logging.Middleware(
		logging.WithLogger(logger),
		logging.WithIDFunc(func() slog.Attr {
			return slog.Int64("id", rand.Int63())
		}),
	))

	router.HandleFunc(pathLoggedOut, func(w http.ResponseWriter, req *http.Request) {
		w.Write([]byte("signed out successfully"))
	})

	provider, err := newOP(
		storage,
		issuer,
		key,
		logger,
		extraOptions...,
	)
	if err != nil {
		log.Fatal(err)
	}

	l := NewLogin(storage, op.AuthCallbackURL(provider), op.NewIssuerInterceptor(provider.IssuerFromRequest))
	router.Mount("/login/", http.StripPrefix("/login", l.router))

	router.Route("/device", func(r chi.Router) {
		registerDeviceAuth(storage, r)
	})

	handler := http.Handler(provider)
	if wrapServer {
		handler = op.RegisterLegacyServer(op.NewLegacyServer(provider, *op.DefaultEndpoints), op.AuthorizeCallbackHandler(provider))
	}
	router.Mount("/", handler)

	return router
}

func newOP(
	storage op.Storage,
	issuer string,
	key [32]byte, // encryption key
	logger *slog.Logger,
	extraOptions ...op.Option,
) (op.OpenIDProvider, error) {
	config := &op.Config{
		CryptoKey:                key,
		DefaultLogoutRedirectURI: pathLoggedOut,
		CodeMethodS256:           true,
		AuthMethodPost:           true,
		AuthMethodPrivateKeyJWT:  true,
		GrantTypeRefreshToken:    true,
		RequestObjectSupported:   true,
		SupportedUILocales:       []language.Tag{language.English},
		DeviceAuthorization: op.DeviceAuthorizationConfig{
			Lifetime:     5 * time.Minute,
			PollInterval: 5 * time.Second,
			UserFormPath: "/device",
			UserCode:     op.UserCodeBase20,
		},
	}
	//handler, err := op.NewOpenIDProvider(issuer, config, storage,
	//	append([]op.Option{
	//		//we must explicitly allow the use of the http issuer
	//		op.WithAllowInsecure(),
	//		// as an example on how to customize an endpoint this will change the authorization_endpoint from /authorize to /auth
	//		op.WithCustomAuthEndpoint(op.NewEndpoint("auth")),
	//		// Pass our logger to the OP
	//		op.WithLogger(logger.WithGroup("op")),
	//	}, extraOptions...)...,
	//)
	options := append([]op.Option{
		op.WithAllowInsecure(),
		op.WithLogger(logger.WithGroup("op")),
	}, extraOptions...)

	handler, err := op.NewProvider(config, storage, op.StaticIssuer(issuer), options...)
	if err != nil {
		return nil, err
	}
	return handler, nil
}
