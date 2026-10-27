package anilist

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
)

// The profile page needs a login.
func TestSocialNeedsLogin(t *testing.T) {
	p := newTestPlatform(t, nil)
	ctx := context.Background()
	if _, err := p.Profile(ctx, "", false); !errors.Is(err, ErrNotLoggedIn) {
		t.Fatalf("Profile logged out: %v", err)
	}
	if _, err := p.Activity(ctx, true, 0, 1, false); !errors.Is(err, ErrNotLoggedIn) {
		t.Fatalf("Activity logged out: %v", err)
	}
}

// The own profile is asked by id, another's by name; with who they follow,
// how many follow them, the favourites' lists flattened, and kept a moment.
func TestProfile(t *testing.T) {
	var asked atomic.Int32
	p := newTestPlatform(t, func(w http.ResponseWriter, req gqlRequest) {
		asked.Add(1)
		switch {
		case strings.Contains(req.Query, "User("):
			if req.Variables["id"] == nil && req.Variables["name"] != "Friend" {
				t.Errorf("profile asked with %v", req.Variables)
			}
			id, name := 7, "tester"
			if req.Variables["name"] == "Friend" {
				id, name = 9, "Friend"
			}
			reply(w, 200, data(map[string]any{"User": map[string]any{
				"id": id, "name": name, "isFollowing": id == 9,
				"statistics": map[string]any{"anime": map[string]any{"count": 12, "episodesWatched": 300, "minutesWatched": 7200}},
				"favourites": map[string]any{
					"anime":      map[string]any{"nodes": []any{map[string]any{"id": 21, "title": map[string]any{"romaji": "One Piece"}}}},
					"characters": map[string]any{"nodes": []any{map[string]any{"id": 40, "name": map[string]any{"full": "Luffy"}}}},
				},
			}}))
		case strings.Contains(req.Query, "following(userId"):
			reply(w, 200, data(map[string]any{
				"following": map[string]any{"pageInfo": map[string]any{"total": 3}, "following": []any{map[string]any{"id": 9, "name": "Friend"}}},
				"followers": map[string]any{"pageInfo": map[string]any{"total": 5}},
			}))
		default:
			t.Errorf("unexpected query %s", op(req.Query))
		}
	})
	setLoggedIn(p, 7)
	ctx := context.Background()

	own, err := p.Profile(ctx, "", false)
	if err != nil {
		t.Fatal(err)
	}
	if !own.Own || own.Statistics.Anime.EpisodesWatched != 300 || len(own.Favourites.Anime) != 1 || own.Favourites.Anime[0].ID != 21 {
		t.Fatalf("own profile: %+v", own)
	}
	if len(own.Favourites.Manga) != 0 || own.Favourites.Manga == nil || len(own.Favourites.Characters) != 1 {
		t.Fatalf("favourites: %+v", own.Favourites)
	}
	if own.FollowingCount != 3 || own.FollowersCount != 5 || len(own.Following) != 1 || own.Following[0].Name != "Friend" {
		t.Fatalf("follows: %+v %d %d", own.Following, own.FollowingCount, own.FollowersCount)
	}
	// Kept: no new question.
	before := asked.Load()
	if _, err := p.Profile(ctx, "tester", false); err != nil || asked.Load() != before {
		t.Fatalf("own profile by its name asked again (%v)", err)
	}

	friend, err := p.Profile(ctx, "Friend", false)
	if err != nil {
		t.Fatal(err)
	}
	if friend.Own || friend.ID != 9 || !friend.IsFollowing {
		t.Fatalf("friend: %+v", friend)
	}
}

// A feed: list updates and posts, adult ones only when shown, messages and
// unknown kinds left out; a like changes what's kept.
func TestActivityFeed(t *testing.T) {
	var feeds atomic.Int32
	p := newTestPlatform(t, func(w http.ResponseWriter, req gqlRequest) {
		switch {
		case strings.Contains(req.Query, "activities("):
			feeds.Add(1)
			if req.Variables["following"] != true || req.Variables["userId"] != nil {
				t.Errorf("following feed asked with %v", req.Variables)
			}
			reply(w, 200, data(map[string]any{"Page": map[string]any{
				"pageInfo": map[string]any{"hasNextPage": true},
				"activities": []any{
					map[string]any{"__typename": "ListActivity", "id": 1, "status": "watched episode", "progress": "5", "user": map[string]any{"id": 9, "name": "Friend"}, "media": map[string]any{"id": 21}},
					map[string]any{"__typename": "ListActivity", "id": 2, "status": "watched episode", "progress": "1", "user": map[string]any{"id": 9, "name": "Friend"}, "media": map[string]any{"id": 22, "isAdult": true}},
					map[string]any{"__typename": "TextActivity", "id": 3, "text": "hello", "likeCount": 2, "user": map[string]any{"id": 9, "name": "Friend"}},
					map[string]any{"__typename": "MessageActivity"},
				},
			}}))
		case strings.Contains(req.Query, "ToggleLikeV2"):
			reply(w, 200, data(map[string]any{"ToggleLikeV2": map[string]any{"id": 3, "likeCount": 3, "isLiked": true}}))
		default:
			t.Errorf("unexpected query %s", op(req.Query))
		}
	})
	setLoggedIn(p, 7)
	ctx := context.Background()

	page, err := p.Activity(ctx, true, 0, 1, false)
	if err != nil {
		t.Fatal(err)
	}
	if !page.HasMore || len(page.Items) != 2 {
		t.Fatalf("feed: %+v", page)
	}
	if a := page.Items[0]; a.Kind != "list" || a.Progress != "5" || a.Media == nil || a.Media.ID != 21 {
		t.Fatalf("list activity: %+v", a)
	}
	if a := page.Items[1]; a.Kind != "text" || a.Text != "hello" || a.LikeCount != 2 {
		t.Fatalf("text activity: %+v", a)
	}
	// Kept a moment.
	if _, err := p.Activity(ctx, true, 0, 1, false); err != nil || feeds.Load() != 1 {
		t.Fatalf("asked again: %d (%v)", feeds.Load(), err)
	}
	// A like forgets what was kept: the feed is asked again (here with
	// adult entries shown).
	count, liked, err := p.ToggleLike(ctx, 3)
	if err != nil || count != 3 || !liked {
		t.Fatalf("like: %d %v %v", count, liked, err)
	}
	page, err = p.Activity(ctx, true, 0, 1, true)
	if err != nil || feeds.Load() != 2 || len(page.Items) != 3 {
		t.Fatalf("after a like, with adult entries: %d items, %d asked (%v)", len(page.Items), feeds.Load(), err)
	}
}

// Following oneself isn't a thing.
func TestToggleFollowSelf(t *testing.T) {
	p := newTestPlatform(t, nil)
	setLoggedIn(p, 7)
	if _, err := p.ToggleFollow(context.Background(), 7); err == nil {
		t.Fatal("followed oneself")
	}
}
