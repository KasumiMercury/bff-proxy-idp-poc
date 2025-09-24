package op

import "github.com/zitadel/oidc/v3/pkg/op"

func NewOpenIDProvider(
	storage op.Storage,
	issuer string,
) (op.OpenIDProvider, error) {
	config := &op.Config{}

	handler, err := op.NewProvider(config, storage, op.StaticIssuer(issuer))
	if err != nil {
		return nil, err
	}

	return handler, nil
}
