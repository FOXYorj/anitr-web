package main

import (
	"embed"
	"fmt"
	"os"

	"github.com/prayjofir/anitr-cli/internal/api"
)

//go:embed web/*
var webFS embed.FS

func main() {
	port := "8081"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}
	fmt.Println("Anitr Web App starting...")

	// Start the web API server, with embedded web files!
	api.StartServer(port, "web", webFS)
}
