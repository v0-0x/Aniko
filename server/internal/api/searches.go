package api

import (
	"net/http"
	"strings"
)

// The Search page's kept searches: the ones saved under a name, and the
// last ones made. On the server, so every device that uses it has them (a
// device keeps its own copy too, for when the server can't be reached).
// Query is the page's address query ("type=MANGA&genre=Action&score=80").
type savedSearch struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Query string `json:"query"`
}

type recentSearch struct {
	Query string `json:"query"`
	At    int64  `json:"at"`
}

type searches struct {
	Saved  []savedSearch  `json:"saved"`
	Recent []recentSearch `json:"recent"`
}

const (
	searchesKey     = "searches"
	maxSavedSearch  = 40
	maxRecentSearch = 12
)

// clean keeps what can be a search: named and not empty, no query twice,
// not more than fit, nothing oversized.
func (s searches) clean() searches {
	out := searches{Saved: []savedSearch{}, Recent: []recentSearch{}}
	ids := map[string]bool{}
	for _, v := range s.Saved {
		v.Name, v.Query = strings.TrimSpace(v.Name), strings.TrimPrefix(strings.TrimSpace(v.Query), "?")
		if v.ID == "" || v.Name == "" || ids[v.ID] || len(v.ID) > 64 || len(v.Name) > 60 || len(v.Query) > 600 || len(out.Saved) >= maxSavedSearch {
			continue
		}
		ids[v.ID] = true
		out.Saved = append(out.Saved, v)
	}
	seen := map[string]bool{}
	for _, v := range s.Recent {
		v.Query = strings.TrimPrefix(strings.TrimSpace(v.Query), "?")
		if v.Query == "" || seen[v.Query] || len(v.Query) > 600 || len(out.Recent) >= maxRecentSearch {
			continue
		}
		seen[v.Query] = true
		out.Recent = append(out.Recent, v)
	}
	return out
}

func (s *Server) getSearches(r *http.Request) (any, error) {
	var v searches
	_, _ = s.app.DB.GetKV(searchesKey, &v)
	return v.clean(), nil
}

// The whole of them, as the device has them now (one saved, one deleted).
func (s *Server) putSearches(r *http.Request) (any, error) {
	var v searches
	if err := decode(r, &v); err != nil {
		return nil, err
	}
	v = v.clean()
	if err := s.app.DB.SetKV(searchesKey, v); err != nil {
		return nil, err
	}
	return v, nil
}
