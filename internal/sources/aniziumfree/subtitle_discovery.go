package aniziumfree

// subtitle_discovery.go
//
// NOT: Önceki sürümde a-z × (anizium.co, anizium.sbs, anizium.site) olmak üzere
// 78 alt-alan adına paralel HEAD isteği atılması Cloudflare / Anizium WAF tarafından
// alt-alan adı taraması (DDoS / bot saldırısı) olarak algılanıp IP banına yol açıyordu.
// Bu nedenle paralel sunucu taraması tamamen devre dışı bırakılmıştır; API'den dönen
// altyazı bağlantısı doğrudan kullanılır.

type DiscoveredSubtitle struct {
	Group string
	URL   string
	Label string
}

func GetActiveServers() []string {
	return []string{"https://x.anizium.co"}
}

// StartSubtitleDiscovery — IP banını önlemek için arka plan subdomain taraması yapmaz.
func StartSubtitleDiscovery() {
	// No-op: aktif sunucu taraması WAF IP banına sebep olduğu için kapatıldı.
}

// DiscoverAndDownloadSubtitles — sunucu taraması yapmadan mevcut altyazı URL'sini döner.
func DiscoverAndDownloadSubtitles(knownURL, knownGroup string) []DiscoveredSubtitle {
	if knownURL == "" {
		return nil
	}
	return []DiscoveredSubtitle{{
		Group: knownGroup,
		URL:   knownURL,
		Label: subtitleLabel(knownGroup),
	}}
}

func subtitleLabel(group string) string {
	labels := map[string]string{
		"tr": "Türkçe", "en": "İngilizce", "ja": "Japonca",
		"de": "Almanca", "fr": "Fransızca", "es": "İspanyolca",
		"ar": "Arapça", "pt": "Portekizce", "it": "İtalyanca",
	}
	if l, ok := labels[group]; ok {
		return l
	}
	return group
}

func ReplaceSubtitleServer(originalURL string) string {
	return originalURL
}
