# Nyakuro for Windows

Nyakuro runs on Windows 10 and 11 (64-bit). The Windows build is released on its
own, as GitHub Releases named **Nyakuro X.Y.Z for Windows** (tag `windows-vX.Y.Z`).
None of it is for Linux: on Arch, keep installing Nyakuro from source with
[`packaging/arch`](../arch/PKGBUILD) as the [main README](../../README.md#install-arch-linux) says.

## Install

Open the [releases](https://github.com/v0-0x/Nyakuro/releases), take the
newest **Nyakuro X.Y.Z for Windows** and download one of:

| File | What it is |
|---|---|
| `Nyakuro-Setup-X.Y.Z-windows-x64.exe` | **Installer** (recommended). Installs Nyakuro for your Windows user, without admin rights, in `%LOCALAPPDATA%\Programs\Nyakuro` (you can pick another folder). Adds Start menu and desktop shortcuts. Uninstall it from **Settings › Apps**. Nyakuro then [updates itself](#updates). |
| `Nyakuro-X.Y.Z-windows-x64-portable.zip` | **Portable** build. Unzip it anywhere and run `Nyakuro.exe`; nothing gets installed. Your data still goes to the folders [below](#where-nyakuro-keeps-its-files). To update, download the newer zip. |

The builds aren't code-signed, so SmartScreen may show "Windows protected your
PC": click **More info**, then **Run anyway**.

## Programs Nyakuro uses

Some features use other programs. **Nyakuro downloads them for you**: click
**Install** on the Home page (it shows while ffmpeg or ani-cli is missing), or
**Settings › Desktop app & programs › Install**. Nyakuro then downloads their
ready-made Windows builds from their projects' release pages into its own
folder (`%APPDATA%\Nyakuro\bin`), for your Windows user only: no package
manager, no administrator rights, no window to follow. The page says which
program is downloading and how far it is.

| Program | Downloaded from | Checked against |
|---|---|---|
| ffmpeg and ffprobe | [BtbN's builds](https://github.com/BtbN/FFmpeg-Builds/releases) of the newest ffmpeg release ([Gyan's](https://github.com/GyanD/codexffmpeg/releases) when those can't be had) | BtbN's `checksums.sha256` |
| yt-dlp | [its releases](https://github.com/yt-dlp/yt-dlp/releases) | its `SHA2-256SUMS` |
| Git for Windows (PortableGit, unpacked in `bin\git`): its bash runs ani-cli | [its releases](https://github.com/git-for-windows/git/releases) | nothing published |
| ani-cli | the script in [its repository](https://github.com/pystardust/ani-cli) | nothing published |
| aria2 and fzf, which ani-cli uses | [aria2's](https://github.com/aria2/aria2/releases) and [fzf's](https://github.com/junegunn/fzf/releases) releases | fzf's checksums; the SHA-256 of aria2 1.37.0 |
| mpv, the optional external player | [mpv's releases](https://github.com/mpv-player/mpv/releases) | nothing published |

That's about 310 MB to download on a computer with none of them (roughly
800 MB once unpacked: ffmpeg and Git are large). Programs you already
have (anywhere on your `PATH`; Git for Windows where its installer puts it)
are skipped, so you can run it again whenever something is missing. A
download that fails is named with the reason, and the others are installed
all the same. mpv's own build needs Microsoft's Visual C++ runtime, which
most computers have from another program: without it the setup says so and
leaves mpv out. The code is
[`server/internal/winsetup`](../../server/internal/winsetup).

To install them yourself instead: **Settings** shows what Nyakuro found; for a
program that isn't on your `PATH`, enter its full path there.

| For | Install |
|---|---|
| The in-app player, for most files (MKV, HEVC, AC3/DTS, several tracks…), and episode downloads | ffmpeg: `winget install Gyan.FFmpeg` |
| Faster, more reliable episode downloads | yt-dlp: `winget install yt-dlp.yt-dlp` |
| mpv as the player (optional) | [mpv.io](https://mpv.io/installation/); then choose it in **Settings › Playback** |
| Sub/dub streaming with ani-cli | Git for Windows and ani-cli, [see below](#ani-cli) |
| Torrents | qBittorrent: `winget install qBittorrent.qBittorrent`, [then turn on its Web UI](#qbittorrent) |

Hardware encoding for the in-app player (**Settings › Video conversion**):
NVENC (NVIDIA) and Quick Sync (Intel) work on Windows; VA-API is
Linux only.

### ani-cli

ani-cli is a shell script, so it runs in the bash that comes with Git for
Windows (which also brings the curl, sed and grep it uses). Nyakuro's setup
downloads both. To do it by hand: `winget install Git.Git`, then save the
`ani-cli` script from the
[ani-cli repository](https://github.com/pystardust/ani-cli) in a folder on your
`PATH`, or anywhere and put its full path in **Settings › Online streaming ›
Executable**. Nyakuro finds Git's bash where Git's installer puts it
(`C:\Program Files\Git`), or on your `PATH`.

### qBittorrent

Nyakuro talks to qBittorrent through its Web UI, which is off by default. In
qBittorrent: **Tools › Options › Web UI**, tick **Web User Interface (Remote
control)**, and set a username and password. Then in Nyakuro, **Settings ›
Torrents**: host `127.0.0.1`, the same port as qBittorrent's (8080
unless you changed it), the same username and password. Nyakuro can start
qBittorrent when it's needed: the path (`C:\Program Files\qBittorrent\qbittorrent.exe`)
is found by itself.

## Where Nyakuro keeps its files

| Folder | What's in it |
|---|---|
| `%APPDATA%\Nyakuro` | Your data: the database (lists, library matches, settings, watch progress), downloaded artwork, extension storage; in `bin`, the [programs Nyakuro downloaded](#programs-nyakuro-uses) |
| `%LOCALAPPDATA%\Nyakuro` | Cache and temporary files: the in-app player's segments (`hls`), the running server's address and token (`run`), the app window's browser data (`electron`), the last downloaded update (`update`) |
| `%LOCALAPPDATA%\Programs\Nyakuro` | The app, when installed with the installer |

Uninstalling keeps your data; delete the first two folders to remove it too.

The installer offers to add a **Windows Firewall rule** for `nyakuro.exe` on
private networks (TCP 43211 for the apps and devices, UDP 43212 for the
announcements the Nyakuros find each other by); Windows asks for an
administrator's permission once. Without the rule, Windows Firewall asks
whether `nyakuro.exe` may accept connections when **Allow devices on my
network** is turned on (allow it on **private** networks), and it keeps
dropping the other devices' announcements, so a media server or another
Nyakuro shows as offline now and then between its answers (Settings › Devices
says "its announcements aren't getting through"). Add the rule by hand in
an administrator PowerShell:

```powershell
netsh advfirewall firewall add rule name="Nyakuro" dir=in action=allow program="$env:LOCALAPPDATA\Programs\Nyakuro\resources\nyakuro.exe" protocol=TCP localport=43211 profile=private
netsh advfirewall firewall add rule name="Nyakuro" dir=in action=allow program="$env:LOCALAPPDATA\Programs\Nyakuro\resources\nyakuro.exe" protocol=UDP localport=43212 profile=private
```

`nyakuro.exe --web-ui` (in the app's `resources` folder) runs the server alone,
without the window: the web UI is then at `http://127.0.0.1:43211`. The app
window uses that server when it's already running.

## Updates

Nyakuro looks for a newer release on GitHub each time it opens, and every
6 hours (**Settings › Updates & about** shows the last check and checks right
away). When there is one, the **Home** page shows it, with what changed:

- **Installed** with the installer: click **Update**. Nyakuro downloads the new
  installer, checks it against GitHub's checksum, then closes; the installer
  updates Nyakuro where it's installed, without asking anything, and opens it
  again. Your data stays as it is.
- **Portable**: Nyakuro can't update a folder you unzipped yourself. The Home
  page links the new release: download the new zip and use it instead of the
  old folder (your data is in `%APPDATA%\Nyakuro`, not in that folder).

Update checks need no GitHub account. (If you're signed in with the GitHub
CLI, `gh`, or have a token in `NYAKURO_GITHUB_TOKEN`, `GH_TOKEN` or
`GITHUB_TOKEN`, Nyakuro uses it, which raises GitHub's limit on requests.)

## Build it yourself

On Windows, with Go, Node.js and Git:

```powershell
winget install GoLang.Go
winget install OpenJS.NodeJS.LTS
winget install Git.Git
git clone https://github.com/v0-0x/Nyakuro nyakuro
cd nyakuro
powershell -ExecutionPolicy Bypass -File packaging\windows\build.ps1
```

[`build.ps1`](build.ps1) does what the release workflow does: builds the web
UI, embeds it into the server, runs `go vet` and `go test` (the ani-cli tests
use Git's bash; `-SkipTests` skips the tests), builds `dist\windows\nyakuro.exe`,
then packages the app with electron-builder
([`desktop/electron-builder.yml`](../../desktop/electron-builder.yml)). The
installer and the zip land in `dist\windows\release`. Unlike a release, a
build of your own keeps the version in `desktop/package.json` (2.0.0), so
Nyakuro offers it the newest release as an update.

For development, `cd desktop; npm ci; npx electron .` starts the window with
`dist\windows\nyakuro.exe`. On Linux, `make windows` cross-compiles that
`nyakuro.exe` (the installer is built on Windows).

## How releases are made

The [Windows release](../../.github/workflows/windows.yml) workflow builds,
tests and packages everything on a Windows machine, then creates the release
`windows-v<version>` on the commit it built. It runs on every push to the
default branch (pushes that only change docs or the Arch packaging aside), so
installed copies get every change as an update a few minutes later. It also
runs from the repository's **Actions** tab (**Windows release**): with
**publish** ticked it creates the release (running it again on the same
commit updates it, replacing files of the same name); untick it to only get
the files as workflow artifacts.

The version is `2.0.<commits since 2.0.0's>`: the first two numbers come from
`desktop/package.json`, the last one grows with every commit (counted from
the commit its `nyakuroVersionBase` names, 2.0.0's), so there's nothing to bump
by hand. Releases before 2.0 were `1.0.<number of commits>`. The workflow builds it into `nyakuro.exe` with the
commit, and installed copies of Nyakuro offer the release with the highest
version as their update. The Arch package gets the same version from its
PKGBUILD.

Each build is published as a **beta** first: a pre-release titled
"Nyakuro <version> beta for Windows", which installed copies offer only with
Settings › Updates & about › Beta updates on. A build becomes a **stable**
release (for everyone, and the repository's latest) when the pushed commit's
message has `[stable]` in it, or when the workflow is run by hand from the
Actions tab with channel "stable" (on a beta's commit, that turns the beta
into a stable release). The newest 10 stable releases and the newest 10 betas
are kept: the workflow deletes older ones, and their tags.
