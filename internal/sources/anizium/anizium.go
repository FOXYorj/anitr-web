package anizium

import (
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/prayjofir/anitr-cli/internal/config"
	"github.com/prayjofir/anitr-cli/internal/helpers"
	"github.com/prayjofir/anitr-cli/internal/models"
)

type Anizium struct{}

const BrowserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// Shared keep-alive HTTP/2 client so Cloudflare does not see rapid repeated TLS handshakes.
var SharedHTTPClient = &http.Client{
	Timeout: 12 * time.Second,
	Transport: &http.Transport{
		Proxy:               http.ProxyFromEnvironment,
		ForceAttemptHTTP2:   true,
		MaxIdleConns:        16,
		MaxIdleConnsPerHost: 4,
		IdleConnTimeout:     90 * time.Second,
	},
}

// ── Global Anizium Rate Limiter, Circuit Breaker & Cache (IP Ban Koruması) ──

var (
	rateMu      sync.Mutex
	lastReqTime time.Time
	minInterval = 850 * time.Millisecond

	blockMu      sync.RWMutex
	blockedUntil time.Time
	blockReason  string

	cacheMu       sync.RWMutex
	animeGetCache = make(map[int]cachedEntry)
	searchCache   = make(map[string]cachedSearchEntry)
)

type cachedEntry struct {
	data      map[string]interface{}
	expiresAt time.Time
}

type cachedSearchEntry struct {
	results   []models.Anime
	expiresAt time.Time
}

// IsBlocked returns true if Anizium recently returned Cloudflare 403 / Error 1006 / 429.
func IsBlocked() (bool, string) {
	blockMu.RLock()
	defer blockMu.RUnlock()
	if time.Now().Before(blockedUntil) {
		return true, blockReason
	}
	return false, ""
}

// ResetBlock clears the local circuit breaker cooldown (e.g. after user changes IP).
func ResetBlock() {
	blockMu.Lock()
	blockedUntil = time.Time{}
	blockReason = ""
	blockMu.Unlock()
}

// RecordHTTPBlock checks HTTP status / response body and trips the circuit breaker if blocked/rate-limited.
func RecordHTTPBlock(status int, body []byte) bool {
	bodyStr := string(body)
	is1006 := strings.Contains(bodyStr, `"error_code":1006`) ||
		strings.Contains(bodyStr, `"ip_banned"`) ||
		strings.Contains(bodyStr, "error code: 1006")
	isCFBlock := status == http.StatusForbidden || is1006 || strings.Contains(strings.ToLower(bodyStr), "cloudflare")

	if is1006 || isCFBlock {
		blockMu.Lock()
		blockedUntil = time.Now().Add(10 * time.Minute)
		if is1006 {
			blockReason = "Anizium Cloudflare IP engeli aktif (Error 1006). Mevcut IP adresiniz Anizium tarafından engellenmiş; IP değiştirmeden veya engel kalkmadan istek gönderilmeyecek."
		} else {
			blockReason = fmt.Sprintf("Anizium HTTP %d güvenlik engeli algılandı; yeni IP banını önlemek için istekler 10 dakika durduruldu.", status)
		}
		blockMu.Unlock()
		return true
	}

	if status == http.StatusTooManyRequests {
		blockMu.Lock()
		blockedUntil = time.Now().Add(3 * time.Minute)
		blockReason = "Anizium hız limiti (HTTP 429) algılandı; IP banını önlemek için 3 dakika bekleniyor."
		blockMu.Unlock()
		return true
	}

	return false
}

// WaitRateLimit ensures requests to api.anizium.co are spaced out so WAF never triggers an IP ban.
func WaitRateLimit() {
	rateMu.Lock()
	defer rateMu.Unlock()
	elapsed := time.Since(lastReqTime)
	if elapsed < minInterval {
		time.Sleep(minInterval - elapsed)
	}
	lastReqTime = time.Now()
}

// IsValidAniziumID prevents synthetic hash IDs (e.g. 791674752 from other sources) from hitting api.anizium.co.
func IsValidAniziumID(id int) bool {
	return id > 0 && id <= 500000
}

