package op

import (
	"embed"
	"html/template"
)

var (
	//go:embed templates
	templateFS embed.FS
	templates  = template.Must(template.ParseFS(templateFS, "templates/*.html"))
)
