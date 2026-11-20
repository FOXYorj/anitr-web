package aniziumfree

import (
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/prayjofir/anitr-cli/internal/config"
	"github.com/prayjofir/anitr-cli/internal/helpers"
	"github.com/prayjofir/anitr-cli/internal/models"
	"github.com/prayjofir/anitr-cli/internal/sources/anizium"
)

// AniziumFree — hesap gerektirmeyen Anizium kaynağı (IP Ban & Circuit Breaker Korumalı).
type AniziumFree struct{}

func (a AniziumFree) Source() string { return "Anizium Free" }

func getConfigPath() string {
	return filepath.Join(helpers.ConfigDir(), "config.json")
}

// ── Arama (Anizium önbelleğini, circuit-breaker'ı ve rate-limiter'ı paylaşır) ──

func (a AniziumFree) GetSearchData(query string) ([]models.Anime, error) {
	return anizium.Anizium{}.GetSearchData(query)
}

// ── GetAnimeByID ──────────────────────────────────────────────────────────────

func (a AniziumFree) GetAnimeByID(id string) (*models.Anime, error) {
	numID, err := strconv.Atoi(strings.TrimSpace(id))
	if err != nil || !anizium.IsValidAniziumID(numID) {
		return nil, fmt.Errorf("geçersiz Anizium ID: %s", id)
	}
	return anizium.Anizium{}.GetAnimeByID(id)
}

// ── Sezon ──────────────────────────────────────────────────────────────────────

func (a AniziumFree) GetSeasonsData(params models.SeasonParams) ([]models.Season, error) {
	return anizium.Anizium{}.GetSeasonsData(params)
}

// ── Bölümler ───────────────────────────────────────────────────────────────────

func (a AniziumFree) GetEpisodesData(params models.EpisodeParams) ([]models.Episode, error) {
	if params.SeasonID == nil || !anizium.IsValidAniziumID(*params.SeasonID) {
		return []models.Episode{}, nil
	}
	dataMap, err := anizium.FetchAnimeGetCached(*params.SeasonID)
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
	} else if tmdbF, ok := animeData["tmdb_id"].(float64); ok {
		tmdbID = int(tmdbF)
	}

	seasonsRaw, _ := animeData["seasons"].([]interface{})

	targetSeasonIdx := -1
	if params.SeasonNum != nil {
		targetSeasonIdx = *params.SeasonNum
	}

	var epList []models.Episode
	globalIdx := 0
	for si, sRaw := range seasonsRaw {
		sMap, ok := sRaw.(map[string]interface{})
		if !ok {
			continue
		}
		seasonNum := 1
		if sn, ok := sMap["number"].(float64); ok {
			seasonNum = int(sn)
		}
		episodesRaw, _ := sMap["episodes"].([]interface{})

		if targetSeasonIdx >= 0 && si != targetSeasonIdx {
			globalIdx += len(episodesRaw)
			continue
		}

		for _, eRaw := range episodesRaw {
			eMap, ok := eRaw.(map[string]interface{})
			if !ok {
				globalIdx++
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
				"global_idx":  globalIdx,
			}
			epList = append(epList, models.Episode{
				ID:     fmt.Sprintf("%v", eMap["ID"]),
				Title:  fmt.Sprintf("%d - %s", epNum, title),
				Number: epNum,
				Extra:  extra,
			})
			globalIdx++
		}

		if targetSeasonIdx >= 0 {
			break
		}
	}
	return epList, nil
}

func buildLabel(quality, sound string) string {
	soundLabel := map[string]string{
		"original": "Japonca",
		"trdub":    "Türkçe Dublaj",
		"endub":    "İngilizce Dublaj",
		"trsub":    "Türkçe Altyazı",
	}[sound]
	if soundLabel == "" {
		soundLabel = sound
	}
	if quality != "" && soundLabel != "" {
		return fmt.Sprintf("%s (%s)", quality, soundLabel)
	}
	return quality
}

// ── Altyazı & Kaynak (/anime/source) ──────────────────────────────────────────

type freeSubResult struct {
	videos      []anizium.AnimeVideoSource
	subtitles   []anizium.AnimeSubtitle
	nextEp      *anizium.AnimeNextEpisode
	openingTime *anizium.AnimeOpeningTime
	endingTime  *anizium.AnimeOpeningTime
	err         error
}