// DoJSONGet performs a rate-limited, keep-alive GET request and inspects 403/429/1006 blocks.
func DoJSONGet(urlStr string, headers map[string]string) (map[string]interface{}, error) {
	if blocked, reason := IsBlocked(); blocked {
		return nil, fmt.Errorf("%s", reason)
	}

	WaitRateLimit()
	fmt.Printf("[ANIZIUM-HTTP] GET %s\n", urlStr)

	req, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := SharedHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}

	if RecordHTTPBlock(resp.StatusCode, body) {
		_, reason := IsBlocked()
		return nil, fmt.Errorf("%s", reason)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Anizium HTTP %d", resp.StatusCode)
	}

	var dataMap map[string]interface{}
	if err := json.Unmarshal(body, &dataMap); err != nil {
		return nil, fmt.Errorf("geçersiz JSON yanıtı")
	}

	return dataMap, nil
}

// FetchAnimeGetCached fetches /anime/get?id=X with a 15-minute memory cache and rate limiting.
func FetchAnimeGetCached(id int) (map[string]interface{}, error) {
	if !IsValidAniziumID(id) {
		return nil, fmt.Errorf("geçersiz Anizium anime ID: %d", id)
	}

	cacheMu.RLock()
	if entry, ok := animeGetCache[id]; ok && time.Now().Before(entry.expiresAt) {
		cacheMu.RUnlock()
		return entry.data, nil
	}
	cacheMu.RUnlock()

	urlStr := fmt.Sprintf("%sanime/get?id=%d", configAnizium.BaseUrl, id)
	dataMap, err := DoJSONGet(urlStr, GetHeaders())
	if err != nil {
		return nil, err
	}

	if _, hasData := dataMap["data"].(map[string]interface{}); hasData {
		cacheMu.Lock()
		animeGetCache[id] = cachedEntry{
			data:      dataMap,
			expiresAt: time.Now().Add(15 * time.Minute),
		}
		cacheMu.Unlock()
	}

	return dataMap, nil
}

// getConfigPath — uygulamanın config.json yolunu döner
func getConfigPath() string {
	return filepath.Join(helpers.ConfigDir(), "config.json")
}

var configAnizium = struct {
	BaseUrl        string
	AlternativeUrl string
	VideoPlayers   []string
}{
	BaseUrl:        "https://api.anizium.co/",
	AlternativeUrl: "https://anizium.com/",
	VideoPlayers:   []string{"f.aniziumserver.sbs"},
}

// xorEncrypt, JS tarafındaki şifrelemenin Go karşılığı
func xorEncrypt(text, key string) string {
	tb := []byte(text)
	kb := []byte(key)
	res := make([]byte, len(tb))
	for i, b := range tb {
		res[i] = b ^ kb[i%len(kb)]
	}
	return fmt.Sprintf("%x", res)
}

// randomString 6 haneli rastgele string üretir
func randomString(n int) string {
	var letters = []rune("abcdefghijklmnopqrstuvwxyz0123456789")
	s := make([]rune, n)
	for i := range s {
		s[i] = letters[rand.Intn(len(letters))]
	}
	return string(s)
}

// GenerateCfToken - CF-Control header değerini üretir (auth.go tarafından da kullanılır)
func GenerateCfToken() string {
	tokenKey := "hlxjl1c2w281ax473rt1ofgrvhyjvi"
	loc, err := time.LoadLocation("Europe/Istanbul")
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	dayName := strings.ToLower(now.Format("Monday"))
	key := fmt.Sprintf("%s_%s", tokenKey, dayName)
	randStr := randomString(6)
	tMap := map[string]int64{randStr: now.UnixNano() / int64(time.Millisecond)}
	tBytes, _ := json.Marshal(tMap)
	return xorEncrypt(string(tBytes), key)
}

func generateCfToken() string {
	return GenerateCfToken()
}

// GetHeaders, Anizium API'sine istek yapmak için gerekli başlıkları dinamik üretir
func GetHeaders() map[string]string {
	return map[string]string{
		"Accept":       "application/json, text/plain, */*",
		"User-Agent":   BrowserUserAgent,
		"Referer":      "https://anizium.co/",
		"Origin":       "https://anizium.co",
		"Cf-Control":   generateCfToken(),
		"device":       "browser",
		"language":     "tr",
		"site":         "main",
		"user-session": "",
		"user-profile": "",
	}
}

