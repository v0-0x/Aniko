import { useQuery, type QueryClient } from "@tanstack/react-query"
import { api } from "./api"
import { createStore, playerStore, type PlayerRequest } from "./store"

// Playlists (the server's internal/playlist): a name and episodes in your
// order, each with how the in-app player plays it (a PlayerRequest without
// where it starts).
export type PlaylistPlay = { kind: "local"; path: string } | { kind: "stream"; provider: string; dub?: boolean; server?: string }
export type PlaylistItem = { mediaId: number; episode: number; title: string; image?: string; play: PlaylistPlay }
export type Playlist = { id: string; name: string; items: PlaylistItem[]; at: number }

const fix = (p: Playlist): Playlist => ({ ...p, items: p.items ?? [] })

export function usePlaylists() {
    return useQuery({ queryKey: ["playlists"], queryFn: () => api.get<Playlist[]>("/api/playlists"), select: ps => (ps ?? []).map(fix) })
}

// The server's answer to a change: the playlist as it is now, put in the
// cache (the list too).
export function keepPlaylist(qc: QueryClient, p: Playlist | null, removed?: string) {
    qc.setQueryData<Playlist[]>(["playlists"], ps => {
        const rest = (ps ?? []).filter(x => x.id !== (p?.id ?? removed))
        return p ? [...rest, fix(p)].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })) : rest
    })
}

export const playlists = {
    create: (name: string, items: PlaylistItem[] = []) => api.post<Playlist>("/api/playlists", { name, items }),
    add: (id: string, items: PlaylistItem[]) => api.post<Playlist>(`/api/playlists/${id}/items`, { items }),
    rename: (id: string, name: string) => api.patch<Playlist>(`/api/playlists/${id}`, { name }),
    remove: (id: string, index: number) => api.del<Playlist>(`/api/playlists/${id}/items/${index}`),
    move: (id: string, from: number, to: number) => api.post<Playlist>(`/api/playlists/${id}/move`, { from, to }),
    delete: (id: string) => api.del(`/api/playlists/${id}`),
}

export function requestOf(it: PlaylistItem): PlayerRequest {
    return it.play.kind === "local"
        ? { kind: "local", path: it.play.path, mediaId: it.mediaId, episode: it.episode }
        : { kind: "stream", provider: it.play.provider, dub: !!it.play.dub, server: it.play.server, mediaId: it.mediaId, episode: it.episode }
}

// Whether the player plays this item (where it starts and its tracks aside).
export function isItem(req: PlayerRequest | null, it: PlaylistItem | undefined): boolean {
    if (!req || !it || req.mediaId !== it.mediaId || req.episode !== it.episode || req.kind !== it.play.kind) return false
    return req.kind === "local" ? it.play.kind === "local" && req.path === it.play.path : it.play.kind === "stream" && req.provider === it.play.provider
}

// The playlist being played, and where it's at: kept here, so it outlives
// the player (made anew for each episode). Gone when the player closes or
// plays something else.
export type PlaylistPosition = { id: string; name: string; items: PlaylistItem[]; index: number }
export const playlistStore = createStore<PlaylistPosition | null>(null)

playerStore.subscribe(() => {
    const p = playlistStore.get()
    if (p && !isItem(playerStore.get(), p.items[p.index])) playlistStore.set(null)
})

// Plays a playlist from an item.
export function playPlaylist(p: Playlist, index = 0) {
    const it = p.items[index]
    if (!it) return
    playlistStore.set({ id: p.id, name: p.name, items: p.items, index })
    playerStore.set(requestOf(it))
}

// The playlist's next item, played: false when it was the last.
export function playlistNext(): boolean {
    const p = playlistStore.get()
    const it = p?.items[p.index + 1]
    if (!p || !it) return false
    playlistStore.set({ ...p, index: p.index + 1 })
    playerStore.set(requestOf(it))
    return true
}
