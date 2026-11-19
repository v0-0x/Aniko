package api

import (
	"log"
	"net/http"

	"github.com/v0-0x/Aniko/server/internal/metadata"
)

// filler: an anime's filler and recap episode numbers, from MyAnimeList
// (through Jikan). Never an error: empty lists when they aren't known
// (no MAL id, offline, Jikan failing), the failure logged.
func (s *Server) filler(r *http.Request) (any, error) {
	empty := metadata.Filler{Filler: []int{}, Recap: []int{}}
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	malID, airing := 0, false
	var titles []string
	if media, err := s.app.Platform.MediaLite(r.Context(), id); err == nil && media != nil {
		titles = append([]string{media.Title.English, media.Title.Romaji}, media.Synonyms...)
		if media.IDMal != nil {
			malID = *media.IDMal
		}
		airing = media.Status == "RELEASING" || media.Status == "NOT_YET_RELEASED"
	}
	if malID <= 0 {
		// ani.zip's mappings know it too, when kept.
		if a := s.app.Meta.Cached(id); a != nil {
			malID = a.Mappings.MalID
		}
	}
	if malID <= 0 {
		return empty, nil
	}
	f, err := s.app.Meta.Filler(r.Context(), malID, airing, titles...)
	if err != nil {
		log.Printf("filler: anime %d (MAL %d): %v", id, malID, err)
	}
	return f, nil
}
