package jikan

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/prayjofir/anitr-cli/internal/helpers"
)

type AnimeSearchResponse struct {
	Data []struct {
		MalID int `json:"mal_id"`
	} `json:"data"`
}

type EpisodeFlags struct {
	Filler bool   `json:"filler"`
	Mixed  bool   `json:"mixed"`
	Recap  bool   `json:"recap"`
	Kind   string `json:"kind,omitempty"` // "filler", "mixed", "recap"
}

type CombinedFillerResult struct {
	MalID       int                  `json:"mal_id"`
	Source      string               `json:"source"`
	Slug        string               `json:"slug,omitempty"`
	Total       int                  `json:"total"`
	Flags       map[int]EpisodeFlags `json:"flags"`
	Unreachable bool                 `json:"unreachable"`
}

type EpisodesResponse struct {
	Pagination struct {
		HasNextPage bool `json:"has_next_page"`
	} `json:"pagination"`
	Data []struct {
		MalID  int  `json:"mal_id"`
		Filler bool `json:"filler"`
		Recap  bool `json:"recap"`
	} `json:"data"`
}

type aflShowEntry struct {
	Slug       string   `json:"slug"`
	Title      string   `json:"title"`
	Normalized []string `json:"normalized"`
}

type aflCachedData struct {
	Slug  string               `json:"slug"`
	Total int                  `json:"total"`
	Flags map[int]EpisodeFlags `json:"flags"`
}

var (
	malIDCache   = make(map[string]int)
	malIDCacheMu sync.RWMutex
	flagsCacheMu sync.Mutex

	aflShowsMu     sync.Mutex
	aflShowsLoaded bool
	aflShowsList   []aflShowEntry

	aflRowRegex  = regexp.MustCompile(`(?s)<tr[^>]*id="eps-(\d+)"[^>]*>.*?<td class="Type">\s*<span[^>]*>([^<]+)</span>\s*</td>`)
	aflLinkRegex = regexp.MustCompile(`<a href="/shows/([^"#?]+)"[^>]*>([^<]+)</a>`)
	nonAlphaNum  = regexp.MustCompile(`[^a-z0-9\s]+`)
	multiSpace   = regexp.MustCompile(`\s+`)
)

var directSlugAliases = map[string]string{
	"naruto":                           "naruto",
	"naruto shippuden":                 "naruto-shippuden",
	"naruto shippuuden":                "naruto-shippuden",
	"bleach":                           "bleach",
	"one piece":                        "one-piece",
	"boruto":                           "boruto-naruto-next-generations",
	"boruto naruto next generations":   "boruto-naruto-next-generations",
	"black clover":                     "black-clover",
	"attack on titan":                  "attack-titan",
	"shingeki no kyojin":               "attack-titan",
	"my hero academia":                 "my-hero-academia",
	"boku no hero academia":            "my-hero-academia",
	"demon slayer":                     "demon-slayer-kimetsu-no-yaiba",
	"kimetsu no yaiba":                 "demon-slayer-kimetsu-no-yaiba",
	"hunter x hunter":                  "hunter-x-hunter",
	"fairy tail":                       "fairy-tail",
	"dragon ball":                      "dragon-ball",
	"dragon ball z":                    "dragon-ball-z",
	"dragon ball super":                "dragon-ball-super",
	"detective conan":                  "detective-conan",
	"case closed":                      "detective-conan",
	"gintama":                          "gintama",
	"death note":                       "death-note",
	"fullmetal alchemist":              "fullmetal-alchemist",
	"fullmetal alchemist brotherhood":  "fullmetal-alchemist-brotherhood",
	"hagane no renkinjutsushi":         "fullmetal-alchemist-brotherhood",
	"tokyo ghoul":                      "tokyo-ghoul",
	"sword art online":                 "sword-art-online",
	"jujutsu kaisen":                   "jujutsu-kaisen",
	"chainsaw man":                     "chainsaw-man",
	"spy x family":                     "spy-x-family",
	"one punch man":                    "one-punch-man",
	"blue exorcist":                    "blue-exorcist",
	"ao no exorcist":                   "blue-exorcist",
	"seven deadly sins":                "seven-deadly-sins",
	"nanatsu no taizai":                "seven-deadly-sins",
	"inuyasha":                         "inuyasha",
	"yu yu hakusho":                    "yu-yu-hakusho",
	"rurouni kenshin":                  "rurouni-kenshin",
	"hitman reborn":                    "katekyo-hitman-reborn",
	"katekyo hitman reborn":            "katekyo-hitman-reborn",
	"d gray man":                       "dgray-man",
	"dgray man":                        "dgray-man",
	"soul eater":                       "soul-eater",
	"assassination classroom":          "ansatsu-kyoushitsu-assassination-classroom",
	"ansatsu kyoushitsu":               "ansatsu-kyoushitsu-assassination-classroom",
	"akame ga kill":                    "akame-ga-kill",
	"86":                               "86-eighty-six",
	"86 eighty six":                    "86-eighty-six",
	"eighty six":                       "86-eighty-six",
	"sailor moon":                      "sailor-moon",
	"slam dunk":                        "slam-dunk",
	"haikyuu":                          "haikyu",
	"haikyu":                           "haikyu",
	"fire force":                       "fire-force",
	"enen no shouboutai":               "fire-force",
	"dr stone":                         "dr-stone",
	"mob psycho 100":                   "mob-psycho-100",
	"overlord":                         "overlord",
	"re zero":                          "rezero-starting-life-another-world",
}