func fetchSourceNoAuth(animeAPIID, seasonNum, episodeNum int) freeSubResult {
	if !anizium.IsValidAniziumID(animeAPIID) {
		return freeSubResult{}
	}
	if blocked, reason := anizium.IsBlocked(); blocked {
		return freeSubResult{err: fmt.Errorf("%s", reason)}
	}

	apiURL := fmt.Sprintf(
		"https://api.anizium.co/anime/source?id=%d&site=main&plan=standart&season=%d&episode=%d&server=1",
		animeAPIID, seasonNum, episodeNum,
	)
	result, err := anizium.DoJSONGet(apiURL, anizium.GetHeaders())
	if err != nil {
		return freeSubResult{err: err}
	}

	var out freeSubResult

	if groupsRaw, ok := result["groups"].([]interface{}); ok {
		for _, gRaw := range groupsRaw {
			g, ok := gRaw.(map[string]interface{})
			if !ok {
				continue
			}
			soundCode, _ := g["group"].(string)
			if itemsRaw, ok := g["items"].([]interface{}); ok {
				for _, iRaw := range itemsRaw {
					item, ok := iRaw.(map[string]interface{})
					if !ok {
						continue
					}
					link, _ := item["link"].(string)
					if link == "" {
						continue
					}
					qualityF, _ := item["quality"].(float64)
					qLabel := fmt.Sprintf("%dp", int(qualityF))
					if int(qualityF) == 2160 {
						qLabel = "4K"
					} else if int(qualityF) == 1440 {
						qLabel = "2K"
					}
					out.videos = append(out.videos, anizium.AnimeVideoSource{
						Label:   buildLabel(qLabel, soundCode),
						URL:     link,
						Quality: qLabel,
						Sound:   soundCode,
					})
				}
			}
		}
	}

	if subsRaw, ok := result["subtitles"].([]interface{}); ok {
		for _, subRaw := range subsRaw {
			sub, ok := subRaw.(map[string]interface{})
			if !ok {
				continue
			}
			group, _ := sub["group"].(string)
			link, _ := sub["link"].(string)
			if group == "" || link == "" {
				continue
			}
			if !strings.Contains(link, "type=") {
				link += "&type=vtt"
			}
			out.subtitles = append(out.subtitles, anizium.AnimeSubtitle{
				Group: group,
				Link:  link,
				Label: subtitleLabel(group),
			})
		}
	}

	if contentRaw, ok := result["content"].(map[string]interface{}); ok {
		if nedRaw, ok := contentRaw["next_episode_data"].(map[string]interface{}); ok {
			ned := &anizium.AnimeNextEpisode{}
			if s, ok := nedRaw["season"].(float64); ok {
				ned.Season = int(s)
			}
			if e, ok := nedRaw["episode"].(float64); ok {
				ned.Episode = int(e)
			}
			if ned.Season > 0 && ned.Episode > 0 {
				out.nextEp = ned
			}
		}
		if opRaw, ok := contentRaw["opening"].(map[string]interface{}); ok {
			start, _ := opRaw["start"].(string)
			end, _ := opRaw["end"].(string)
			if start != "" && end != "" {
				out.openingTime = &anizium.AnimeOpeningTime{Start: start, End: end}
			}
		}
		if edRaw, ok := contentRaw["ending"].(map[string]interface{}); ok {
			start, _ := edRaw["start"].(string)
			end, _ := edRaw["end"].(string)
			if start != "" && end != "" {
				out.endingTime = &anizium.AnimeOpeningTime{Start: start, End: end}
			}
		}
	}

	return out
}

// ── GetWatchData ───────────────────────────────────────────────────────────────