func getHeaders() map[string]string {
	return GetHeaders()
}

func (a Anizium) Source() string {
	return "Anizium"
}

func (a Anizium) GetSearchData(query string) (returnData []models.Anime, err error) {
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("Anizium Search Panic: %v\n", r)
			returnData = []models.Anime{}
			err = nil
		}
	}()

	cleanQuery := strings.ToLower(strings.TrimSpace(query))
	if cleanQuery == "" {
		return []models.Anime{}, nil
	}

	cacheMu.RLock()
	if cached, ok := searchCache[cleanQuery]; ok && time.Now().Before(cached.expiresAt) {
		cacheMu.RUnlock()
		out := make([]models.Anime, len(cached.results))
		copy(out, cached.results)
		return out, nil
	}
	cacheMu.RUnlock()

	searchUrl := fmt.Sprintf("%spage/search?value=%s&page=1", configAnizium.BaseUrl, url.QueryEscape(query))
	dataMap, err := DoJSONGet(searchUrl, getHeaders())
	if err != nil {
		return []models.Anime{}, err
	}

	if isErr, ok := dataMap["isError"].(bool); ok && isErr {
		return []models.Anime{}, nil
	}

	var itemsRaw []interface{}
	if pageMap, ok := dataMap["page"].(map[string]interface{}); ok {
		itemsRaw, _ = pageMap["data"].([]interface{})
	} else if dataRaw, ok := dataMap["data"].([]interface{}); ok {
		itemsRaw = dataRaw
	}

	if itemsRaw == nil {
		return []models.Anime{}, nil
	}

	for _, item := range itemsRaw {
		itemMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		title, _ := itemMap["name"].(string)
		slug, _ := itemMap["sef"].(string)
		poster, _ := itemMap["poster"].(string)
		animeType, _ := itemMap["type"].(string)

		synopsis, _ := itemMap["overview"].(string)
		if synopsis == "" {
			synopsis, _ = itemMap["description"].(string)
		}
		if synopsis == "" {
			synopsis, _ = itemMap["synopsis"].(string)
		}

		var id int
		if idStr, ok := itemMap["ID"].(string); ok {
			fmt.Sscanf(idStr, "%d", &id)
		} else if idFloat, ok := itemMap["ID"].(float64); ok {
			id = int(idFloat)
		}

		var tmdbID int
		if tmdbStr, ok := itemMap["tmdb_id"].(string); ok {
			fmt.Sscanf(tmdbStr, "%d", &tmdbID)
		} else if tmdbFloat, ok := itemMap["tmdb_id"].(float64); ok {
			tmdbID = int(tmdbFloat)
		}

		extra := map[string]interface{}{
			"tmdb_id": tmdbID,
		}

		aAnime := models.Anime{
			Title:     title,
			Slug:      &slug,
			ID:        &id,
			ImageURL:  poster,
			Synopsis:  synopsis,
			Type:      &animeType,
			TitleType: &animeType,
			Extra:     extra,
		}

		returnData = append(returnData, aAnime)
	}

	cacheMu.Lock()
	searchCache[cleanQuery] = cachedSearchEntry{
		results:   returnData,
		expiresAt: time.Now().Add(10 * time.Minute),
	}
	cacheMu.Unlock()

	return returnData, nil
}

func (a Anizium) GetAnimeByID(id string) (*models.Anime, error) {
	numID, err := strconv.Atoi(strings.TrimSpace(id))
	if err != nil || !IsValidAniziumID(numID) {
		return nil, fmt.Errorf("geçersiz Anizium ID: %s", id)
	}

	dataMap, err := FetchAnimeGetCached(numID)
	if err != nil {
		return nil, err
	}

	itemMap, ok := dataMap["data"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("data alanı eksik")
	}

	title, _ := itemMap["name"].(string)
	synopsis, _ := itemMap["overview"].(string)
	if synopsis == "" {
		synopsis, _ = itemMap["description"].(string)
	}
	if synopsis == "" {
		synopsis, _ = itemMap["synopsis"].(string)
	}
	return &models.Anime{Title: title, Synopsis: synopsis}, nil
}

