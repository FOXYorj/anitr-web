package jikan

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type AnimeBasic struct {
	MalID        int     `json:"mal_id"`
	Title        string  `json:"title"`
	TitleEnglish string  `json:"title_english"`
	Titles       []struct {
		Type  string `json:"type"`
		Title string `json:"title"`
	} `json:"titles"`
	Images struct {
		JPG struct {
			ImageURL      string `json:"image_url"`
			LargeImageURL string `json:"large_image_url"`
		} `json:"jpg"`
	} `json:"images"`
	Score           float64 `json:"score"`
	Year            int     `json:"year"`
	WatchedEpisodes int     `json:"num_watched_episodes,omitempty"`
	TotalEpisodes   int     `json:"anime_num_episodes,omitempty"`
	MediaType       string  `json:"anime_media_type_string,omitempty"`
	ListStatus      int     `json:"list_status,omitempty"`
	Aired           struct {
		From string `json:"from"`
	} `json:"aired"`
	Genres []struct {
		MalID int    `json:"mal_id"`
		Name  string `json:"name"`
	} `json:"genres"`
	Broadcast struct {
		Day  string `json:"day"`
		Time string `json:"time"`
	} `json:"broadcast,omitempty"`
	Trailer struct {
		YoutubeID string `json:"youtube_id"`
	} `json:"trailer"`
}

type AnimeListResponse struct {
	Data       []AnimeBasic `json:"data"`
	Pagination struct {
		HasNextPage bool `json:"has_next_page"`
	} `json:"pagination"`
}

type UserWatchlistResponse struct {
	Data []struct {
		Anime AnimeBasic `json:"anime"`
	} `json:"data"`
}

func fetchAnimeListMultiPage(apiURLBase string, maxPages int) ([]AnimeBasic, error) {
	var allAnimes []AnimeBasic
	client := &http.Client{Timeout: 10 * time.Second}

	for page := 1; page <= maxPages; page++ {
		apiURL := fmt.Sprintf("%s&page=%d", apiURLBase, page)
		resp, err := client.Get(apiURL)
		if err != nil {
			if page == 1 {
				return nil, err
			}
			break
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			if page == 1 {
				return nil, fmt.Errorf("jikan API error: %s", resp.Status)
			}
			break
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			break
		}

		var listResp AnimeListResponse
		if err := json.Unmarshal(body, &listResp); err != nil {
			break
		}

		allAnimes = append(allAnimes, listResp.Data...)

		if !listResp.Pagination.HasNextPage {
			break
		}

		if page < maxPages {
			time.Sleep(400 * time.Millisecond)
		}
	}

	return allAnimes, nil
}

// GetTopAnime fetches the current top anime
func GetTopAnime() ([]AnimeBasic, error) {
	return fetchAnimeListMultiPage("https://api.jikan.moe/v4/top/anime?limit=25", 4) // 100 anime
}

// GetTopAnimeFast fetches only the first page for web performance
func GetTopAnimeFast() ([]AnimeBasic, error) {
	return fetchAnimeListMultiPage("https://api.jikan.moe/v4/top/anime?limit=25", 1) // 25 anime
}

// GetSeasonalAnime fetches the currently airing seasonal anime
func GetSeasonalAnime() ([]AnimeBasic, error) {
	return fetchAnimeListMultiPage("https://api.jikan.moe/v4/seasons/now?limit=25", 8) // max 200 anime
}

// GetSeasonalAnimeFast fetches only the first page for web performance
func GetSeasonalAnimeFast() ([]AnimeBasic, error) {
	return fetchAnimeListMultiPage("https://api.jikan.moe/v4/seasons/now?limit=25", 1) // 25 anime
}

// GetAllTimeTopAnime fetches the highest rated anime of all time
func GetAllTimeTopAnime() ([]AnimeBasic, error) {
	return fetchAnimeListMultiPage("https://api.jikan.moe/v4/top/anime?type=tv&filter=bypopularity&limit=25", 1)
}

