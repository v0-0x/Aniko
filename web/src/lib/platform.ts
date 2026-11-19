// The computer Nyakuro runs on (status.platform: Go's GOOS), for install hints
// and examples. The server's error messages use the same commands
// (server/internal/util/hints.go).

export type Tool = "ffmpeg" | "mpv" | "yt-dlp" | "ani-cli"

export function platformName(platform?: string) {
    return platform === "windows" ? "Windows" : platform === "darwin" ? "macOS" : platform === "android" ? "Android" : "Linux"
}

export function installHint(platform: string | undefined, tool: Tool) {
    if (platform === "windows") {
        return {
            ffmpeg: "winget install Gyan.FFmpeg",
            mpv: "mpv.io",
            "yt-dlp": "winget install yt-dlp.yt-dlp",
            "ani-cli": "github.com/pystardust/ani-cli",
        }[tool]
    }
    if (platform === "darwin") return tool === "ani-cli" ? "brew tap pystardust/ani-cli https://github.com/pystardust/ani-cli.git && brew install ani-cli" : `brew install ${tool}`
    return tool === "ani-cli" ? "yay -S ani-cli" : `sudo pacman -S ${tool}`
}

// Where the hint comes from, said before it.
export function installSource(platform: string | undefined, tool: Tool) {
    // Nyakuro downloads them itself on the computer it runs on (Settings › Desktop app & programs).
    if (platform === "windows") return tool === "ani-cli" || tool === "mpv" ? "Nyakuro can download it (Desktop app & programs › Install), or get it from" : "Install it with"
    if (platform === "darwin") return tool === "ani-cli" ? "Install it from its Homebrew tap (brew.sh):" : "Install it with Homebrew (brew.sh):"
    return tool === "ani-cli" ? "Install it from the AUR with" : "Install it with"
}

export function exampleMpvPath(platform?: string) {
    return platform === "windows" ? "C:\\Program Files\\mpv\\mpv.exe" : platform === "darwin" ? "/opt/homebrew/bin/mpv" : "/usr/bin/mpv"
}
