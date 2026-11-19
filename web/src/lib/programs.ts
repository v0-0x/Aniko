// The programs Nyakuro uses and the setup that installs them: on Windows
// server/internal/winsetup (Nyakuro downloads ffmpeg, yt-dlp, ani-cli, mpv…
// itself, into its own folder), on macOS server/internal/macsetup (the same,
// in a Terminal window).
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { toast } from "@/lib/toast"
import { api } from "./api"
import type { Status } from "./types"

// The programs that aren't installed, the ones most of Nyakuro needs first.
export function missingPrograms(status?: Status) {
    const f = status?.features
    if (!f) return []
    const all: [string, boolean][] = [
        ["ffmpeg", f.ffmpeg],
        ["ani-cli", f.aniCli],
        ["mpv", f.mpv],
        ["yt-dlp", f.ytDlp],
    ]
    return all.filter(([, ok]) => !ok).map(([name]) => name)
}

// Whether Nyakuro can install its programs itself: on Windows and macOS, from
// this computer (not from another device on the network).
export function canInstallPrograms(status?: Status) {
    return (status?.platform === "windows" || status?.platform === "darwin") && status.client !== "lan"
}

// The window the setup runs in, on macOS (on Windows there is none: the
// pages show how far it is).
export function setupWindow(_status?: Status) {
    return "Terminal"
}

export function useInstallPrograms(status?: Status) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.post("/api/setup/programs"),
        onSuccess: () => {
            if (status?.platform === "darwin") toast.success(`Nyakuro's setup opened in a ${setupWindow(status)} window`)
            qc.invalidateQueries({ queryKey: ["status"] })
        },
        onError: (e: any) => toast.error(e.message),
    })
}

// While the setup window is open, checks every few seconds which programs
// are there, so they show up as soon as they're installed.
export function useWatchSetup(status?: Status) {
    const qc = useQueryClient()
    const running = !!status?.setupRunning
    useEffect(() => {
        if (!running) return
        const t = setInterval(() => qc.invalidateQueries({ queryKey: ["status"] }), 4000)
        return () => clearInterval(t)
    }, [running, qc])
}
