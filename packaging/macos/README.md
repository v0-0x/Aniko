# Aniko for macOS

Aniko runs on macOS 13 Ventura or newer, on Apple silicon and Intel Macs: one
universal app for both. It's the same Aniko as on Linux and Windows: a local
server with the app's window on top of it.

## Install

1. Download `Aniko-X.Y.Z-macos-universal.dmg` from the newest **Aniko X.Y.Z for
   macOS** [release](https://github.com/v0-0x/kumo-anime/releases) (tag
   `macos-vX.Y.Z`).
2. Open it and drag **Aniko** onto **Applications**.
3. Open Aniko from your Applications folder.

Aniko isn't notarized by Apple (that takes a paid Apple Developer account), so
the first time macOS says it can't check Aniko for malicious software:

- **macOS 15 Sequoia and newer:** click **Done**, then go to **System Settings
  › Privacy & Security**, scroll down to the message about Aniko and click
  **Open Anyway** (macOS asks for your password).
- **macOS 13 and 14:** Control-click Aniko in Applications, choose **Open**, then
  **Open** again.

Or, in Terminal, once: `xattr -dr com.apple.quarantine /Applications/Aniko.app`

## Programs Aniko uses

| Program | For |
|---|---|
| ffmpeg | The in-app player (most files) and episode downloads |
| ani-cli | Sub/dub streaming and downloads |
| mpv | The external player |
| yt-dlp | Faster, more reliable episode downloads |

**Settings › Desktop app & programs › Install missing programs** downloads ready-made
ffmpeg, ffprobe, yt-dlp and ani-cli for your Mac (Apple silicon or Intel) into
Aniko's own folder, `~/Library/Application Support/Aniko/bin`, in a Terminal
window: no Homebrew, no password. ffmpeg comes from
[Martin Riedl's builds](https://ffmpeg.martin-riedl.de) (and
[evermeet.cx](https://evermeet.cx/ffmpeg/) on Intel), yt-dlp and ani-cli from
their GitHub projects.

mpv, the external player, is optional (Aniko's own player doesn't need it). On
an Apple silicon Mac with [Homebrew](https://brew.sh) the setup installs it
with `brew install mpv`; otherwise get it from
[mpv.io](https://mpv.io/installation/). Homebrew no longer builds ready-made
packages for Intel Macs, so there it would compile everything for a long time.

Aniko also finds programs installed with Homebrew (`/opt/homebrew/bin` on Apple
silicon, `/usr/local/bin` on Intel), even when it's opened from the Dock, which
doesn't give apps those folders.

For torrents, Aniko talks to qBittorrent's Web UI (or Transmission): install
[qBittorrent](https://www.qbittorrent.org), turn on its Web UI, and set the
address and login in **Settings › Torrents**.

## Where Aniko keeps its files

| What | Where |
|---|---|
| Settings, database, artwork, extensions | `~/Library/Application Support/Aniko` |
| The window's own data (cookies of the AniList login) | `~/Library/Application Support/Aniko/electron` |
| Programs the setup downloaded | `~/Library/Application Support/Aniko/bin` |
| Updates being downloaded | `~/Library/Caches/aniko/update` |
| The local library, by default | `~/Movies/Anime` |

## Updates

Aniko checks GitHub for a newer macOS release, and the **Update** button on its
Home page installs it: Aniko downloads the new app, puts it in place of the old
one, closes and opens again. That works once Aniko is in a folder you can write
to (your Applications folder): not from the disk image, nor from your Downloads
folder before you've moved it. If macOS says Aniko was prevented from modifying
apps, allow it in **System Settings › Privacy & Security › App Management**, or
download the new version from its release page.

## Build it yourself

On a Mac with Go, Node.js and the Xcode command line tools:

```bash
make macos                 # web UI, then the servers for Intel and Apple silicon
cd desktop && npm ci
npx electron-builder --mac --universal -c.directories.output=../dist/macos/release
```

The app, the disk image and the zip land in `dist/macos/release`.
`make macos` works on Linux too (the servers cross-compile); the app itself
needs a Mac.

## How releases are made

The **macOS release** workflow (`.github/workflows/macos.yml`) builds, tests
and packages Aniko on a GitHub-hosted Mac for every push to the default branch,
checks the app (both architectures, its signature, the zip as an update
unpacks it, and that it starts), and publishes the release
`macos-v<version>`. The version is `2.0.<commits since 2.0.0's>`, like the Windows
release's. Each build is a beta (a pre-release) unless its commit's message
says `[stable]` or it's run by hand as stable (see packaging/windows/README.md).
The newest 10 stable macOS releases and the newest 10 betas are kept.
