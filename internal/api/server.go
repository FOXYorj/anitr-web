package api

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/prayjofir/anitr-cli/internal/jikan"
	"github.com/prayjofir/anitr-cli/internal/models"
	"github.com/prayjofir/anitr-cli/internal/sources/animecix"
	"github.com/prayjofir/anitr-cli/internal/sources/anizium"
	"github.com/prayjofir/anitr-cli/internal/sources/aniziumfree"
)

// Global map of available sources
var sources = map[string]models.AnimeSource{
	"AnimeciX":     animecix.AnimeCix{},
	"Anizium":      anizium.Anizium{},
	"Anizium Free": aniziumfree.AniziumFree{},
}

// ── Watch2Gether (W2G) Types & State ──────────────────────
type W2GMessage struct {
	Type     string      `json:"type"`     // "chat", "play", "pause", "seek", "join", "leave"
	Username string      `json:"username"` // Gönderen kullanıcı
	RoomName string      `json:"roomName"` // Oda adı
	Password string      `json:"password,omitempty"` // Şifre (oda kurulurken/katılırken)
	Data     interface{} `json:"data,omitempty"` // Ekstra veri (saniye, mesaj içeriği vb.)
}

type W2GRoom struct {
	Name         string
	Password     string
	Clients      map[*websocket.Conn]string // conn -> username
	Messages     []W2GMessage
	HostUsername string
	AnimeTitle   string
	AnimeImage   string
	AnimeID      string
	IsMovie      bool
	AnimeSlug    string
}

type W2GRoomInfo struct {
	Name         string `json:"name"`
	HasPassword  bool   `json:"hasPassword"`
	UserCount    int    `json:"userCount"`
	HostUsername string `json:"hostUsername"`
	AnimeTitle   string `json:"animeTitle"`
	AnimeImage   string `json:"animeImage"`
	AnimeID      string `json:"animeId"`
	IsMovie      bool   `json:"isMovie"`
	AnimeSlug    string `json:"animeSlug"`
}

var (
	w2gRooms = make(map[string]*W2GRoom)
	w2gMu    sync.Mutex
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Geliştirme ortamı için tüm originlere izin ver
	},
}

func broadcastToRoom(roomName string, msg W2GMessage) {
	if room, exists := w2gRooms[roomName]; exists {
		for conn := range room.Clients {
			err := conn.WriteJSON(msg)
			if err != nil {
				log.Printf("W2G broadcast error to %s: %v", room.Clients[conn], err)
				conn.Close()
				delete(room.Clients, conn)
			}
		}
	}
}

func getSource(name string) (models.AnimeSource, error) {
	if name == "" {
		return sources["AnimeciX"], nil
	}
	src, ok := sources[name]
	if !ok {
		return nil, fmt.Errorf("Source not found: %s", name)
	}
	return src, nil
}

func enableCors(w *http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin != "" {
		(*w).Header().Set("Access-Control-Allow-Origin", origin)
	} else {
		(*w).Header().Set("Access-Control-Allow-Origin", "*")
	}
	(*w).Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type")
	(*w).Header().Set("Access-Control-Allow-Private-Network", "true")
}

// withRecovery wraps a handler: sets CORS headers first, then recovers from any panic
func withRecovery(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Always set CORS first — even if we panic below
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Private-Network", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Recover from any panic so the server never crashes
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("RECOVERED PANIC: %v", rec)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Fprintf(w, `{"error":"internal server error: %v"}`, rec)
			}
		}()

		handler(w, r)
	}
}

func respondJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, err error, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

// User Auth & Data System
var (
	usersFile  = "users.json"
	userDataFile = "userdata.json"
	usersMu    sync.Mutex
	userDataMu sync.Mutex
	
	activeUsers   = make(map[string]time.Time)
	activeUsersMu sync.Mutex
)

