package anihub

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/prayjofir/anitr-cli/internal/models"
)

const (
	apiBaseURL   = "https://api.anihub.com.tr/v1"
	mediaBaseURL = "https://media.anihub.com.tr"
	siteOrigin   = "https://anihub.com.tr"
	userAgent    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

var (
	httpClient = &http.Client{Timeout: 15 * time.Second}

	slugMapMu sync.RWMutex
	idToSlug  = make(map[int]string)

	catalogMu      sync.Mutex
	cachedCatalog  []CatalogItem
	catalogFetched time.Time
)

type AniHub struct{}

func (a AniHub) Source() string {
	return "AniHub"
}

type CatalogItem struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Slug          string   `json:"slug"`
	Description   string   `json:"description"`
	Year          int      `json:"year"`
	Genres        []string `json:"genres"`
	PosterKey     string   `json:"posterKey"`
	ContentType   string   `json:"contentType"`
	Studio        string   `json:"studio"`
	Status        string   `json:"status"`
	TotalEpisodes int      `json:"totalEpisodes"`
	VideoQuality  string   `json:"videoQuality"`
	HasTurkishDub bool     `json:"hasTurkishDub"`
	PosterURL     string   `json:"poster"`
	NumericID     int      `json:"numericId"`
}

func slugToID(slug string) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(strings.ToLower(strings.TrimSpace(slug))))
	id := int(h.Sum32() & 0x7fffffff)
	if id == 0 {
		id = 1
	}
	slugMapMu.Lock()
	idToSlug[id] = slug
	slugMapMu.Unlock()
	return id
}

func resolveSlug(idPtr *int, slugPtr *string) string {
	if slugPtr != nil {
		s := strings.TrimSpace(*slugPtr)
		if s != "" && s != "null" && s != "undefined" {
			return s
		}
	}
	if idPtr != nil && *idPtr > 0 {
		slugMapMu.RLock()
		s := idToSlug[*idPtr]
		slugMapMu.RUnlock()
		if s != "" {
			return s
		}
	}
	return ""
}

func posterKeyToURL(posterKey string) string {
	pk := strings.TrimSpace(posterKey)
	if pk == "" {
		return ""
	}
	if strings.HasPrefix(pk, "http://") || strings.HasPrefix(pk, "https://") {
		return pk
	}
	pk = strings.TrimLeft(pk, "/")
	return fmt.Sprintf("%s/%s?w=750&v=og1", mediaBaseURL, pk)
}