func (a AniziumFree) GetWatchData(params models.WatchParams) ([]models.Watch, error) {
	if params.Id == nil || !anizium.IsValidAniziumID(*params.Id) {
		return nil, fmt.Errorf("geçersiz Anizium anime id")
	}

	dataMap, err := anizium.FetchAnimeGetCached(*params.Id)
	if err != nil {
		return nil, err
	}
	animeData, ok := dataMap["data"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("anime data eksik")
	}

	tmdbSlug := ""
	tmdbID := 0
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
		return nil, fmt.Errorf("tmdb_id bilgisi eksik, CDN URL'si oluşturulamadı")
	}

	animeAPIID := 0
	if idRaw, ok := animeData["ID"]; ok {
		switch v := idRaw.(type) {
		case float64:
			animeAPIID = int(v)
		case string:
			fmt.Sscanf(v, "%d", &animeAPIID)
		}
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

	preferredQuality := ""
	if appCfg, err := config.LoadConfig(getConfigPath()); err == nil {
		preferredQuality = appCfg.PreferredQuality
	}

	var subResult freeSubResult
	if animeAPIID > 0 {
		subResult = fetchSourceNoAuth(animeAPIID, seasonNum, episodeNum)
		if subResult.err != nil {
			if blocked, reason := anizium.IsBlocked(); blocked {
				return nil, fmt.Errorf("%s", reason)
			}
		}
	}

	apiVideos := subResult.videos
	if len(apiVideos) == 0 {
		return nil, fmt.Errorf("Anizium Free bu bölüm için video akışı döndürmedi (WAF/IP koruması için CDN taraması kapalı; AnimeciX veya AniHub kullanın)")
	}

	qualityOrder := map[string]int{"4K": 5, "2K": 4, "1080p": 3, "720p": 2, "480p": 1}
	orderedQualities := []string{"4K", "2K", "1080p", "720p", "480p"}

	type qualGroup struct {
		items []anizium.AnimeVideoSource
	}
	qualMap := map[string]*qualGroup{}
	for _, q := range orderedQualities {
		qualMap[q] = &qualGroup{}
	}
	for _, v := range apiVideos {
		if qg, ok := qualMap[v.Quality]; ok {
			qg.items = append(qg.items, v)
		}
	}

	var labels []string
	var urls []string
	var warnMessage string

	for _, ql := range orderedQualities {
		qg := qualMap[ql]
		if len(qg.items) == 0 {
			continue
		}
		if preferredQuality != "" && preferredQuality != "Sor" {
			if qualityOrder[ql] > qualityOrder[preferredQuality] {
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

		if preferredSound != "" && !skipSoundPref {
			fallback := []string{preferredSound, "endub", "cndub", "trdub", "original"}
			seen := map[string]bool{}
			var ordered []string
			for _, s := range fallback {
				if !seen[s] {
					seen[s] = true
					ordered = append(ordered, s)
				}
			}
			selected := ""
			for _, trySound := range ordered {
				for i, snd := range qualSounds {
					if snd == trySound {
						labels = append(labels, qualLabels[i])
						urls = append(urls, qualURLs[i])
						selected = trySound
						break
					}
				}
				if selected != "" {
					break
				}
			}
			if selected == "" {
				labels = append(labels, qualLabels...)
				urls = append(urls, qualURLs...)
				warnMessage = "⚠️  Tercih edilen ses bulunamadı, tüm seçenekler listeleniyor."
			}
		} else {
			labels = append(labels, qualLabels...)
			urls = append(urls, qualURLs...)
		}
	}

	if len(urls) == 0 {
		return nil, fmt.Errorf("uygun video bulunamadı")
	}

	var watchSubtitles []models.WatchSubtitle
	var trCaption *string

	for _, s := range subResult.subtitles {
		watchSubtitles = append(watchSubtitles, models.WatchSubtitle{
			Group: s.Group,
			Label: s.Label,
			Link:  s.Link,
		})
	}
	for _, s := range watchSubtitles {
		if s.Group == "tr" {
			trCaption = &s.Link
			break
		}
	}

	if len(watchSubtitles) == 0 && warnMessage == "" {
		warnMessage = "⚠️  Altyazı alınamadı — bu kaynak hesap gerektiren altyazıları gösteremiyor olabilir."
	}

	var opening *models.OpeningData
	if subResult.openingTime != nil {
		opening = &models.OpeningData{Start: subResult.openingTime.Start, End: subResult.openingTime.End}
	}
	var ending *models.OpeningData
	if subResult.endingTime != nil {
		ending = &models.OpeningData{Start: subResult.endingTime.Start, End: subResult.endingTime.End}
	}

	var nextEpisode *models.NextEpisodeData
	if subResult.nextEp != nil {
		nextEpisode = &models.NextEpisodeData{
			Season:  subResult.nextEp.Season,
			Episode: subResult.nextEp.Episode,
		}
	}

	return []models.Watch{{
		Urls:        urls,
		Labels:      labels,
		TRCaption:   trCaption,
		Subtitles:   watchSubtitles,
		WarnMessage: warnMessage,
		NextEpisode: nextEpisode,
		Opening:     opening,
		Ending:      ending,
	}}, nil
}
