package data

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/zitadel/oidc/v3/example/server/storage"
	"golang.org/x/text/language"
)

type UserRecord struct {
	ID                string `json:"id"`
	Username          string `json:"username"`
	Password          string `json:"password"`
	FirstName         string `json:"first_name"`
	LastName          string `json:"last_name"`
	Email             string `json:"email"`
	EmailVerified     bool   `json:"email_verified"`
	Phone             string `json:"phone"`
	PhoneVerified     bool   `json:"phone_verified"`
	PreferredLanguage string `json:"preferred_language"`
	IsAdmin           bool   `json:"is_admin"`
}

type UserStore struct {
	usersByID       map[string]*storage.User
	usersByUsername map[string]*storage.User
	exampleClientID string
}

func LoadUserStore(path string) (*UserStore, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open users file: %w", err)
	}
	defer file.Close()

	var records []UserRecord
	if err := json.NewDecoder(file).Decode(&records); err != nil {
		return nil, fmt.Errorf("failed to decode users file: %w", err)
	}

	store := &UserStore{
		usersByID:       make(map[string]*storage.User),
		usersByUsername: make(map[string]*storage.User),
	}

	for _, record := range records {
		if record.ID == "" || record.Username == "" {
			return nil, fmt.Errorf("user record must include id and username")
		}

		preferredLang := language.English
		if strings.TrimSpace(record.PreferredLanguage) != "" {
			preferredLang = language.Make(record.PreferredLanguage)
		}

		user := &storage.User{
			ID:                record.ID,
			Username:          record.Username,
			Password:          record.Password,
			FirstName:         record.FirstName,
			LastName:          record.LastName,
			Email:             record.Email,
			EmailVerified:     record.EmailVerified,
			Phone:             record.Phone,
			PhoneVerified:     record.PhoneVerified,
			PreferredLanguage: preferredLang,
			IsAdmin:           record.IsAdmin,
		}

		store.usersByID[user.ID] = user
		store.usersByUsername[user.Username] = user
	}

	return store, nil
}

func (s *UserStore) SetExampleClientID(id string) {
	s.exampleClientID = id
}

func (s *UserStore) ExampleClientID() string {
	return s.exampleClientID
}

func (s *UserStore) GetUserByID(id string) *storage.User {
	return s.usersByID[id]
}

func (s *UserStore) GetUserByUsername(username string) *storage.User {
	return s.usersByUsername[username]
}