func doAPIRequest(method, path string, bodyObj interface{}, out interface{}) error {
	var bodyReader io.Reader
	if bodyObj != nil {
		b, err := json.Marshal(bodyObj)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(b)
	}

	target := apiBaseURL + path
	req, err := http.NewRequest(method, target, bodyReader)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Origin", siteOrigin)
	req.Header.Set("Referer", siteOrigin+"/")
	if bodyObj != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("AniHub API HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

func toModelAnime(item CatalogItem) models.Anime {
	numID := slugToID(item.Slug)
	slug := item.Slug
	isMovie := strings.EqualFold(item.ContentType, "movie")
	titleType := "series"
	if isMovie {
		titleType = "movie"
	}
	return models.Anime{
		ID:        &numID,
		Title:     item.Title,
		Slug:      &slug,
		Type:      &titleType,
		TitleType: &titleType,
		ImageURL:  posterKeyToURL(item.PosterKey),
		Synopsis:  item.Description,
		Source:    "AniHub",
		Extra: map[string]interface{}{
			"isMovie":     isMovie,
			"releaseYear": item.Year,
			"genres":      item.Genres,
			"studio":      item.Studio,
			"quality":     item.VideoQuality,
		},
	}
}

// FetchCatalogPage returns paginated or searched catalog items for /api/anihub-catalog
func FetchCatalogPage(page int, limit int, search string) ([]CatalogItem, int, bool, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 30
	}

	q := strings.TrimSpace(search)
	if q != "" {
		var sugResp struct {
			Success bool `json:"success"`
			Data    struct {
				Items []CatalogItem `json:"items"`
			} `json:"data"`
		}
		err := doAPIRequest("GET", "/catalog/suggestions?q="+url.QueryEscape(q), nil, &sugResp)
		var items []CatalogItem
		seen := make(map[string]bool)
		if err == nil {
			for _, it := range sugResp.Data.Items {
				if it.Slug == "" || seen[it.Slug] {
					continue
				}
				seen[it.Slug] = true
				it.PosterURL = posterKeyToURL(it.PosterKey)
				it.NumericID = slugToID(it.Slug)
				items = append(items, it)
			}
		}

		// Also check /animes?q= for broader matches
		var listResp struct {
			Success bool `json:"success"`
			Data    struct {
				Items []CatalogItem `json:"items"`
			} `json:"data"`
		}
		if err2 := doAPIRequest("GET", "/animes?q="+url.QueryEscape(q), nil, &listResp); err2 == nil {
			for _, it := range listResp.Data.Items {
				if it.Slug == "" || seen[it.Slug] {
					continue
				}
				seen[it.Slug] = true
				it.PosterURL = posterKeyToURL(it.PosterKey)
				it.NumericID = slugToID(it.Slug)
				items = append(items, it)
			}
		}
		return items, len(items), false, nil
	}

	allItems, err := ensureCatalogLoaded()
	if err != nil {
		return nil, 0, false, err
	}

	total := len(allItems)
	start := (page - 1) * limit
	if start >= total {
		return []CatalogItem{}, total, false, nil
	}
	end := start + limit
	if end > total {
		end = total
	}
	hasMore := end < total
	return allItems[start:end], total, hasMore, nil
}

func ensureCatalogLoaded() ([]CatalogItem, error) {
	catalogMu.Lock()
	defer catalogMu.Unlock()

	if len(cachedCatalog) > 0 && time.Since(catalogFetched) < 10*time.Minute {
		return cachedCatalog, nil
	}

	var all []CatalogItem
	seen := make(map[string]bool)
	cursor := ""

	for i := 0; i < 15; i++ {
		path := "/animes"
		if cursor != "" {
			path += "?cursor=" + url.QueryEscape(cursor)
		}
		var resp struct {
			Success bool `json:"success"`
			Data    struct {
				Items      []CatalogItem `json:"items"`
				Total      int           `json:"total"`
				NextCursor string        `json:"nextCursor"`
			} `json:"data"`
		}
		if err := doAPIRequest("GET", path, nil, &resp); err != nil {
			if len(all) > 0 {
				break
			}
			return nil, err
		}
		for _, it := range resp.Data.Items {
			if it.Slug == "" || seen[it.Slug] {
				continue
			}
			seen[it.Slug] = true
			it.PosterURL = posterKeyToURL(it.PosterKey)
			it.NumericID = slugToID(it.Slug)
			all = append(all, it)
		}
		if resp.Data.NextCursor == "" || len(resp.Data.Items) == 0 {
			break
		}
		cursor = resp.Data.NextCursor
	}

	if len(all) > 0 {
		cachedCatalog = all
		catalogFetched = time.Now()
	}
	return all, nil
}

func (a AniHub) GetSearchData(query string) ([]models.Anime, error) {
	q := strings.TrimSpace(query)
	if q == "" || len(q) <= 1 {
		items, _, _, err := FetchCatalogPage(1, 30, "")
		if err != nil {
			return nil, err
		}
		out := make([]models.Anime, 0, len(items))
		for _, it := range items {
			out = append(out, toModelAnime(it))
		}
		return out, nil
	}

	items, _, _, err := FetchCatalogPage(1, 30, q)
	if err != nil {
		return nil, err
	}

	if len(items) == 0 {
		if all, errAll := ensureCatalogLoaded(); errAll == nil {
			qLower := strings.ToLower(q)
			for _, it := range all {
				if strings.Contains(strings.ToLower(it.Title), qLower) || strings.Contains(strings.ToLower(it.Slug), qLower) {
					items = append(items, it)
				}
			}
		}
	}

	out := make([]models.Anime, 0, len(items))
	for _, it := range items {
		out = append(out, toModelAnime(it))
	}
	return out, nil
}

type animeDetailResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Anime    CatalogItem `json:"anime"`
		Episodes []struct {
			ID         string      `json:"id"`
			Slug       string      `json:"slug"`
			Number     int         `json:"number"`
			Title      string      `json:"title"`
			IsPlayable bool        `json:"isPlayable"`
			FillerKind interface{} `json:"fillerKind"`
		} `json:"episodes"`
		Series *struct {
			ID                 string `json:"id"`
			Title              string `json:"title"`
			CanonicalSlug      string `json:"canonicalSlug"`
			CurrentSeasonIndex int    `json:"currentSeasonIndex"`
			Seasons            []struct {
				Label        string `json:"label"`
				Order        int    `json:"order"`
				Slug         string `json:"slug"`
				EpisodeCount int    `json:"episodeCount"`
			} `json:"seasons"`
		} `json:"series"`
	} `json:"data"`
}