// GetRecommendationsByGenres fetches anime by genres ordered by score
func GetRecommendationsByGenres(genres []string) ([]AnimeBasic, error) {
	if len(genres) == 0 {
		return []AnimeBasic{}, nil
	}
	// Join genres with commas
	genreStr := strings.Join(genres, ",")
	url := fmt.Sprintf("https://api.jikan.moe/v4/anime?genres=%s&order_by=score&sort=desc&limit=25", genreStr)
	return fetchAnimeListMultiPage(url, 1)
}

// Genre name to ID mapping (from Jikan API docs)
var genreNameToID = map[string]int{
	"Action":         1,
	"Adventure":      2,
	"Cars":           3,
	"Comedy":         4,
	"Dementia":       5,
	"Demons":         6,
	"Mystery":        7,
	"Drama":          8,
	"Ecchi":          9,
	"Fantasy":        10,
	"Game":           11,
	"Hentai":         12,
	"Historical":     13,
	"Horror":         14,
	"Kids":           15,
	"Magic":          16,
	"Martial Arts":   17,
	"Mecha":          18,
	"Music":          19,
	"Parody":         20,
	"Samurai":        21,
	"Romance":        22,
	"School":         23,
	"Sci-Fi":         24,
	"Shoujo":         25,
	"Shoujo Ai":      26,
	"Shounen":        27,
	"Shounen Ai":     28,
	"Space":          29,
	"Sports":         30,
	"Super Power":    31,
	"Vampire":        32,
	"Yaoi":           33,
	"Yuri":           34,
	"Harem":          35,
	"Slice of Life":  36,
	"Supernatural":   37,
	"Military":       38,
	"Police":         39,
	"Psychological":  40,
	"Thriller":       41,
	"Seinen":         42,
	"Josei":          43,
}

// GetAnimeByGenre fetches anime by a single genre name
func GetAnimeByGenre(genreName string) ([]AnimeBasic, error) {
	genreID, exists := genreNameToID[genreName]
	if !exists {
		return []AnimeBasic{}, nil
	}
	url := fmt.Sprintf("https://api.jikan.moe/v4/anime?genres=%d&order_by=score&sort=desc&limit=25", genreID)
	return fetchAnimeListMultiPage(url, 1)
}

// GetUserWatchlist fetches the "Watching" list for a specific MAL user
type MALItem struct {
	AnimeTitle        string  `json:"anime_title"`
	AnimeID           int     `json:"anime_id"`
	AnimeScoreVal     float64 `json:"anime_score_val"`
	AnimeStartDateStr string  `json:"anime_start_date_string"`
	Genres            []struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	} `json:"genres"`
}

// GetUserWatchlist fetches the anime list for a MAL user via Jikan v4 API (status=watching)
func GetUserWatchlist(username string) ([]AnimeBasic, error) {
	return GetUserAnimeList(username, "watching")
}


var (
	userProfileCache   = make(map[string]cachedUserProfile)
	userProfileCacheMu sync.RWMutex
)

type cachedUserProfile struct {
	Data      map[string]interface{}
	FetchedAt time.Time
}

