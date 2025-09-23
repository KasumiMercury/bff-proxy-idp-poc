package data

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	exampleStorage "github.com/zitadel/oidc/v2/example/server/storage"
)

var postLogoutByClient = make(map[string][]string)

type ClientRecord struct {
	ID                     string   `json:"id"`
	Type                   string   `json:"type"`
	Secret                 string   `json:"secret"`
	RedirectURIs           []string `json:"redirect_uris"`
	PostLogoutRedirectURIs []string `json:"post_logout_redirect_uris"`
}

func LoadClients(path string) ([]*exampleStorage.Client, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open clients file: %w", err)
	}
	defer file.Close()

	var records []ClientRecord
	if err := json.NewDecoder(file).Decode(&records); err != nil {
		return nil, fmt.Errorf("failed to decode clients file: %w", err)
	}

	if len(records) == 0 {
		return nil, fmt.Errorf("clients file must define at least one client")
	}

	clients := make([]*exampleStorage.Client, 0, len(records))

	postLogout := make(map[string][]string, len(records))

	for _, record := range records {
		if record.ID == "" {
			return nil, fmt.Errorf("client record is missing id")
		}

		clientType := strings.ToLower(record.Type)
		var client *exampleStorage.Client

		switch clientType {
		case "web", "confidential":
			if record.Secret == "" {
				return nil, fmt.Errorf("web client %s requires a secret", record.ID)
			}
			client = exampleStorage.WebClient(record.ID, record.Secret, record.RedirectURIs...)
		case "native", "public":
			client = exampleStorage.NativeClient(record.ID, record.RedirectURIs...)
		case "device":
			if record.Secret == "" {
				return nil, fmt.Errorf("device client %s requires a secret", record.ID)
			}
			client = exampleStorage.DeviceClient(record.ID, record.Secret)
		default:
			return nil, fmt.Errorf("unsupported client type %q for client %s", record.Type, record.ID)
		}

		if len(record.PostLogoutRedirectURIs) > 0 {
			postLogout[record.ID] = append([]string(nil), record.PostLogoutRedirectURIs...)
		}
		clients = append(clients, client)
	}

	postLogoutByClient = postLogout

	return clients, nil
}

func PostLogoutRedirectURIs(clientID string) []string {
	uris := postLogoutByClient[clientID]
	if len(uris) == 0 {
		return nil
	}
	return append([]string(nil), uris...)
}