func fetchAnimeDetail(slug string) (*animeDetailResponse, error) {
	if slug == "" {
		return nil, errors.New("AniHub anime slug gerekli")
	}
	var resp animeDetailResponse
	if err := doAPIRequest("GET", "/animes/"+url.PathEscape(slug), nil, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (a AniHub) GetAnimeByID(idOrSlug string) (*models.Anime, error) {
	s := strings.TrimSpace(idOrSlug)
	if num, err := strconv.Atoi(s); err == nil && num > 0 {
		_, _ = ensureCatalogLoaded()
		slug := resolveSlug(&num, nil)
		if slug != "" {
			s = slug
		}
	}
	detail, err := fetchAnimeDetail(s)
	if err != nil {
		return nil, err
	}
	m := toModelAnime(detail.Data.Anime)
	return &m, nil
}

func (a AniHub) GetSeasonsData(params models.SeasonParams) ([]models.Season, error) {
	slug := resolveSlug(params.Id, params.Slug)
	if slug == "" && params.Id != nil {
		_, _ = ensureCatalogLoaded()
		slug = resolveSlug(params.Id, params.Slug)
	}
	if slug == "" {
		return nil, errors.New("AniHub sezon bilgisi için slug bulunamadı")
	}

	detail, err := fetchAnimeDetail(slug)
	if err != nil {
		return nil, err
	}

	if detail.Data.Series != nil && len(detail.Data.Series.Seasons) > 0 {
		nums := make([]int, 0, len(detail.Data.Series.Seasons))
		for i, s := range detail.Data.Series.Seasons {
			order := s.Order
			if order <= 0 {
				order = i + 1
			}
			nums = append(nums, order)
		}
		cnt := len(nums)
		return []models.Season{{
			Seasons: &nums,
			Count:   &cnt,
		}}, nil
	}

	defSeasons := []int{1}
	defCount := 1
	return []models.Season{{
		Seasons: &defSeasons,
		Count:   &defCount,
	}}, nil
}

func (a AniHub) GetEpisodesData(params models.EpisodeParams) ([]models.Episode, error) {
	slug := resolveSlug(params.SeasonID, params.Slug)
	if slug == "" && params.SeasonID != nil {
		_, _ = ensureCatalogLoaded()
		slug = resolveSlug(params.SeasonID, params.Slug)
	}
	if slug == "" {
		return nil, errors.New("AniHub bölümleri için slug bulunamadı")
	}

	detail, err := fetchAnimeDetail(slug)
	if err != nil {
		return nil, err
	}

	seasonNum := 1
	if params.SeasonNum != nil && *params.SeasonNum > 0 {
		seasonNum = *params.SeasonNum
	}

	if detail.Data.Series != nil && len(detail.Data.Series.Seasons) > 1 {
		targetSlug := ""
		for i, s := range detail.Data.Series.Seasons {
			order := s.Order
			if order <= 0 {
				order = i + 1
			}
			if order == seasonNum {
				targetSlug = s.Slug
				break
			}
		}
		if targetSlug == "" && seasonNum-1 >= 0 && seasonNum-1 < len(detail.Data.Series.Seasons) {
			targetSlug = detail.Data.Series.Seasons[seasonNum-1].Slug
		}
		if targetSlug != "" && targetSlug != slug {
			if sDetail, sErr := fetchAnimeDetail(targetSlug); sErr == nil {
				detail = sDetail
			}
		}
	}

	eps := make([]models.Episode, 0, len(detail.Data.Episodes))
	for i, ep := range detail.Data.Episodes {
		num := ep.Number
		if num <= 0 {
			num = i + 1
		}
		title := fmt.Sprintf("%d. Bölüm", num)
		if t := strings.TrimSpace(ep.Title); t != "" && !strings.EqualFold(t, fmt.Sprintf("Bölüm %d", num)) && !strings.EqualFold(t, fmt.Sprintf("Episode %d", num)) {
			title = fmt.Sprintf("%d. Bölüm - %s", num, t)
		}
		epID := ep.ID
		if epID == "" {
			epID = ep.Slug
		}
		eps = append(eps, models.Episode{
			Title:  title,
			Number: num,
			ID:     epID,
			Extra: map[string]interface{}{
				"slug":       ep.Slug,
				"season":     seasonNum,
				"fillerKind": ep.FillerKind,
			},
		})
	}

	return eps, nil
}

func formatSecToTimeStr(sec int) string {
	if sec < 0 {
		sec = 0
	}
	h := sec / 3600
	m := (sec % 3600) / 60
	s := sec % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}

func (a AniHub) GetWatchData(params models.WatchParams) ([]models.Watch, error) {
	epID := ""
	if params.Url != nil {
		epID = strings.TrimSpace(*params.Url)
	}

	seasonIdx := 0
	episodeIdx := 0
	if params.Extra != nil {
		if v, ok := (*params.Extra)["seasonIndex"].(int); ok {
			seasonIdx = v
		}
		if v, ok := (*params.Extra)["episodeIndex"].(int); ok {
			episodeIdx = v
		}
	}

	if epID == "" {
		sNum := seasonIdx
		if sNum <= 0 {
			sNum = 1
		}
		eps, err := a.GetEpisodesData(models.EpisodeParams{
			SeasonID:  params.Id,
			SeasonNum: &sNum,
			Slug:      params.Slug,
		})
		if err != nil || len(eps) == 0 {
			return nil, errors.New("AniHub bölüm listesi alınamadı")
		}
		if episodeIdx < 0 || episodeIdx >= len(eps) {
			episodeIdx = 0
		}
		epID = eps[episodeIdx].ID
	}

	var opening *models.OpeningData
	var ending *models.OpeningData

	if strings.Contains(epID, "-") {
		var epResp struct {
			Success bool `json:"success"`
			Data    struct {
				Episode struct {
					ID    string `json:"id"`
					Intro *struct {
						Start int `json:"start"`
						End   int `json:"end"`
					} `json:"intro"`
					Outro *struct {
						Start int `json:"start"`
						End   int `json:"end"`
					} `json:"outro"`
				} `json:"episode"`
			} `json:"data"`
		}
		if err := doAPIRequest("GET", "/episodes/"+url.PathEscape(epID), nil, &epResp); err == nil && epResp.Data.Episode.ID != "" {
			epID = epResp.Data.Episode.ID
			if epResp.Data.Episode.Intro != nil {
				opening = &models.OpeningData{
					Start: formatSecToTimeStr(epResp.Data.Episode.Intro.Start),
					End:   formatSecToTimeStr(epResp.Data.Episode.Intro.End),
				}
			}
			if epResp.Data.Episode.Outro != nil {
				ending = &models.OpeningData{
					Start: formatSecToTimeStr(epResp.Data.Episode.Outro.Start),
					End:   formatSecToTimeStr(epResp.Data.Episode.Outro.End),
				}
			}
		}
	}

	var pbResp struct {
		Success bool `json:"success"`
		Data    struct {
			Status            string `json:"status"`
			MasterPlaylistKey string `json:"masterPlaylistKey"`
			MasterPlaylistURL string `json:"masterPlaylistUrl"`
			Subtitles         []struct {
				ID          string `json:"id"`
				SubtitleKey string `json:"subtitleKey"`
				URL         string `json:"url"`
				Language    string `json:"language"`
				Label       string `json:"label"`
			} `json:"subtitles"`
		} `json:"data"`
	}
	if err := doAPIRequest("GET", "/episodes/"+url.PathEscape(epID)+"/playback", nil, &pbResp); err != nil {
		return nil, err
	}
	if pbResp.Data.MasterPlaylistURL == "" && pbResp.Data.MasterPlaylistKey == "" {
		return nil, errors.New("AniHub video kaynağı hazır değil")
	}

	streamURL := pbResp.Data.MasterPlaylistURL
	if streamURL == "" {
		streamURL = mediaBaseURL + "/" + strings.TrimLeft(pbResp.Data.MasterPlaylistKey, "/")
	}

	if pbResp.Data.MasterPlaylistKey != "" {
		var tokResp struct {
			Success bool `json:"success"`
			Data    struct {
				Token string `json:"token"`
			} `json:"data"`
		}
		body := map[string]string{"masterPlaylistKey": pbResp.Data.MasterPlaylistKey}
		if err := doAPIRequest("POST", "/video-tokens", body, &tokResp); err == nil && tokResp.Data.Token != "" {
			sep := "?"
			if strings.Contains(streamURL, "?") {
				sep = "&"
			}
			streamURL = streamURL + sep + "token=" + url.QueryEscape(tokResp.Data.Token)
		}
	}

	var subtitles []models.WatchSubtitle
	var trCaption *string
	for _, sub := range pbResp.Data.Subtitles {
		if sub.URL == "" {
			continue
		}
		lang := strings.ToLower(strings.TrimSpace(sub.Language))
		label := strings.TrimSpace(sub.Label)
		if label == "" {
			label = strings.ToUpper(lang)
		}
		subtitles = append(subtitles, models.WatchSubtitle{
			Group: lang,
			Label: label,
			Link:  sub.URL,
		})
		if lang == "tr" && trCaption == nil {
			u := sub.URL
			trCaption = &u
		}
	}

	return []models.Watch{{
		Labels:    []string{"1080p HLS (AniHub)"},
		Urls:      []string{streamURL},
		TRCaption: trCaption,
		Subtitles: subtitles,
		Opening:   opening,
		Ending:    ending,
	}}, nil
}