// GetUserProfile fetches the full user profile, anime statistics, and favorites from Jikan v4 API.
func GetUserProfile(username string) (map[string]interface{}, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, fmt.Errorf("kullanıcı adı boş olamaz")
	}

	key := strings.ToLower(username)
	userProfileCacheMu.RLock()
	if cached, ok := userProfileCache[key]; ok && time.Since(cached.FetchedAt) < 5*time.Minute {
		userProfileCacheMu.RUnlock()
		return cached.Data, nil
	}
	userProfileCacheMu.RUnlock()

	client := &http.Client{Timeout: 12 * time.Second}
	apiURL := fmt.Sprintf("https://api.jikan.moe/v4/users/%s/full", url.PathEscape(username))

	var resp *http.Response
	var err error
	for attempt := 0; attempt < 2; attempt++ {
		req, _ := http.NewRequest("GET", apiURL, nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
		resp, err = client.Do(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode == http.StatusTooManyRequests {
			resp.Body.Close()
			time.Sleep(1100 * time.Millisecond)
			continue
		}
		break
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("MyAnimeList kullanıcısı bulunamadı: %s", username)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Jikan profil hatası (HTTP %d)", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var raw struct {
		Data map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(body, &raw); err != nil || raw.Data == nil {
		return nil, fmt.Errorf("Profil verisi çözümlenemedi")
	}

	userProfileCacheMu.Lock()
	userProfileCache[key] = cachedUserProfile{
		Data:      raw.Data,
		FetchedAt: time.Now(),
	}
	userProfileCacheMu.Unlock()

	return raw.Data, nil
}

// GetUserAnimeList fetches any status of a user's anime list directly from MyAnimeList
// username: MAL username
// status: watching, completed, onhold, dropped, plantowatch, all
func GetUserAnimeList(username string, status string) ([]AnimeBasic, error) {
	if username == "" {
		return nil, fmt.Errorf("kullanıcı adı boş olamaz")
	}

	// Map status from string format to MAL internal status ID
	malStatusMap := map[string]int{
		"watching":      1,
		"completed":     2,
		"onhold":        3,
		"on_hold":       3,
		"dropped":       4,
		"plantowatch":   6,
		"plan_to_watch": 6,
		"all":           7,
	}

	statusID, ok := malStatusMap[strings.ToLower(status)]
	if !ok {
		statusID = 1 // Default to watching
	}

	results := []AnimeBasic{}
	client := &http.Client{Timeout: 15 * time.Second}
	offset := 0

	for {
		// MAL internal API allows fetching up to 300 items per request
		reqURL := fmt.Sprintf("https://myanimelist.net/animelist/%s/load.json?offset=%d&status=%d", url.PathEscape(username), offset, statusID)

		req, err := http.NewRequest("GET", reqURL, nil)
		if err != nil {
			return nil, fmt.Errorf("istek oluşturulamadı: %v", err)
		}
		// Mimic browser to prevent being blocked by Cloudflare/MAL
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

		resp, err := client.Do(req)
		if err != nil {
			if offset == 0 {
				return nil, fmt.Errorf("MyAnimeList'e bağlanılamadı: %v", err)
			}
			break
		}

		if resp.StatusCode == 404 || resp.StatusCode == 400 {
			resp.Body.Close()
			if offset == 0 {
				return nil, fmt.Errorf("Kullanıcı bulunamadı veya liste gizli: %s", username)
			}
			break
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			if offset == 0 {
				return nil, fmt.Errorf("MAL hatası (HTTP %d)", resp.StatusCode)
			}
			break
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			break
		}

		// MAL's load.json returns an array directly (anime_title can occasionally be numeric like 86)
		var malData []struct {
			AnimeID            int         `json:"anime_id"`
			AnimeTitle         interface{} `json:"anime_title"`
			AnimeTitleEng      interface{} `json:"anime_title_eng"`
			AnimeImagePath     string      `json:"anime_image_path"`
			Score              float64     `json:"score"`
			NumWatchedEpisodes int         `json:"num_watched_episodes"`
			AnimeNumEpisodes   int         `json:"anime_num_episodes"`
			AnimeMediaTypeStr  string      `json:"anime_media_type_string"`
			Status             int         `json:"status"`
		}

		if err := json.Unmarshal(body, &malData); err != nil {
			if offset == 0 {
				return nil, fmt.Errorf("Veri çözümlenemedi (Geçersiz format)")
			}
			break
		}

		// If no items returned, we've reached the end
		if len(malData) == 0 {
			break
		}

		for _, item := range malData {
			titleStr := fmt.Sprintf("%v", item.AnimeTitle)
			titleEngStr := ""
			if item.AnimeTitleEng != nil {
				titleEngStr = fmt.Sprintf("%v", item.AnimeTitleEng)
			}
			a := AnimeBasic{
				MalID:           item.AnimeID,
				Title:           titleStr,
				TitleEnglish:    titleEngStr,
				Score:           item.Score,
				WatchedEpisodes: item.NumWatchedEpisodes,
				TotalEpisodes:   item.AnimeNumEpisodes,
				MediaType:       item.AnimeMediaTypeStr,
				ListStatus:      item.Status,
			}
			// Map image
			img := item.AnimeImagePath
			if strings.Contains(img, "/r/") {
				parts := strings.Split(img, "/images/")
				if len(parts) == 2 {
					img = "https://cdn.myanimelist.net/images/" + parts[1]
				}
			}
			if idx := strings.Index(img, "?"); idx != -1 {
				img = img[:idx]
			}

			a.Images.JPG.ImageURL = img
			a.Images.JPG.LargeImageURL = img

			results = append(results, a)
		}

		// Pagination: MAL returns max 300 per page
		if len(malData) < 300 || offset >= 600 {
			break
		}
		offset += 300
		time.Sleep(350 * time.Millisecond)
	}

	return results, nil
}

// CleanTitle removes common tags and punctuation that prevent accurate matching.
func CleanTitle(title string) string {
	t := strings.ToLower(title)
	t = strings.ReplaceAll(t, " (tv)", "")
	t = strings.ReplaceAll(t, " (dub)", "")
	t = strings.ReplaceAll(t, " (sub)", "")
	
	// Remove all punctuation
	punctuation := []string{":", "-", "!", "?", ".", ",", ";", "'", "\""}
	for _, p := range punctuation {
		t = strings.ReplaceAll(t, p, " ")
	}

	// Collapse multiple spaces into one
	fields := strings.Fields(t)
	return strings.Join(fields, " ")
}

// MatchAnimeTitle tries to find the best match for a source title in Jikan API results.
func MatchAnimeTitle(sourceTitle string, jikanResults []AnimeBasic) *AnimeBasic {
	cleanSource := CleanTitle(sourceTitle)

	// 1. Exact or cleaned exact match
	for _, j := range jikanResults {
		if CleanTitle(j.Title) == cleanSource || CleanTitle(j.TitleEnglish) == cleanSource {
			return &j
		}
		for _, alt := range j.Titles {
			if CleanTitle(alt.Title) == cleanSource {
				return &j
			}
		}
	}

	// 2. Partial match (contains)
	for _, j := range jikanResults {
		cleanJ := CleanTitle(j.Title)
		cleanEng := CleanTitle(j.TitleEnglish)
		
		if (cleanJ != "" && (strings.Contains(cleanSource, cleanJ) || strings.Contains(cleanJ, cleanSource))) || 
		   (cleanEng != "" && (strings.Contains(cleanSource, cleanEng) || strings.Contains(cleanEng, cleanSource))) {
			return &j
		}
	}

	return nil
}

// GetSchedule fetches the currently airing anime schedule from Jikan API.
func GetSchedule() ([]AnimeBasic, error) {
	apiURL := "https://api.jikan.moe/v4/schedules?filter=unknown"
	
	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", apiURL, nil)
	
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Jikan API error (HTTP %d)", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var jikanResp struct {
		Data []struct {
			MalID  int    `json:"mal_id"`
			Title  string `json:"title"`
			Images struct {
				JPG struct {
					ImageURL      string `json:"image_url"`
					LargeImageURL string `json:"large_image_url"`
				} `json:"jpg"`
			} `json:"images"`
			Score     float64 `json:"score"`
			Broadcast struct {
				Day string `json:"day"`
			} `json:"broadcast"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &jikanResp); err != nil {
		return nil, err
	}

	var result []AnimeBasic
	for _, item := range jikanResp.Data {
		img := item.Images.JPG.LargeImageURL
		if img == "" {
			img = item.Images.JPG.ImageURL
		}
		
		result = append(result, AnimeBasic{
			MalID: item.MalID,
			Title: item.Title,
			Score: item.Score,
			Images: item.Images,
			Broadcast: struct {
				Day  string `json:"day"`
				Time string `json:"time"`
			}{Day: item.Broadcast.Day},
		})
	}
	
	return result, nil
}