type User struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type AuthRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type UserData struct {
	History   interface{}       `json:"history"`
	Positions interface{}       `json:"positions"`
	Watched   interface{}       `json:"watched"`
	Watchlist interface{}       `json:"watchlist"`
	Favorites interface{}       `json:"favorites"`
	Notes     interface{}       `json:"notes"`
	Friends   []string          `json:"friends"`
}

func loadUsers() map[string]User {
	usersMu.Lock()
	defer usersMu.Unlock()
	users := make(map[string]User)
	data, err := os.ReadFile(usersFile)
	if err == nil {
		json.Unmarshal(data, &users)
	}
	return users
}

func saveUsers(users map[string]User) {
	usersMu.Lock()
	defer usersMu.Unlock()
	data, _ := json.MarshalIndent(users, "", "  ")
	os.WriteFile(usersFile, data, 0644)
}

func loadUserData() map[string]UserData {
	userDataMu.Lock()
	defer userDataMu.Unlock()
	dataMap := make(map[string]UserData)
	data, err := os.ReadFile(userDataFile)
	if err == nil {
		json.Unmarshal(data, &dataMap)
	}
	return dataMap
}

func saveUserData(dataMap map[string]UserData) {
	userDataMu.Lock()
	defer userDataMu.Unlock()
	data, _ := json.MarshalIndent(dataMap, "", "  ")
	os.WriteFile(userDataFile, data, 0644)
}

func cleanupActiveUsers() {
	for {
		time.Sleep(30 * time.Second)
		activeUsersMu.Lock()
		now := time.Now()
		for user, lastSeen := range activeUsers {
			if now.Sub(lastSeen) > 60*time.Second {
				delete(activeUsers, user)
			}
		}
		activeUsersMu.Unlock()
	}
}