func (a Anizium) GetSeasonsData(params models.SeasonParams) ([]models.Season, error) {
	if params.Id == nil || !IsValidAniziumID(*params.Id) {
		return []models.Season{}, nil
	}

	dataMap, err := FetchAnimeGetCached(*params.Id)
	if err != nil {
		return []models.Season{}, err
	}

	animeData, ok := dataMap["data"].(map[string]interface{})
	if !ok {
		return []models.Season{}, nil
	}

	seasonsRaw, ok := animeData["seasons"].([]interface{})
	if !ok {
		return []models.Season{}, nil
	}

	var seasonList []models.Season
	var numbers []int

	for _, sRaw := range seasonsRaw {
		sMap, ok := sRaw.(map[string]interface{})
		if !ok {
			continue
		}
		if numFloat, ok := sMap["number"].(float64); ok {
			numbers = append(numbers, int(numFloat))
		}
	}

	count := len(numbers)
	isMovie := false
	if animeData["type"] == "movie" {
		isMovie = true
	}

	seasonList = append(seasonList, models.Season{
		Seasons: &numbers,
		Count:   &count,
		IsMovie: &isMovie,
	})

	return seasonList, nil
}

func (a Anizium) GetEpisodesData(params models.EpisodeParams) ([]models.Episode, error) {
	if params.SeasonID == nil || !IsValidAniziumID(*params.SeasonID) {
		return []models.Episode{}, nil
	}

	dataMap, err := FetchAnimeGetCached(*params.SeasonID)
	if err != nil {
		return []models.Episode{}, err
	}

	animeData, ok := dataMap["data"].(map[string]interface{})
	if !ok {
		return []models.Episode{}, nil
	}

	var tmdbID int
	if tmdbStr, ok := animeData["tmdb_id"].(string); ok {
		fmt.Sscanf(tmdbStr, "%d", &tmdbID)
	} else if tmdbFloat, ok := animeData["tmdb_id"].(float64); ok {
		tmdbID = int(tmdbFloat)
	}

	seasonsRaw, ok := animeData["seasons"].([]interface{})
	if !ok {
		return []models.Episode{}, nil
	}

	var epList []models.Episode
	for _, sRaw := range seasonsRaw {
		sMap, ok := sRaw.(map[string]interface{})
		if !ok {
			continue
		}

		seasonNum := 1
		if sn, ok := sMap["number"].(float64); ok {
			seasonNum = int(sn)
		}

		episodesRaw, ok := sMap["episodes"].([]interface{})
		if !ok {
			continue
		}

		for _, eRaw := range episodesRaw {
			eMap, ok := eRaw.(map[string]interface{})
			if !ok {
				continue
			}

			title, _ := eMap["name"].(string)
			if title == "" {
				title = "Bölüm"
			}
			var epNum int
			if n, ok := eMap["number"].(float64); ok {
				epNum = int(n)
			}

			extra := map[string]interface{}{
				"season_num":  float64(seasonNum),
				"episode_num": epNum,
				"tmdb_id":     tmdbID,
				"quality":     animeData["quality"],
			}

			ep := models.Episode{
				ID:     fmt.Sprintf("%v", eMap["ID"]),
				Title:  fmt.Sprintf("%d - %s", epNum, title),
				Number: epNum,
				Extra:  extra,
			}
			epList = append(epList, ep)
		}
	}

	return epList, nil
}

