import { toast } from "@/lib/toast"
import { api } from "./api"
import { useStatus } from "./queries"
import { playerStore } from "./store"

// Central place deciding between mpv and the in-app player.
export function usePlay() {
    const { data: status } = useStatus()
    const settings = status?.settings
    const remote = status?.client === "lan" // LAN devices can't use this PC's mpv

    const localPlayer = (override?: "mpv" | "builtin") => (remote ? "builtin" : override ?? settings?.playback.defaultPlayer ?? "builtin")
    const streamPlayer = (override?: "mpv" | "builtin") => (remote ? "builtin" : override ?? settings?.aniCli.player ?? "builtin")

    const playLocal = async (path: string, mediaId: number, episode: number, opts: { player?: "mpv" | "builtin"; start?: number } = {}) => {
        if (localPlayer(opts.player) === "builtin") {
            playerStore.set({ kind: "local", path, mediaId, episode, start: opts.start })
            return
        }
        const t = toast.loading("Opening mpv…")
        try {
            await api.post("/api/playback/local", { path, mediaId, episode, player: "mpv", start: opts.start })
            toast.success("Playing in mpv", { id: t })
        } catch (e: any) {
            toast.error(e.message, { id: t })
        }
    }

    // Plays a torrent (a Torrents tab result) as it downloads, here: the
    // episode's file of it, in the in-app player (as a library file is,
    // by its torrent: path) or mpv.
    const streamTorrent = async (mediaId: number, episode: number, r: { magnetLink?: string; infoHash?: string; name: string }, opts: { player?: "mpv" | "builtin" } = {}) => {
        const player = localPlayer(opts.player)
        const t = toast.loading("Connecting to the torrent's peers…")
        try {
            const res = await api.post<{ player: string; path: string }>("/api/torrents/stream", {
                mediaId,
                episode,
                magnet: r.magnetLink || undefined,
                infoHash: r.infoHash || undefined,
                name: r.name,
                player,
            })
            if (res.player === "builtin") {
                toast.dismiss(t)
                playerStore.set({ kind: "local", path: res.path, mediaId, episode })
            } else {
                toast.success("Playing in mpv", { id: t })
            }
        } catch (e: any) {
            toast.error(e.message, { id: t })
        }
    }

    const playStream = async (provider: string, mediaId: number, episode: number, dub: boolean, opts: { player?: "mpv" | "builtin"; server?: string } = {}) => {
        if (streamPlayer(opts.player) === "builtin") {
            playerStore.set({ kind: "stream", provider, mediaId, episode, dub, server: opts.server })
            return
        }
        const t = toast.loading(provider === "ani-cli" ? "Asking ani-cli for the stream…" : "Resolving stream…")
        try {
            await api.post("/api/onlinestream/play", { provider, mediaId, episode, dub, server: opts.server })
            toast.success("Playing in mpv", { id: t })
        } catch (e: any) {
            toast.error(e.message, { id: t })
        }
    }

    return { playLocal, playStream, streamTorrent, localPlayer, streamPlayer, remote }
}
