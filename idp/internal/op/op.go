package op

import (
	"log/slog"

	"github.com/zitadel/oidc/v3/pkg/op"
)

func NewOpenIDProvider(
	logger *slog.Logger,
	storage op.Storage,
	issuer string,
) (op.OpenIDProvider, error) {
	config := &op.Config{}

	options := append([]op.Option{
		op.WithAllowInsecure(),
		op.WithLogger(logger.WithGroup("op")),
	})

	handler, err := op.NewProvider(config, storage, op.StaticIssuer(issuer), options...)
	if err != nil {
		return nil, err
	}

	return handler, nil
}
