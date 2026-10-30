<p align="center"><img src="packaging/icons/aniko-128.png" width="96" alt="Aniko"></p>

<h1 align="center">Aniko</h1>

<p align="center">An anime app for Arch Linux, Windows, macOS and Android TV (Fire TV): your AniList, your local library, ani-cli streaming, torrents and an extension marketplace — in one app that only ever talks to your own computer and home network.</p>

<p align="center">Aniko was called <b>Kumo</b> before 2.0.37: see <a href="#from-kumo">From Kumo</a>.</p>

---

## Features

**Library**
- Scans your anime folders (plus extra folders), parses every file name and **matches it to AniList automatically**: seasons, parts, absolute numbering (e.g. `One Piece - 1050`, `JJK - 30` → season 2 ep 6), movies, OVAs/specials, NCOP/NCED.
- Works with **every video format**: mkv, mp4, avi, webm, mov, wmv, flv, ts/m2ts, ogm, rmvb, vob, 3gp, divx and more.
- **Auto refresh**: watches the folders and rescans when files appear, and refreshes on startup.
- **Local library** page with only the anime you have on disk: recently added, filters by list status and by type (TV series, movies, or OVAs, ONAs and specials), sort by added/unwatched/size, grid or list view with downloaded episode ranges, size, resolution and release group, and one-click "play next".
- **Library sharing** between the Aniko apps on your computers at home: they find each other by themselves (or by address). On the computer with the anime, turn on **Share my library** for the others in **Settings › Other devices**: its anime show up on theirs (a tab on the Local library page, and on each anime's page) and play like local files, converted by the computer that has them when needed. Watching updates the list (AniList or local) of the computer you watch on, never the other's. On the same AniList account, Continue watching carries over to the second (live to the computer whose files you watch), and episodes watched on any device come first; positions saved while the other was off are sent when it's back, it syncs by itself when a device comes back on the network or the TV app is opened again, and **Sync** on Home brings both up to date at once. A computer that's asleep can be **woken from the TV** (Home or Settings › Other devices; Wake-on-LAN on in its settings), and it **stays awake while another device plays its anime**. Settings › Other devices lists every Aniko with its version, and Home asks whether to share with a new one (a TV) when it shows up.
- Library tools to fix matches by hand, change episode numbers, lock files and ignore junk; **Missing episodes** (the gaps in the library and the episodes aired since, with torrents a click away); **Clean up** (how full the drive is, episodes watched a while ago, episodes there twice, put away into a trash that can be undone for 30 days).
- Safe with removable drives: an unplugged or unmounted library folder keeps its matches; symlinked folders are followed.
- **Artwork & metadata**: covers, banners, fanart, descriptions, genres, studios, characters, relations, recommendations, **episode titles, summaries and thumbnails** (AniList + ani.zip). All artwork is **downloaded to a local cache**, so it loads instantly and still shows offline.

**Watching**
- **mpv** (desktop media player, controlled over IPC) or the **in-app player**.
- In-app player plays any file: direct play when the browser can, otherwise ffmpeg **remuxes or transcodes on the fly** (VA-API / NVENC / QSV supported). Embedded and external subtitles (ASS/SRT/VTT) and audio-track switching are supported.
- **Resume exactly where you stopped**: the position is saved every few seconds, in both players.
- **Remembers your audio and subtitle track per anime.** Pick "Japanese + English Full Subs" once and every next episode opens with the same tracks, matched by language and title, so it works even when the track order changes.
- Auto skip openings, endings, recaps and the next episode's preview (AniSkip), an **Up next** card in the ending, auto play next, Start over, "Continue watching" row, now-playing bar for mpv.
- **Previews on the seek bar** (also where Left/Right go on a TV), and **subtitles your way**: size, background and position for each device, timing moved with z / x (kept per anime).
- **Picture in picture** in the desktop app (p): the episode goes on in a small window on top of the others, with Aniko's controls, subtitles and Up next, while you use Aniko or anything else; its button brings it back to the big player where it's at.
- Progress syncs to AniList automatically after an episode passes the completion threshold you set.

**Streaming & downloads (ani-cli)**
- Sub **and** dub streaming through your installed **ani-cli**. Aniko drives ani-cli non-interactively (no fzf pop-ups), so updating ani-cli (`ani-cli -U` / AUR) keeps it working when sites change.
- Per-anime sub/dub choice, quality, manual "wrong match?" fixing.
- **Download episodes** (single or ranges) with yt-dlp or ffmpeg straight into your library; they're matched instantly.
- Plus any **online-streaming extension** from the marketplace (HiAnime, AnimeAV1, …).

**Torrents**
- **qBittorrent** (Web UI API, v4 and v5) and **Transmission** sync: list, pause/resume, remove (with data), open folder, active count in the sidebar. Aniko can launch the client for you.
- Smart search on **Nyaa** and **AnimeTosho** (or extension providers): episode, batch, resolution, release group, seeders, dual-audio badges.
- **Auto downloader**: RSS rules per anime (release groups, resolutions, keywords, min seeders).

**AniList**
- Log in with AniList (client `13985`). The desktop window captures the token automatically, or you can paste it.
- Lists, progress, status, scores, rewatches; discover, search with filters, airing schedule.
- Works without an account too: your list is stored locally.

**Extensions & plugins**
- Built-in browser for the **[extension marketplace](https://raw.githubusercontent.com/Bas1874/Seanime-Marketplace/refs/heads/main/Marketplace/Main.json)** (any compatible index URL works): install, update, configure and uninstall.
- Runs **online-streaming, torrent and manga providers** in a sandboxed JavaScript runtime with the APIs marketplace extensions use (`fetch`, `LoadDoc`, `CryptoJS`, `$store`, `$storage`, `$habari`, user config…).
- **UI plugins**: trays, anime-page buttons, webviews, toasts, storage, AniList access, `$ui.register`, `ctx.state/effect/fieldRef`, … All 15 most-starred marketplace plugins load. Plugins that rewrite the app's own pages (`ctx.dom`) or need file/command access only partly work, because Aniko deliberately doesn't allow either.
- **Manga** reader (long strip, single pages or two-page spreads, LTR / RTL) using manga provider extensions.

**Your anime**
- **Alerts** when a new episode of what you're watching airs, or episodes are ready to watch (a download or a torrent finished): in Aniko, or as the system's notifications.
- **What should I watch?** (the dice on Home) picks an anime from your list. **Stats**: your anime in numbers, and what you watched month by month.
- **Backup and restore** (Settings › Backup & data): settings, watch history, list, choices, matches, auto downloader rules and extensions as one file; restoring merges with what's there.

**Extras**: can keep running in the tray (or the Dock) when its window is closed, so streaming to other devices and downloads go on, and start in the background when you log in (Settings › Desktop app & programs, both off unless you turn them on); updates itself from the Home page, Discord rich presence (local IPC), **color themes** (Midnight, Forest, Sakura, Ember, Ocean, Dusk, true Black…) and accent colours, **holiday themes** that come on by themselves in their month, each with its own colours, decorations and animation (Halloween's moon, cobweb and bats in October, Christmas lights and snow in December, Valentine's hearts in February, a cherry branch and falling petals in April, summer lanterns and fireflies in August, New Year's fireworks), or always one, or none — all switched from **Themes** in the sidebar (or Settings › Appearance), along with the **classic look** (Aniko as it looked before 2.0), spoiler blur, Ctrl+K quick search, server logs and cache viewer.

## Closed network by design

| Who | Access |
|---|---|
| The desktop window | Always (authenticated with a per-run token) |
| A browser on this PC | Only when **Settings › Network & web UI** is on (`http://127.0.0.1:43211`) |
| Devices on your home network | Only when **Allow devices on my network** is on. They can be password protected, and can't change paths/programs or browse folders. |
| Aniko on your other computers and TVs | With **Library sharing** on: they see it, and only those you turn on get the library, and nothing else unless you also share your AniList account or let them download there (each Aniko has its own key pair; requests are signed, and play only files of the library). |
| Other apps on an Android TV or phone | **Never**: the Aniko app's own window proves itself with a per-install token. |
| Anything on the internet | **Never** (connections from public IP addresses are refused) |

The server also rejects other websites' requests (Origin check) and DNS rebinding tricks (Host check). Extensions and the stream/image proxies can't connect to localhost or your LAN. Plugins get no file or command access. Nothing is sent anywhere except the services you use (AniList, ani.zip, AniSkip, the torrent and stream sites you search).

## Install (Arch Linux)

```bash
sudo pacman -S --needed base-devel go nodejs npm electron mpv ffmpeg
yay -S ani-cli            # sub/dub streaming & downloads (recommended)
sudo pacman -S yt-dlp     # optional, better downloads
git clone https://github.com/v0-0x/Aniko aniko && cd aniko
cd packaging/arch && makepkg -si
```

No git? Download the source from GitHub (**Code › Download ZIP**), unpack it (`bsdtar -xf Aniko-*.zip`) and run `makepkg -si` in its `packaging/arch` folder.

Start **Aniko** from your app menu (or run `aniko`).

### From Kumo

Aniko was called Kumo before 2.0.37, and every copy updates to Aniko by itself, with its library, history, settings and logins (its data folder moves to Aniko's the first time it starts):

- **Arch Linux**: Kumo's **Update** button installs Aniko as before. With `git pull && cd packaging/arch && makepkg -sif`, pacman asks once whether to remove `kumo` (the old package): answer `y`.
- **Windows**: the update moves the app to an Aniko folder, with new shortcuts. A taskbar pin of Kumo's may need pinning again.
- **macOS**: the update arrives in the app still named Kumo.app, which renames itself Aniko.app when it opens (and opens again from there).
- **Android TV**: the update installs over Kumo in place.
- **Kumo Hub** updates itself to Aniko Hub, still as the `kumo-hub` service. Running the [install command](#aniko-hub-raspberry-pi) again moves it to the new names (`aniko-hub`), with its data.

### Updates
When GitHub has a newer Aniko, the **Home** page shows it with an **Update** button: Aniko downloads the new source, builds it with makepkg and installs the package with pacman (a password dialog asks for your password); **Restart Aniko** then starts the new version. **Settings › Updates & about** shows the version and the last check, and checks again right away.

**Stable or beta.** Each new version comes out as a **beta** first (a pre-release on GitHub), and the ones ready for everyone as a stable release. Aniko offers only stable releases, unless **Settings › Updates & about › Beta updates** is on: then betas too, as soon as they're out. Turning it off waits for the next stable release (a beta you have stays until one passes it). On Arch, a stable update builds the newest stable release's commit and a beta update the branch's newest commit.

Update checks need no GitHub account. Without a password dialog (e.g. when Aniko runs as the `aniko-server` service), Aniko builds the update and shows the `sudo pacman -U …` command to run.

You can still update by hand, in the folder you cloned Aniko into:

```bash
pkill -f /usr/lib/aniko          # Aniko can't be replaced while it runs
git remote set-url origin https://github.com/v0-0x/Aniko.git   # once, for a clone of an old address
git pull && cd packaging/arch && makepkg -sif
```

`git pull` gets the newest commit, which is the newest beta. `-f` rebuilds (without it makepkg reinstalls the package it built last time). Build from a `git clone`, not a downloaded ZIP: without git the package's version can't be read and stays 1.0.0, which pacman then calls a downgrade and the updater an old version.

The **Update** button asks for your password with your desktop's polkit agent. Desktops like GNOME and KDE have one; on a bare window manager (Hyprland, Sway, i3…) start one (e.g. `polkit-gnome`'s `/usr/lib/polkit-gnome/polkit-gnome-authentication-agent-1`), or Aniko shows the `sudo pacman -U …` command to run instead.

### First run
1. **Settings › Local library**: pick your folder (e.g. `/mnt/big/Media/Anime`) and save. The first scan starts on its own.
2. Click your avatar, then **Log in with AniList** (optional).
3. **Settings › Torrents**: enter your qBittorrent Web UI details (host `127.0.0.1`, port, user, password, and the executable, e.g. `/var/lib/flatpak/exports/bin/org.qbittorrent.qBittorrent`).
4. **Extensions › Marketplace**: add providers or plugins.

### Headless / other devices
```bash
systemctl --user enable --now aniko-server   # server only, web UI on 127.0.0.1:43211
loginctl enable-linger "$USER"              # and started at boot, before you log in
```
With linger on, the PC's library is there for the TV as soon as the PC is on, not only once you've logged in. Turn on **Allow devices on my network** (with a password) to use Aniko from your phone or a browser at `http://<pc-name>.local:43211`. The desktop app attaches to the running server.

## Windows

Aniko also runs on Windows 10/11 (64-bit), released separately from the Arch package: get the installer (`Aniko-Setup-X.Y.Z-windows-x64.exe`) or the portable zip from the newest **Aniko X.Y.Z for Windows** [release](https://github.com/v0-0x/Aniko/releases) (tag `windows-vX.Y.Z`). Those files are Windows-only; on Arch, use the PKGBUILD above. The installer also offers to install the programs Aniko uses (Git, ani-cli, ffmpeg, mpv, yt-dlp…) with Scoop, and the installed app updates itself from its Home page too.

What to install alongside it (ffmpeg, mpv, yt-dlp, ani-cli, qBittorrent), where it keeps its data, how to build it and how releases are made: [packaging/windows/README.md](packaging/windows/README.md).

## macOS

Aniko runs on macOS 13 Ventura or newer, on Apple silicon and Intel Macs (one universal app): get the disk image (`Aniko-X.Y.Z-macos-universal.dmg`) from the newest **Aniko X.Y.Z for macOS** [release](https://github.com/v0-0x/Aniko/releases) (tag `macos-vX.Y.Z`) and drag Aniko to Applications. It isn't notarized by Apple: the first time, allow it in System Settings › Privacy & Security (**Open Anyway**). Aniko downloads the programs it uses (ffmpeg, yt-dlp, ani-cli) from its Settings, with no Homebrew needed, and updates itself from its Home page.

How to open it the first time, where it keeps its data, how to build it: [packaging/macos/README.md](packaging/macos/README.md).

## Android / Fire TV

Aniko for Android is made for TVs (a Fire TV Stick, Android TV) and plays the libraries the computers at home share, with the remote: get `Aniko-X.Y.Z-android.apk` from the newest **Aniko X.Y.Z for Android** [release](https://github.com/v0-0x/Aniko/releases) (tag `android-vX.Y.Z`). On a Fire TV, install the **Downloader** app, allow it in Settings › My Fire TV › Developer options › Install unknown apps, and open the APK's address in it. Then, on a computer with Aniko, turn on **Library sharing** (Settings › Other devices): the TV shows up there. Turn on **Share my library** for it, and if you like **Share my AniList account** (the TV uses your account, with no login on the TV) and **Let it download here** (the TV's downloads and torrents go to that computer, and it becomes where the TV downloads by default). Its downloads page and auto downloader then work on that computer. The app updates itself from its Home page (if Android's install question was cancelled, **Install** asks again); see [android/README.md](android/README.md).

When something doesn't play right on the TV (no picture, it stops), the TV writes what it saw to its log and to the computer's (Settings › Logs & cache), which helps find out why.

## Aniko Hub (Raspberry Pi)

Aniko Hub is Aniko without a player, for a computer that stays on, like a Raspberry Pi 4: it shares its library with the Aniko apps at home, streams to them (converting with the Pi's video chip what a device can't play), keeps the devices on the same AniList account in step as they watch (progress, list, theme), takes their downloads if you let it, and has a dashboard in the browser showing what it streams to whom and how the Pi is doing. On the Pi:

```bash
curl -fsSL https://raw.githubusercontent.com/v0-0x/Aniko/HEAD/packaging/hub/install.sh | bash
```

Then open `http://<your Pi>.local:43211` and follow [packaging/hub/README.md](packaging/hub/README.md). Releases are tagged `hub-vX.Y.Z`; the hub updates itself from its dashboard.

## Development

```bash
make            # builds web/ and embeds it into dist/aniko
make test       # Go tests (library parser, ani-cli driver, extensions, security)
./dist/aniko --web-ui              # server + web UI at http://127.0.0.1:43211
cd web && npm run dev             # UI dev server on :43000 (proxies /api)
cd desktop && npm i && npx electron .   # desktop window (uses ../dist/aniko)
```

| Path | What |
|---|---|
| `server/` | Go server: AniList, scanner/matcher, mpv IPC, ani-cli driver, downloads, torrents, extension runtime (goja), API |
| `web/` | React + Tailwind UI (embedded into the binary) |
| `desktop/` | Electron shell (system `electron` on Arch; bundled by electron-builder for Windows and macOS) |
| `packaging/` | PKGBUILD, launcher, `.desktop`, icons, systemd user unit; `windows/`: Windows build script and notes; `macos/`: the app icon and notes |

Data lives in `~/.local/share/aniko` (SQLite database, artwork cache, extension storage; `%APPDATA%\Aniko` on Windows, `~/Library/Application Support/Aniko` on macOS).

## Notes
- AniList's API may rate-limit large first scans; Aniko waits and retries automatically.
- Image-based subtitles (PGS/VobSub) only render in mpv.
- Aniko is a personal project, unaffiliated with AniList or ani-cli. Licensed GPL-3.0.