// StartServer starts the HTTP API server
func StartServer(port string, webDir string, embeddedFS embed.FS) {
	go cleanupActiveUsers()

	// Static File Server (embedded or fallback to local)
	var staticFS http.FileSystem
	if webDir != "" {
		if _, err := os.Stat(webDir); err == nil {
			log.Printf("📂 Statik Dizin: %s\n", webDir)
			staticFS = http.Dir(webDir)
		} else {
			log.Printf("⚠️ UYARI: Statik dosya dizini bulunamadı: %s. Gömülü dosyalar kullanılacak.\n", webDir)
			subFS, err := fs.Sub(embeddedFS, "web")
			if err == nil {
				staticFS = http.FS(subFS)
			} else {
				log.Printf("⚠️ Gömülü dosyalar da yüklenemedi: %v\n", err)
			}
		}
	} else {
		log.Println("📂 Gömülü statik dosyalar kullanılıyor...")
		subFS, err := fs.Sub(embeddedFS, "web")
		if err == nil {
			staticFS = http.FS(subFS)
		}
	}

	if staticFS != nil {
		http.Handle("/", http.FileServer(staticFS))
	}

	// MAL Entegrasyonu (Jikan üzerinden)
	http.HandleFunc("/api/mal/watchlist", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		username := r.URL.Query().Get("username")
		status   := r.URL.Query().Get("status")
		if username == "" {
			respondError(w, fmt.Errorf("Kullanıcı adı gerekli"), http.StatusBadRequest)
			return
		}
		if status == "" {
			status = "watching"
		}

		list, err := jikan.GetUserAnimeList(username, status)
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}
		respondJSON(w, list)
	}))

	http.HandleFunc("/api/mal/top", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		typeParam := r.URL.Query().Get("type")
		var list []jikan.AnimeBasic
		var err error
		if typeParam == "alltime" {
			list, err = jikan.GetAllTimeTopAnime()
		} else {
			list, err = jikan.GetTopAnimeFast()
		}
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}
		respondJSON(w, list)
	}))

	http.HandleFunc("/api/mal/seasonal", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		list, err := jikan.GetSeasonalAnimeFast()
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}
		respondJSON(w, list)
	}))

	http.HandleFunc("/api/mal/genre", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		genre := r.URL.Query().Get("name")
		if genre == "" {
			respondError(w, fmt.Errorf("Genre name is required"), http.StatusBadRequest)
			return
		}

		list, err := jikan.GetAnimeByGenre(genre)
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}
		respondJSON(w, list)
	}))

	http.HandleFunc("/api/mal/recommendations", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		username := r.URL.Query().Get("username")
		if username == "" {
			respondError(w, fmt.Errorf("Kullanıcı adı gerekli"), http.StatusBadRequest)
			return
		}

		// Kullanıcının hem izliyor hem tamamladığı listeleri çek
		watched, _ := jikan.GetUserAnimeList(username, "watching")
		completed, _ := jikan.GetUserAnimeList(username, "completed")
		list := append(watched, completed...)

		if len(list) == 0 {
			respondJSON(w, []jikan.AnimeBasic{})
			return
		}

		// İzlenen anime ID'lerini topla (filtre için)
		watchedIDs := make(map[int]bool)
		for _, a := range list {
			watchedIDs[a.MalID] = true
		}

		// İlk max 12 animenin türlerini teker teker çek
		genreCounts := make(map[int]int)
		limit := 12
		if len(list) < limit {
			limit = len(list)
		}
		client := &http.Client{Timeout: 8 * time.Second}
		for i := 0; i < limit; i++ {
			animeID := list[i].MalID
			if animeID == 0 {
				continue
			}
			detailURL := fmt.Sprintf("https://api.jikan.moe/v4/anime/%d", animeID)
			req, _ := http.NewRequest("GET", detailURL, nil)
			resp, err := client.Do(req)
			if err != nil || resp.StatusCode != 200 {
				if resp != nil {
					resp.Body.Close()
				}
				time.Sleep(500 * time.Millisecond)
				continue
			}
			var detail struct {
				Data struct {
					Genres []struct {
						MalID int    `json:"mal_id"`
						Name  string `json:"name"`
					} `json:"genres"`
				} `json:"data"`
			}
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			json.Unmarshal(body, &detail)
			for _, g := range detail.Data.Genres {
				if g.MalID > 0 {
					genreCounts[g.MalID]++
				}
			}
			time.Sleep(350 * time.Millisecond) // Jikan rate limit: ~3 req/s
		}

		// En çok izlenen 3 türü bul
		type genreCount struct {
			ID    int
			Count int
		}
		var counts []genreCount
		for id, count := range genreCounts {
			counts = append(counts, genreCount{ID: id, Count: count})
		}
		// Sırala (bubble sort)
		for i := 0; i < len(counts); i++ {
			for j := i + 1; j < len(counts); j++ {
				if counts[j].Count > counts[i].Count {
					counts[i], counts[j] = counts[j], counts[i]
				}
			}
		}

		var topGenres []string
		for i := 0; i < len(counts) && i < 3; i++ {
			topGenres = append(topGenres, fmt.Sprintf("%d", counts[i].ID))
		}

		// Tür bulunamazsa popüler anime öner
		var recs []jikan.AnimeBasic
		var err error
		if len(topGenres) == 0 {
			recs, err = jikan.GetTopAnimeFast()
		} else {
			recs, err = jikan.GetRecommendationsByGenres(topGenres)
		}
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}

		// İzlenenleri filtrele
		var finalRecs []jikan.AnimeBasic
		for _, r := range recs {
			if !watchedIDs[r.MalID] {
				finalRecs = append(finalRecs, r)
			}
		}

		respondJSON(w, finalRecs)
	}))

	http.HandleFunc("/api/mal/schedule", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		schedule, err := jikan.GetSchedule()
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}
		respondJSON(w, schedule)
	}))

	// Auth Endpoints
	http.HandleFunc("/api/auth/register", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req AuthRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, err, http.StatusBadRequest)
			return
		}
		if req.Username == "" || req.Password == "" {
			respondError(w, fmt.Errorf("Kullanıcı adı ve şifre boş olamaz"), http.StatusBadRequest)
			return
		}
		users := loadUsers()
		if _, exists := users[req.Username]; exists {
			respondError(w, fmt.Errorf("Bu kullanıcı adı zaten alınmış"), http.StatusConflict)
			return
		}
		users[req.Username] = User{Username: req.Username, Password: req.Password}
		saveUsers(users)
		respondJSON(w, map[string]string{"message": "Kayıt başarılı", "username": req.Username})
	}))

	http.HandleFunc("/api/auth/login", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req AuthRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, err, http.StatusBadRequest)
			return
		}
		users := loadUsers()
		user, exists := users[req.Username]
		if !exists || user.Password != req.Password {
			respondError(w, fmt.Errorf("Geçersiz kullanıcı adı veya şifre"), http.StatusUnauthorized)
			return
		}
		respondJSON(w, map[string]string{"message": "Giriş başarılı", "username": user.Username})
	}))

	http.HandleFunc("/api/user/data", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		username := r.URL.Query().Get("username")
		if username == "" {
			respondError(w, fmt.Errorf("Username required"), http.StatusBadRequest)
			return
		}

		if r.Method == "GET" {
			dataMap := loadUserData()
			userData, exists := dataMap[username]
			if !exists {
				userData = UserData{}
			}
			respondJSON(w, userData)
			return
		} else if r.Method == "POST" {
			var req UserData
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				respondError(w, err, http.StatusBadRequest)
				return
			}
			dataMap := loadUserData()
			dataMap[username] = req
			saveUserData(dataMap)
			respondJSON(w, map[string]string{"message": "Data saved"})
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}))

	http.HandleFunc("/api/user/ping", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		username := r.URL.Query().Get("username")
		if username == "" {
			username = "unknown_" + r.RemoteAddr
		}

		activeUsersMu.Lock()
		activeUsers[username] = time.Now()
		
		var userList []string
		for name := range activeUsers {
			userList = append(userList, name)
		}
		count := len(userList)
		activeUsersMu.Unlock()

		respondJSON(w, map[string]interface{}{
			"active_users": count,
			"users":        userList,
		})
	}))

	// API Endpoints - all wrapped in withRecovery for panic safety + guaranteed CORS
	http.HandleFunc("/api/proxy", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		target := r.URL.Query().Get("url")
		if target == "" {
			http.Error(w, "missing url", http.StatusBadRequest)
			return
		}
		
		req, err := http.NewRequest("GET", target, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		
		// Set dynamic Referer based on target URL
		referer := "https://animecix.net/"
		if strings.Contains(target, "anizium") || strings.Contains(target, "aniziumserver") {
			referer = "https://anizium.com/"
		}
		
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
		req.Header.Set("Referer", referer)
		req.Header.Set("Origin", strings.TrimSuffix(referer, "/"))
		
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		
		// Copy content type
		if cType := resp.Header.Get("Content-Type"); cType != "" {
			w.Header().Set("Content-Type", cType)
		}
		
		io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/sources", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		var names []string
		for k := range sources {
			names = append(names, k)
		}
		respondJSON(w, names)
	}))

	http.HandleFunc("/api/popular", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		page := r.URL.Query().Get("page")
		if page == "" {
			page = "1"
		}
		jikanURL := "https://api.jikan.moe/v4/top/anime?limit=24&filter=bypopularity&page=" + page
		resp, err := http.Get(jikanURL)
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()
		
		if resp.StatusCode != http.StatusOK {
			// Handle rate limits (429) or other errors by returning an empty list
			respondJSON(w, map[string]interface{}{"data": []interface{}{}})
			return
		}

		var result interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		respondJSON(w, result)
	}))

	http.HandleFunc("/api/discover", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("API: %s %s", r.Method, r.URL.String())
		pageStr := r.URL.Query().Get("page")
		if pageStr == "" {
			pageStr = "1"
		}
		srcName := r.URL.Query().Get("source")

		src, err := getSource(srcName)
		if err != nil {
			respondError(w, err, http.StatusBadRequest)
			return
		}

		// Kaynak bazlı keşif mantığı
		var results []models.Anime
		discoverQueries := []string{"a", "naruto", "one piece", "bleach", "attack"}
		for _, query := range discoverQueries {
			results, err = src.GetSearchData(query)
			if err == nil && len(results) > 0 {
				break
			}
		}

		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}
		respondJSON(w, results)
	}))

	http.HandleFunc("/api/search", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("API: %s %s", r.Method, r.URL.String())
		q := r.URL.Query().Get("q")
		srcName := r.URL.Query().Get("source")

		src, err := getSource(srcName)
		if err != nil {
			respondError(w, err, http.StatusBadRequest)
			return
		}

		results, err := src.GetSearchData(q)
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}
		respondJSON(w, results)
	}))

	http.HandleFunc("/api/anime", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		srcName := r.URL.Query().Get("source")

		src, err := getSource(srcName)
		if err != nil {
			respondError(w, err, http.StatusBadRequest)
			return
		}

		anime, err := src.GetAnimeByID(id)
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}

		respondJSON(w, anime)
	}))

	http.HandleFunc("/api/seasons", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		idStr := r.URL.Query().Get("id")
		slug := r.URL.Query().Get("slug")
		srcName := r.URL.Query().Get("source")

		src, err := getSource(srcName)
		if err != nil {
			respondError(w, err, http.StatusBadRequest)
			return
		}

		var params models.SeasonParams
		if slug != "" {
			params.Slug = &slug
		}
		if idStr != "" {
			var id int
			fmt.Sscanf(idStr, "%d", &id)
			params.Id = &id
		}

		seasons, err := src.GetSeasonsData(params)
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}
		respondJSON(w, seasons)
	}))

	http.HandleFunc("/api/episodes", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		idStr := r.URL.Query().Get("id")
		seasonIdStr  := r.URL.Query().Get("season_id")
		seasonNumStr := r.URL.Query().Get("season_num")
		slug := r.URL.Query().Get("slug")
		srcName := r.URL.Query().Get("source")

		src, err := getSource(srcName)
		if err != nil {
			respondError(w, err, http.StatusBadRequest)
			return
		}

		var params models.EpisodeParams
		if slug != "" {
			params.Slug = &slug
		}
		if seasonIdStr == "" && idStr != "" {
			seasonIdStr = idStr
		}
		if seasonIdStr != "" {
			var sid int
			fmt.Sscanf(seasonIdStr, "%d", &sid)
			params.SeasonID = &sid
		}
		if seasonNumStr != "" {
			var sn int
			fmt.Sscanf(seasonNumStr, "%d", &sn)
			params.SeasonNum = &sn
		}

		eps, err := src.GetEpisodesData(params)
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}
		respondJSON(w, eps)
	}))

	http.HandleFunc("/api/watch", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		url := r.URL.Query().Get("url")
		slug := r.URL.Query().Get("slug")
		idStr := r.URL.Query().Get("id")
		isMovieStr := r.URL.Query().Get("is_movie")
		srcName := r.URL.Query().Get("source")

		src, err := getSource(srcName)
		if err != nil {
			respondError(w, err, http.StatusBadRequest)
			return
		}

		var params models.WatchParams
		if url != "" {
			params.Url = &url
		}
		if slug != "" {
			params.Slug = &slug
		}
		if idStr != "" {
			var id int
			fmt.Sscanf(idStr, "%d", &id)
			params.Id = &id
		}
		if isMovieStr != "" {
			isM := isMovieStr == "true"
			params.IsMovie = &isM
		}

		// Extra params for subtitle fetching
		extra := make(map[string]interface{})
		sIdx, eIdx := 0, 0
		if s := r.URL.Query().Get("season_index"); s != "" {
			fmt.Sscanf(s, "%d", &sIdx)
		}
		if e := r.URL.Query().Get("episode_index"); e != "" {
			fmt.Sscanf(e, "%d", &eIdx)
		}
		extra["seasonIndex"] = sIdx
		extra["episodeIndex"] = eIdx
		if sound := r.URL.Query().Get("sound"); sound != "" {
			extra["sound"] = sound
		}
		params.Extra = &extra

		watchData, err := src.GetWatchData(params)
		if err != nil {
			respondError(w, err, http.StatusInternalServerError)
			return
		}
		respondJSON(w, watchData)
	}))

	// ── Users & Friends ─────────────────────────────────────────
	http.HandleFunc("/api/users", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		requester := r.URL.Query().Get("username")
		dataMap := loadUserData()

		var users []string
		for user := range dataMap {
			if user != requester { // Kendisini gösterme
				users = append(users, user)
			}
		}

		// Also check users.json (the auth file) to include registered users who haven't saved any data yet
		authUsers := loadUsers()
		for user := range authUsers {
			if user != requester {
				found := false
				for _, u := range users {
					if u == user {
						found = true
						break
					}
				}
				if !found {
					users = append(users, user)
				}
			}
		}

		respondJSON(w, users)
	}))

	http.HandleFunc("/api/friends/add", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			respondError(w, fmt.Errorf("Sadece POST desteklenir"), http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Username string `json:"username"`
			Friend   string `json:"friend"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, err, http.StatusBadRequest)
			return
		}

		dataMap := loadUserData()
		userData, exists := dataMap[req.Username]
		if !exists {
			userData = UserData{}
		}

		// Check if already friends
		alreadyFriend := false
		for _, f := range userData.Friends {
			if f == req.Friend {
				alreadyFriend = true
				break
			}
		}
		if !alreadyFriend {
			userData.Friends = append(userData.Friends, req.Friend)
			dataMap[req.Username] = userData
			saveUserData(dataMap)
		}

		respondJSON(w, map[string]string{"status": "success"})
	}))

	http.HandleFunc("/api/friends/remove", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			respondError(w, fmt.Errorf("Sadece POST desteklenir"), http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Username string `json:"username"`
			Friend   string `json:"friend"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, err, http.StatusBadRequest)
			return
		}

		dataMap := loadUserData()
		userData, exists := dataMap[req.Username]
		if exists {
			newFriends := []string{}
			for _, f := range userData.Friends {
				if f != req.Friend {
					newFriends = append(newFriends, f)
				}
			}
			userData.Friends = newFriends
			dataMap[req.Username] = userData
			saveUserData(dataMap)
		}

		respondJSON(w, map[string]string{"status": "success"})
	}))

	// ── Get list of W2G rooms ───────────────────────────────────
	http.HandleFunc("/api/w2g/rooms", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		w2gMu.Lock()
		var rooms []W2GRoomInfo
		for _, room := range w2gRooms {
			rooms = append(rooms, W2GRoomInfo{
				Name:         room.Name,
				HasPassword:  room.Password != "",
				UserCount:    len(room.Clients),
				HostUsername: room.HostUsername,
				AnimeTitle:   room.AnimeTitle,
				AnimeImage:   room.AnimeImage,
				AnimeID:      room.AnimeID,
				IsMovie:      room.IsMovie,
				AnimeSlug:    room.AnimeSlug,
			})
		}
		w2gMu.Unlock()
		respondJSON(w, map[string]interface{}{"rooms": rooms})
	}))

	// ── Watch2Gether WebSocket Handler ────────────────────────
	http.HandleFunc("/api/w2g/join", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("W2G: New connection attempt")
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("W2G upgrade error: %v", err)
			return
		}
		defer func() {
			conn.Close()
			w2gMu.Lock()
			for _, room := range w2gRooms {
				if username, ok := room.Clients[conn]; ok {
					delete(room.Clients, conn)
					broadcastToRoom(room.Name, W2GMessage{
						Type:     "leave",
						Username: username,
						RoomName: room.Name,
						Data:     fmt.Sprintf("%s odadan ayrıldı", username),
					})
				}
			}
			w2gMu.Unlock()
		}()

		for {
			var msg W2GMessage
			err := conn.ReadJSON(&msg)
			if err != nil {
				log.Printf("W2G read error: %v", err)
				return
			}
			log.Printf("W2G received: %v from %s (room: %s)", msg.Type, msg.Username, msg.RoomName)

			w2gMu.Lock()
			switch msg.Type {
			case "create":
				if _, exists := w2gRooms[msg.RoomName]; exists {
					conn.WriteJSON(W2GMessage{Type: "error", Data: "Bu isimde bir oda zaten var"})
					w2gMu.Unlock()
					continue
				}
				// Parse anime info from data if available
				var animeTitle, animeImage, animeID, animeSlug string
				var isMovie bool
				if msg.Data != nil {
					if dataMap, ok := msg.Data.(map[string]interface{}); ok {
						if title, ok := dataMap["animeTitle"].(string); ok {
							animeTitle = title
						}
						if image, ok := dataMap["animeImage"].(string); ok {
							animeImage = image
						}
						if id, ok := dataMap["animeId"].(string); ok {
							animeID = id
						}
						if slug, ok := dataMap["animeSlug"].(string); ok {
							animeSlug = slug
						}
						if movie, ok := dataMap["isMovie"].(bool); ok {
							isMovie = movie
						}
					}
				}
				w2gRooms[msg.RoomName] = &W2GRoom{
					Name:         msg.RoomName,
					Password:     msg.Password,
					Clients:      map[*websocket.Conn]string{conn: msg.Username},
					Messages:     []W2GMessage{},
					HostUsername: msg.Username,
					AnimeTitle:   animeTitle,
					AnimeImage:   animeImage,
					AnimeID:      animeID,
					IsMovie:      isMovie,
					AnimeSlug:    animeSlug,
				}
				broadcastToRoom(msg.RoomName, W2GMessage{
					Type:     "join",
					Username: msg.Username,
					RoomName: msg.RoomName,
					Data:     fmt.Sprintf("%s odaya katıldı", msg.Username),
				})
				conn.WriteJSON(W2GMessage{Type: "joined", RoomName: msg.RoomName, Data: w2gRooms[msg.RoomName].Messages})
			case "join":
				room, exists := w2gRooms[msg.RoomName]
				if !exists {
					conn.WriteJSON(W2GMessage{Type: "error", Data: "Oda bulunamadı"})
					w2gMu.Unlock()
					continue
				}
				if room.Password != msg.Password {
					conn.WriteJSON(W2GMessage{Type: "error", Data: "Yanlış şifre"})
					w2gMu.Unlock()
					continue
				}
				room.Clients[conn] = msg.Username
				broadcastToRoom(msg.RoomName, W2GMessage{
					Type:     "join",
					Username: msg.Username,
					RoomName: msg.RoomName,
					Data:     fmt.Sprintf("%s odaya katıldı", msg.Username),
				})
				conn.WriteJSON(W2GMessage{Type: "joined", RoomName: msg.RoomName, Data: room.Messages})
			case "chat", "play", "pause", "seek":
				room, exists := w2gRooms[msg.RoomName]
				if !exists {
					conn.WriteJSON(W2GMessage{Type: "error", Data: "Oda bulunamadı"})
					w2gMu.Unlock()
					continue
				}
				if msg.Type == "chat" {
					room.Messages = append(room.Messages, msg)
				}
				broadcastToRoom(msg.RoomName, msg)
			}
			w2gMu.Unlock()
		}
	}))

	addr := ":" + port
	fmt.Printf("Starting web server on http://localhost%s\n", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