func normalizeLookupTitle(s string) string {
	s = html.UnescapeString(strings.ToLower(strings.TrimSpace(s)))
	replacer := strings.NewReplacer(
		"ı", "i", "ğ", "g", "ü", "u", "ş", "s", "ö", "o", "ç", "c",
		"ū", "u", "ō", "o", "ā", "a", "ē", "e", "ī", "i",
		"-", " ", "_", " ", ":", " ", ";", " ", ".", " ", "!", " ", "?", " ",
	)
	s = replacer.Replace(s)
	// Strip common Turkish streaming suffixes & season suffixes
	for _, suf := range []string{
		" turkce dublaj izle", " turkce altyazili izle", " anime izle", " izle",
		" season 1", " season 2", " season 3", " season 4", " season 5", " season 6",
		" 1 sezon", " 2 sezon", " 3 sezon", " 4 sezon", " 5 sezon",
		" 2nd season", " 3rd season", " 4th season", " final season",
	} {
		if strings.HasSuffix(s, suf) {
			s = strings.TrimSpace(strings.TrimSuffix(s, suf))
		}
	}
	s = nonAlphaNum.ReplaceAllString(s, " ")
	s = multiSpace.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func splitShowAliases(rawTitle string) []string {
	var out []string
	rawTitle = html.UnescapeString(strings.TrimSpace(rawTitle))
	if rawTitle == "" {
		return out
	}
	// If title has parenthetical alias like "Attack on Titan (Shingeki no Kyojin)"
	if openIdx := strings.IndexByte(rawTitle, '('); openIdx > 0 {
		mainPart := strings.TrimSpace(rawTitle[:openIdx])
		if n := normalizeLookupTitle(mainPart); n != "" {
			out = append(out, n)
		}
		if closeIdx := strings.LastIndexByte(rawTitle, ')'); closeIdx > openIdx+1 {
			subPart := strings.TrimSpace(rawTitle[openIdx+1 : closeIdx])
			if n2 := normalizeLookupTitle(subPart); n2 != "" {
				out = append(out, n2)
			}
		}
	}
	if full := normalizeLookupTitle(rawTitle); full != "" {
		out = append(out, full)
	}
	return out
}

func aflShowsCachePath() string {
	return filepath.Join(helpers.ConfigDir(), "afl_shows.json")
}

func aflFlagsCachePath() string {
	return filepath.Join(helpers.ConfigDir(), "afl_flags.json")
}

func ensureAFLShowsLoaded() []aflShowEntry {
	aflShowsMu.Lock()
	defer aflShowsMu.Unlock()

	if aflShowsLoaded && len(aflShowsList) > 0 {
		return aflShowsList
	}

	if data, err := os.ReadFile(aflShowsCachePath()); err == nil {
		var cached []aflShowEntry
		if json.Unmarshal(data, &cached) == nil && len(cached) > 50 {
			aflShowsList = cached
			aflShowsLoaded = true
			return aflShowsList
		}
	}

	client := &http.Client{Timeout: 6 * time.Second}
	req, err := http.NewRequest("GET", "https://www.animefillerlist.com/shows", nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return nil
	}

	matches := aflLinkRegex.FindAllStringSubmatch(string(body), -1)
	seen := make(map[string]bool)
	var list []aflShowEntry
	for _, m := range matches {
		slug := strings.TrimSpace(m[1])
		title := strings.TrimSpace(m[2])
		if slug == "" || title == "" || seen[slug] {
			continue
		}
		seen[slug] = true
		norms := splitShowAliases(title)
		slugNorm := normalizeLookupTitle(strings.ReplaceAll(slug, "-", " "))
		if slugNorm != "" {
			norms = append(norms, slugNorm)
		}
		list = append(list, aflShowEntry{
			Slug:       slug,
			Title:      title,
			Normalized: norms,
		})
	}

	if len(list) > 0 {
		aflShowsList = list
		aflShowsLoaded = true
		_ = os.MkdirAll(helpers.ConfigDir(), 0755)
		if b, err := json.Marshal(list); err == nil {
			_ = os.WriteFile(aflShowsCachePath(), b, 0644)
		}
	}
	return aflShowsList
}

func matchAFLSlug(candidates ...string) string {
	var cleanCands []string
	for _, c := range candidates {
		n := normalizeLookupTitle(c)
		if n == "" {
			continue
		}
		if slug, ok := directSlugAliases[n]; ok {
			return slug
		}
		cleanCands = append(cleanCands, n)
	}
	if len(cleanCands) == 0 {
		return ""
	}

	shows := ensureAFLShowsLoaded()
	// Pass 1: exact normalized match
	for _, cand := range cleanCands {
		for _, sh := range shows {
			for _, n := range sh.Normalized {
				if n == cand {
					return sh.Slug
				}
			}
		}
	}
	// Pass 2: prefix / contains match for titles >= 5 chars
	for _, cand := range cleanCands {
		if len(cand) < 5 {
			continue
		}
		for _, sh := range shows {
			for _, n := range sh.Normalized {
				if len(n) >= 5 && (strings.HasPrefix(n, cand+" ") || strings.HasPrefix(cand, n+" ")) {
					return sh.Slug
				}
			}
		}
	}
	return ""
}

func fetchAFLFlagsBySlug(slug string) (*aflCachedData, error) {
	if slug == "" {
		return nil, fmt.Errorf("empty slug")
	}

	flagsCacheMu.Lock()
	aflCache := make(map[string]aflCachedData)
	if data, err := os.ReadFile(aflFlagsCachePath()); err == nil {
		_ = json.Unmarshal(data, &aflCache)
	}
	if cached, ok := aflCache[slug]; ok && cached.Total > 0 {
		flagsCacheMu.Unlock()
		return &cached, nil
	}
	flagsCacheMu.Unlock()

	client := &http.Client{Timeout: 6 * time.Second}
	req, err := http.NewRequest("GET", "https://www.animefillerlist.com/shows/"+slug, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("AFL HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 3*1024*1024))
	if err != nil {
		return nil, err
	}

	rows := aflRowRegex.FindAllStringSubmatch(string(body), -1)
	if len(rows) == 0 {
		return nil, fmt.Errorf("no episode rows on AFL for %s", slug)
	}

	flags := make(map[int]EpisodeFlags)
	maxEp := 0
	for _, r := range rows {
		epNum, err := strconv.Atoi(r[1])
		if err != nil || epNum <= 0 {
			continue
		}
		if epNum > maxEp {
			maxEp = epNum
		}
		typeStr := strings.ToLower(strings.TrimSpace(r[2]))
		switch {
		case strings.Contains(typeStr, "mixed") || strings.Contains(typeStr, "mostly filler"):
			flags[epNum] = EpisodeFlags{
				Mixed: true,
				Kind:  "mixed",
			}
		case strings.Contains(typeStr, "filler"):
			flags[epNum] = EpisodeFlags{
				Filler: true,
				Kind:   "filler",
			}
		case strings.Contains(typeStr, "recap"):
			flags[epNum] = EpisodeFlags{
				Recap: true,
				Kind:  "recap",
			}
		}
	}

	res := aflCachedData{
		Slug:  slug,
		Total: maxEp,
		Flags: flags,
	}

	flagsCacheMu.Lock()
	if data, err := os.ReadFile(aflFlagsCachePath()); err == nil {
		_ = json.Unmarshal(data, &aflCache)
	}
	aflCache[slug] = res
	_ = os.MkdirAll(helpers.ConfigDir(), 0755)
	if b, err := json.MarshalIndent(aflCache, "", "  "); err == nil {
		_ = os.WriteFile(aflFlagsCachePath(), b, 0644)
	}
	flagsCacheMu.Unlock()

	return &res, nil
}

// resolveAniListMetadata resolves MAL ID + English & Romaji titles quickly via AniList GraphQL
func resolveAniListMetadata(title string) (int, string, string, int) {
	if strings.TrimSpace(title) == "" {
		return 0, "", "", 0
	}
	q := `query($s:String){Media(search:$s,type:ANIME){idMal episodes title{romaji english}}}`
	payload, _ := json.Marshal(map[string]interface{}{
		"query":     q,
		"variables": map[string]string{"s": title},
	})
	client := &http.Client{Timeout: 3500 * time.Millisecond}
	req, err := http.NewRequest("POST", "https://graphql.anilist.co", bytes.NewReader(payload))
	if err != nil {
		return 0, "", "", 0
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return 0, "", "", 0
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, "", "", 0
	}
	var out struct {
		Data struct {
			Media struct {
				IDMal    int `json:"idMal"`
				Episodes int `json:"episodes"`
				Title    struct {
					Romaji  string `json:"romaji"`
					English string `json:"english"`
				} `json:"title"`
			} `json:"Media"`
		} `json:"data"`
	}
	if json.NewDecoder(resp.Body).Decode(&out) != nil {
		return 0, "", "", 0
	}
	m := out.Data.Media
	return m.IDMal, m.Title.English, m.Title.Romaji, m.Episodes
}

// GetCombinedFillerData fetches Filler, Yarı Filler (Mixed), and Recap flags from AnimeFillerList + Jikan API
func GetCombinedFillerData(title string, malID int) CombinedFillerResult {
	res := CombinedFillerResult{
		MalID: malID,
		Flags: make(map[int]EpisodeFlags),
	}

	var engTitle, romTitle string
	var aniTotal int
	if title != "" {
		aniMal, eng, rom, eps := resolveAniListMetadata(title)
		engTitle = eng
		romTitle = rom
		aniTotal = eps
		if res.MalID <= 0 && aniMal > 0 {
			res.MalID = aniMal
			SetMalIDCache(title, aniMal)
		}
	}

	// 1. Try AnimeFillerList first (supports both Filler and Yarı Filler / Mixed Canon-Filler!)
	aflSlug := matchAFLSlug(title, engTitle, romTitle)
	var aflErr error
	if aflSlug != "" {
		if aflData, err := fetchAFLFlagsBySlug(aflSlug); err == nil && aflData != nil {
			res.Slug = aflSlug
			res.Total = aflData.Total
			res.Source = "AnimeFillerList"
			for k, v := range aflData.Flags {
				res.Flags[k] = v
			}
			if res.MalID <= 0 {
				// Non-zero synthetic ID so frontend knows data is valid even if MAL ID wasn't needed
				res.MalID = 900000
			}
		} else {
			aflErr = err
		}
	}

	// 2. If AnimeFillerList wasn't found (or to supplement MAL ID / Recap flags), check Jikan
	var jikanErr error
	if res.MalID <= 0 && title != "" {
		if id, err := GetMalIDByTitle(title); err == nil && id > 0 {
			res.MalID = id
		} else {
			jikanErr = err
		}
	}

	if res.MalID > 0 && res.MalID != 900000 && res.Slug == "" {
		jFlags, err := GetEpisodeFlags(res.MalID)
		jikanErr = err
		if len(jFlags) > 0 {
			if res.Source == "" {
				res.Source = "Jikan"
			} else {
				res.Source += "+Jikan"
			}
			for epNum, fl := range jFlags {
				if existing, exists := res.Flags[epNum]; exists {
					if fl.Recap {
						existing.Recap = true
						res.Flags[epNum] = existing
					}
					continue
				}
				kind := "filler"
				if fl.Recap && !fl.Filler {
					kind = "recap"
				}
				fl.Kind = kind
				res.Flags[epNum] = fl
			}
		}
	}

	if res.Total == 0 && aniTotal > 0 {
		res.Total = aniTotal
	}
	if res.Source == "" && res.MalID > 0 {
		res.Source = "Jikan"
	}
	res.Unreachable = res.MalID <= 0 && aflErr != nil && jikanErr != nil
	return res
}

// SetMalIDCache manually sets the cache for a given title to avoid redundant/mismatched API calls.
func SetMalIDCache(title string, malID int) {
	malIDCacheMu.Lock()
	malIDCache[title] = malID
	malIDCacheMu.Unlock()
}

// GetMalIDByTitle searches Jikan API for the anime title and returns the best matched mal_id.
func GetMalIDByTitle(title string) (int, error) {
	malIDCacheMu.RLock()
	if id, ok := malIDCache[title]; ok {
		malIDCacheMu.RUnlock()
		return id, nil
	}
	malIDCacheMu.RUnlock()

	results, err := SearchAnime(title)
	if err == nil && len(results) == 0 {
		words := strings.Fields(title)
		if len(words) > 4 {
			shortTitle := strings.Join(words[:4], " ")
			fallbackResults, fallbackErr := SearchAnime(shortTitle)
			if fallbackErr == nil && len(fallbackResults) > 0 {
				results = fallbackResults
			}
		}
	}

	if err != nil {
		return 0, err
	}

	if len(results) == 0 {
		return 0, fmt.Errorf("anime not found on Jikan")
	}

	matched := MatchAnimeTitle(title, results)
	if matched != nil {
		SetMalIDCache(title, matched.MalID)
		return matched.MalID, nil
	}

	SetMalIDCache(title, results[0].MalID)
	return results[0].MalID, nil
}

// SearchAnime searches Jikan API for an anime and returns a list of results with details.
func SearchAnime(query string) ([]AnimeBasic, error) {
	apiURL := fmt.Sprintf("https://api.jikan.moe/v4/anime?q=%s&order_by=members&sort=desc&limit=15", url.QueryEscape(query))

	client := &http.Client{Timeout: 4 * time.Second}
	var resp *http.Response
	var err error

	for retries := 0; retries < 3; retries++ {
		resp, err = client.Get(apiURL)
		if err != nil {
			return nil, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			resp.Body.Close()
			time.Sleep(1000 * time.Millisecond)
			continue
		}
		break
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jikan API error: %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var searchResp AnimeListResponse
	if err := json.Unmarshal(body, &searchResp); err != nil {
		return nil, err
	}

	return searchResp.Data, nil
}

// cacheFilePath returns the path to the filler cache file
func cacheFilePath() string {
	return filepath.Join(helpers.ConfigDir(), "jikan_flags.json")
}

// readCache reads the entire filler cache from disk
func readCache() map[int]map[int]EpisodeFlags {
	cache := make(map[int]map[int]EpisodeFlags)
	data, err := os.ReadFile(cacheFilePath())
	if err == nil {
		json.Unmarshal(data, &cache)
	}
	return cache
}

// writeCache writes the entire filler cache to disk
func writeCache(cache map[int]map[int]EpisodeFlags) {
	os.MkdirAll(helpers.ConfigDir(), 0755)
	data, err := json.MarshalIndent(cache, "", "  ")
	if err == nil {
		os.WriteFile(cacheFilePath(), data, 0644)
	}
}

// GetEpisodeFlags fetches all episodes for a given mal_id and returns a map where the key is the episode number and the value is EpisodeFlags.
func GetEpisodeFlags(malID int) (map[int]EpisodeFlags, error) {
	flagsCacheMu.Lock()
	cache := readCache()
	if flags, ok := cache[malID]; ok {
		flagsCacheMu.Unlock()
		return flags, nil
	}
	flagsCacheMu.Unlock()

	flags := make(map[int]EpisodeFlags)
	page := 1
	client := &http.Client{Timeout: 4 * time.Second}

	for page <= 8 {
		apiURL := fmt.Sprintf("https://api.jikan.moe/v4/anime/%d/episodes?page=%d", malID, page)
		resp, err := client.Get(apiURL)
		if err != nil {
			return flags, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			resp.Body.Close()
			time.Sleep(1100 * time.Millisecond)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return flags, fmt.Errorf("jikan API error at page %d: %s", page, resp.Status)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return flags, err
		}

		var epResp EpisodesResponse
		if err := json.Unmarshal(body, &epResp); err != nil {
			return flags, err
		}

		for _, ep := range epResp.Data {
			if ep.Filler && ep.Recap {
				flags[ep.MalID] = EpisodeFlags{
					Mixed: true,
					Recap: true,
					Kind:  "mixed",
				}
			} else if ep.Filler || ep.Recap {
				kind := "filler"
				if ep.Recap && !ep.Filler {
					kind = "recap"
				}
				flags[ep.MalID] = EpisodeFlags{
					Filler: ep.Filler,
					Recap:  ep.Recap,
					Kind:   kind,
				}
			}
		}

		if !epResp.Pagination.HasNextPage {
			break
		}

		page++
		time.Sleep(350 * time.Millisecond)
	}

	flagsCacheMu.Lock()
	cache = readCache()
	cache[malID] = flags
	writeCache(cache)
	flagsCacheMu.Unlock()

	return flags, nil
}
