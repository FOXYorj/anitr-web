package jikan

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
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
	Score  float64 `json:"score"`
	Year   int     `json:"year"`
	Aired  struct {
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

// GetUserAnimeList fetches any status of a user's anime list via Jikan v4 API
// status can be: watching, completed, onhold, dropped, plantowatch
func GetUserAnimeList(username string, status string) ([]AnimeBasic, error) {
	if status == "" {
		status = "watching"
	}

	var allAnimes []AnimeBasic
	client := &http.Client{Timeout: 15 * time.Second}
	page := 1

	for {
		// Jikan v4 limit max 25
		apiURL := fmt.Sprintf("https://api.jikan.moe/v4/users/%s/animelist?status=%s&limit=25&page=%d", username, status, page)
		req, err := http.NewRequest("GET", apiURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "anitr-web/1.0")

		resp, err := client.Do(req)
		if err != nil {
			if page == 1 {
				return nil, fmt.Errorf("Jikan API'ye bağlanılamadı: %v", err)
			}
			break
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			if page == 1 {
				return nil, err
			}
			break
		}

		// 429 Rate Limit — bekle ve tekrar dene
		if resp.StatusCode == 429 {
			time.Sleep(1500 * time.Millisecond)
			continue
		}

		if resp.StatusCode == http.StatusNotFound {
			// Jikan API, kullanıcı bulunamayınca veya o kategoride hiç anime yoksa 404 döndürüyor
			if page == 1 {
				return []AnimeBasic{}, nil
			}
			break
		}
		if resp.StatusCode == 403 || resp.StatusCode == 401 {
			return nil, fmt.Errorf("Bu kullanıcının listesi gizli: %s", username)
		}
		if resp.StatusCode != http.StatusOK {
			if page == 1 {
				return nil, fmt.Errorf("Jikan API hatası (HTTP %d)", resp.StatusCode)
			}
			break
		}

		// Jikan v4 gerçek format: { data: [ { anime: { mal_id, title, images, ... }, ... } ], pagination: {...} }
		var jikanResp struct {
			Data []struct {
				Anime struct {
					MalID  int    `json:"mal_id"`
					Title  string `json:"title"`
					Images struct {
						JPG struct {
							ImageURL      string `json:"image_url"`
							LargeImageURL string `json:"large_image_url"`
						} `json:"jpg"`
					} `json:"images"`
					Score  float64 `json:"score"`
					Genres []struct {
						MalID int    `json:"mal_id"`
						Name  string `json:"name"`
					} `json:"genres"`
				} `json:"anime"`
				Score          int `json:"score"`
				EpisodesWatched int `json:"episodes_watched"`
			} `json:"data"`
			Pagination struct {
				HasNextPage bool `json:"has_next_page"`
			} `json:"pagination"`
		}

		if err := json.Unmarshal(body, &jikanResp); err != nil {
			if page == 1 {
				return nil, fmt.Errorf("JSON çözümlenemedi: %v", err)
			}
			break
		}

		for _, item := range jikanResp.Data {
			a := item.Anime
			img := a.Images.JPG.LargeImageURL
			if img == "" {
				img = a.Images.JPG.ImageURL
			}

			var genres []struct {
				MalID int    `json:"mal_id"`
				Name  string `json:"name"`
			}
			for _, g := range a.Genres {
				genres = append(genres, struct {
					MalID int    `json:"mal_id"`
					Name  string `json:"name"`
				}{MalID: g.MalID, Name: g.Name})
			}

			score := float64(item.Score)
			if score == 0 {
				score = a.Score
			}

			allAnimes = append(allAnimes, AnimeBasic{
				MalID:  a.MalID,
				Title:  a.Title,
				Score:  score,
				Images: a.Images,
				Genres: genres,
			})
		}

		if !jikanResp.Pagination.HasNextPage {
			break
		}

		page++
		time.Sleep(500 * time.Millisecond) // Jikan rate limit
	}

	return allAnimes, nil
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