func (a Anizium) GetWatchData(params models.WatchParams) ([]models.Watch, error) {
	if params.Id == nil || !IsValidAniziumID(*params.Id) {
		return nil, fmt.Errorf("geçersiz Anizium anime id")
	}

	dataMap, err := FetchAnimeGetCached(*params.Id)
	if err != nil {
		return nil, err
	}

	animeData, ok := dataMap["data"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("anime data eksik")
	}

	tmdbID := 0
	tmdbSlug := ""
	if tmdbRaw, ok := animeData["tmdb_id"]; ok && tmdbRaw != nil {
		switch v := tmdbRaw.(type) {
		case float64:
			tmdbID = int(v)
			tmdbSlug = fmt.Sprintf("%d", tmdbID)
		case string:
			fmt.Sscanf(v, "%d", &tmdbID)
			if tmdbID == 0 {
				tmdbSlug = v
			} else {
				tmdbSlug = fmt.Sprintf("%d", tmdbID)
			}
		}
	}

	if tmdbSlug == "" {
		return nil, fmt.Errorf("bu animenin tmdb_id bilgisi eksik, stream bağlantısı çözülemedi")
	}

	seasonIdx := 0
	episodeIdx := 0
	skipSoundPref := false

	if params.Extra != nil {
		pExtra := *params.Extra
		if sn, ok := pExtra["seasonIndex"].(int); ok {
			seasonIdx = sn
		}
		if en, ok := pExtra["episodeIndex"].(int); ok {
			episodeIdx = en
		}
		if skip, ok := pExtra["skip_sound_preference"].(bool); ok {
			skipSoundPref = skip
		}
	}

	seasonNum := seasonIdx + 1
	episodeNum := episodeIdx + 1

	if seasonsRaw, ok := animeData["seasons"].([]interface{}); ok {
		flatCounter := 0
		found := false
		for _, sRaw := range seasonsRaw {
			sMap, ok := sRaw.(map[string]interface{})
			if !ok {
				continue
			}
			sNum := 1
			if sn, ok := sMap["number"].(float64); ok {
				sNum = int(sn)
			}
			if epsRaw, ok := sMap["episodes"].([]interface{}); ok {
				for _, eRaw := range epsRaw {
					if flatCounter == episodeIdx {
						seasonNum = sNum
						eMap, ok := eRaw.(map[string]interface{})
						if ok {
							if en, ok := eMap["number"].(float64); ok {
								episodeNum = int(en)
							}
						}
						found = true
						break
					}
					flatCounter++
				}
			}
			if found {
				break
			}
		}
	}

	var labels []string
	var urls []string
	var trCaption *string
	var watchSubtitles []models.WatchSubtitle
	var warnMessage string

	animeAPIID := 0
	if idRaw, ok := animeData["ID"]; ok {
		switch v := idRaw.(type) {
		case float64:
			animeAPIID = int(v)
		case string:
			fmt.Sscanf(v, "%d", &animeAPIID)
		}
	}

	preferredStart := ""
	if appCfg, cfgErr := config.LoadConfig(getConfigPath()); cfgErr == nil && appCfg.PreferredQuality != "" {
		switch appCfg.PreferredQuality {
		case "4K", "2K", "1080p", "720p", "480p":
			preferredStart = appCfg.PreferredQuality
		}
	}

	qualityOrder := map[string]int{"4K": 5, "2K": 4, "1080p": 3, "720p": 2, "480p": 1}

	cfg, cfgErr := LoadConfig()
	if cfgErr != nil || cfg == nil || cfg.Token == "" {
		return nil, fmt.Errorf("Anizium oturumu bulunamadı, lütfen giriş yapın")
	}

	apiVideos, apiSubs, nextEpData, openingData, endingData, apiErr := FetchVideoGroups(cfg, animeAPIID, seasonNum, episodeNum)
	if apiErr != nil {
		return nil, fmt.Errorf("video kaynağı alınamadı: %w", apiErr)
	}

	for _, s := range apiSubs {
		watchSubtitles = append(watchSubtitles, models.WatchSubtitle{
			Group: s.Group,
			Label: s.Label,
			Link:  s.Link,
		})
	}
	for _, s := range apiSubs {
		if s.Group == "tr" {
			trCaption = &s.Link
			break
		}
	}

	preferredSound := ""
	if !skipSoundPref {
		if params.Extra != nil {
			pExtra := *params.Extra
			if s, ok := pExtra["sound"].(string); ok && s != "" {
				preferredSound = s
			}
		}
		if preferredSound == "" {
			if appCfg, cfgErr := config.LoadConfig(getConfigPath()); cfgErr == nil {
				preferredSound = appCfg.PreferredSound
			}
		}
	}

	orderedQualities := []string{"4K", "2K", "1080p", "720p", "480p"}

	startQualityRank := 0
	if preferredStart != "" {
		if rank, ok := qualityOrder[preferredStart]; ok {
			startQualityRank = rank
		}
	}

	type qualGroup struct {
		qualLabel string
		items     []AnimeVideoSource
	}
	qualMap := map[string]*qualGroup{}
	for _, q := range orderedQualities {
		qualMap[q] = &qualGroup{qualLabel: q}
	}
	for _, v := range apiVideos {
		if qg, ok := qualMap[v.Quality]; ok {
			qg.items = append(qg.items, v)
		}
	}

	for _, ql := range orderedQualities {
		qg := qualMap[ql]
		if len(qg.items) == 0 {
			continue
		}
		if preferredStart != "" {
			if qualityOrder[ql] > qualityOrder[preferredStart] {
				continue
			}
		}
		if startQualityRank > 0 && qualityOrder[ql] < startQualityRank {
			if !skipSoundPref {
				continue
			}
		}

		var qualLabels []string
		var qualURLs []string
		var qualSounds []string
		for _, item := range qg.items {
			qualLabels = append(qualLabels, item.Label)
			qualURLs = append(qualURLs, item.URL)
			qualSounds = append(qualSounds, item.Sound)
		}

		if preferredSound != "" {
			fallbackSounds := []string{preferredSound, "endub", "cndub", "trdub", "original"}
			seen := map[string]bool{}
			var orderedSounds []string
			for _, s := range fallbackSounds {
				if !seen[s] {
					seen[s] = true
					orderedSounds = append(orderedSounds, s)
				}
			}
			selectedSound := ""
			for _, trySound := range orderedSounds {
				for i, snd := range qualSounds {
					match := (snd == trySound)
					if trySound == "trdub" && (snd == "tr" || snd == "trdub") {
						match = true
					}
					if trySound == "endub" && (snd == "en" || snd == "endub") {
						match = true
					}
					if trySound == "original" && (snd == "ja" || snd == "jp" || snd == "original") {
						match = true
					}

					if match {
						labels = append(labels, qualLabels[i])
						urls = append(urls, qualURLs[i])
						selectedSound = snd
						break
					}
				}
				if selectedSound != "" {
					break
				}
			}
			if selectedSound == "" {
				labels = append(labels, qualLabels...)
				urls = append(urls, qualURLs...)
				warnMessage = fmt.Sprintf("⚠️  Tercih edilen ses (%s) ve yedekler bulunamadı, tüm seçenekler listeleniyor.", soundHumanLabel(preferredSound))
			} else if selectedSound != preferredSound {
				warnMessage = fmt.Sprintf("⚠️  %s bulunamadı, %s ile açılıyor.", soundHumanLabel(preferredSound), soundHumanLabel(selectedSound))
			}
		} else {
			labels = append(labels, qualLabels...)
			urls = append(urls, qualURLs...)
		}
	}

	if len(urls) == 0 {
		return nil, fmt.Errorf("video bulunamadı (aniziumID=%d sezon=%d bolum=%d)", animeAPIID, seasonNum, episodeNum)
	}

	var opening *models.OpeningData
	if openingData != nil {
		opening = &models.OpeningData{
			Start: openingData.Start,
			End:   openingData.End,
		}
	}

	var ending *models.OpeningData
	if endingData != nil {
		ending = &models.OpeningData{
			Start: endingData.Start,
			End:   endingData.End,
		}
	}

	var nextEpisode *models.NextEpisodeData
	if nextEpData != nil {
		nextEpisode = &models.NextEpisodeData{
			Season:  nextEpData.Season,
			Episode: nextEpData.Episode,
		}
	}

	w := models.Watch{
		Urls:        urls,
		Labels:      labels,
		TRCaption:   trCaption,
		Subtitles:   watchSubtitles,
		WarnMessage: warnMessage,
		NextEpisode: nextEpisode,
		Opening:     opening,
		Ending:      ending,
	}

	return []models.Watch{w}, nil
}

func soundHumanLabel(s string) string {
	switch strings.ToLower(s) {
	case "original":
		return "Japonca (Orijinal)"
	case "trdub":
		return "Türkçe Dublaj"
	case "endub":
		return "İngilizce Dublaj"
	case "cndub":
		return "Çince Dublaj"
	case "trsub":
		return "Türkçe Altyazı"
	default:
		return s
	}
}
