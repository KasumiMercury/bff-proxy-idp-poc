package config

import (
	"fmt"
	"net"
	"os"
	"strings"
)

type Config struct {
	HTTPAddr    string
	Issuer      string
	UsersPath   string
	ClientsPath string
}

func LoadConfig() Config {
	httpAddr := getEnv("IDP_HTTP_ADDR", ":8080")

	issuer, ok := lookupEnv("IDP_ISSUER")
	if !ok || issuer == "" {
		issuer = defaultIssuer(httpAddr)
	}

	return Config{
		HTTPAddr:    httpAddr,
		Issuer:      issuer,
		UsersPath:   getEnv("IDP_USERS_PATH", "data/users.json"),
		ClientsPath: getEnv("IDP_CLIENTS_PATH", "data/clients.json"),
	}
}

func defaultIssuer(addr string) string {
	host := "localhost"
	port := ""

	if strings.HasPrefix(addr, ":") {
		port = strings.TrimPrefix(addr, ":")
	} else {
		parsedHost, parsedPort, err := net.SplitHostPort(addr)
		if err != nil {
			host = addr
		} else {
			host = parsedHost
			port = parsedPort
		}
	}

	if port == "" {
		return fmt.Sprintf("http://%s", host)
	}

	return fmt.Sprintf("http://%s:%s", host, port)
}

func lookupEnv(key string) (string, bool) {
	val, ok := os.LookupEnv(key)
	return val, ok
}

func getEnv(key, fallback string) string {
	if val, ok := lookupEnv(key); ok && val != "" {
		return val
	}
	return fallback
}
