// Aniko desktop shell.
//
// Starts the Aniko server (bound to 127.0.0.1) or attaches to one that is
// already running, then shows the UI in a native window. Every request the
// window makes carries the per-run shell token, which is how the server
// recognises its own desktop window when the browser Web UI is turned off.

const { app, BrowserWindow, ipcMain, shell, session, Menu, dialog, nativeImage, nativeTheme, Tray, Notification, powerMonitor, screen, clipboard } = require("electron")
const { spawn, execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const http = require("node:http")

const isWindows = process.platform === "win32"
const isMac = process.platform === "darwin"

// Exit codes of the server (server/internal/lifecycle): restart the app into
// a new version, or quit for the installer that updates it.
const EXIT_RESTART = 75
const EXIT_INSTALLING = 76

// macOS: Kumo's updater (Aniko's name before 2.0.37) put this version in
// the app it had, Kumo.app, which the Finder and Launchpad show as "Kumo".
// The app takes Aniko's name, then opens again from there, before anything
// else starts from the old path (helpers, the server). Aniko's own updates
// install as Aniko.app (server/internal/update/apply_mac.go).
function renameKumoApp() {
    if (!isMac || !app.isPackaged) return false
    const bundle = path.resolve(process.execPath, "..", "..", "..")
    const renamed = path.join(path.dirname(bundle), "Aniko.app")
    if (path.basename(bundle) !== "Kumo.app" || fs.existsSync(renamed)) return false
    try {
        fs.renameSync(bundle, renamed)
    } catch (err) {
        console.error("couldn't rename Kumo.app to Aniko.app:", err)
        return false
    }
    app.relaunch({ execPath: path.join(renamed, "Contents", "MacOS", path.basename(process.execPath)), args: process.argv.slice(1) })
    app.exit(0)
    return true
}
if (renameKumoApp()) return

// On Windows this is the AppUserModelID, which must match "appId" in
// electron-builder.yml: the installer's shortcuts carry it, and the taskbar
// groups the window with them.
const APP_ID = isWindows ? "app.kumo.desktop" : "aniko"
app.setName("Aniko")
app.setAppUserModelId?.(APP_ID)
// The window only talks to Aniko's own server (and AniList's login page): run
// Chromium's network service inside the app instead of a process of its
// own, which saves about 80 MB.
const features = ["NetworkServiceInProcess2"]
if (process.platform === "linux") {
    // Smooth video and scrolling on Linux.
    features.push("VaapiVideoDecodeLinuxGL", "VaapiVideoDecoder")
    app.commandLine.appendSwitch("ignore-gpu-blocklist")
}
app.commandLine.appendSwitch("enable-features", features.join(","))
// Aniko was called Kumo before 2.0.37: the folder Kumo kept its window's data
// in (the pages' settings, logins) becomes Aniko's the first time. It
// returns the folder to use: the old one while it can't be moved (Windows,
// when a file in it is still open), tried again on the next start.
function movedFrom(oldDir, dir) {
    try {
        if (!fs.existsSync(dir) && fs.existsSync(oldDir)) fs.renameSync(oldDir, dir)
    } catch (err) {
        console.error(`couldn't move ${oldDir} to ${dir}:`, err)
        return oldDir
    }
    return dir
}
if (isWindows && process.env.LOCALAPPDATA) {
    // Electron would keep the window's browser data (caches, the AniList
    // login window's cookies) in %APPDATA%\Aniko, which is the server's data
    // folder on Windows: keep it apart, with Aniko's other local files.
    const local = movedFrom(path.join(process.env.LOCALAPPDATA, "Kumo"), path.join(process.env.LOCALAPPDATA, "Aniko"))
    app.setPath("userData", path.join(local, "electron"))
} else if (isMac) {
    // Electron would keep them in ~/Library/Application Support/Aniko, which
    // is the server's data folder on macOS: keep them in a folder of their
    // own in it (Kumo's moves with the server's data).
    const support = movedFrom(path.join(app.getPath("appData"), "Kumo"), path.join(app.getPath("appData"), "Aniko"))
    app.setPath("userData", path.join(support, "electron"))
} else {
    // ~/.config/Aniko, after the app's name.
    app.setPath("userData", movedFrom(path.join(app.getPath("appData"), "Kumo"), app.getPath("userData")))
}

const runtimeDir = serverRuntimeDir()
let serverProc = null
let mainWindow = null
let baseUrl = null
let tray = null

// The desktop app's own preferences (Settings › Desktop app & programs),
// kept next to its browser data.
//   keepRunning     closing the window leaves Aniko running (tray icon, or the
//                   Dock on a Mac): streaming to other devices, downloads and
//                   the auto downloader keep going without the window's
//                   memory. Off unless turned on (keepRunningChosen: it was
//                   on by default for a while, and that doesn't count).
//   freeWhenLocked  a few minutes after the computer is locked, the window
//                   lets go of its page, and loads it again on unlocking.
//   toldKeepRunning the notice about it was shown (the first time).
//   window, mini    where Aniko's window and the small player were, and how
//                   big (the window: whether maximized): they open there.
//   zoom            the pages' zoom (Ctrl + and -), kept between runs.
const prefs = { keepRunning: false, keepRunningChosen: false, freeWhenLocked: true, toldKeepRunning: false, window: null, mini: null, zoom: 1 }
const prefsFile = () => path.join(app.getPath("userData"), "desktop.json")

function loadPrefs() {
    const saved = readJSON(prefsFile()) || {}
    for (const k of Object.keys(prefs)) if (typeof saved[k] === typeof prefs[k]) prefs[k] = saved[k]
    if (!prefs.keepRunningChosen) prefs.keepRunning = false
    if (!(prefs.zoom >= 0.5 && prefs.zoom <= 2)) prefs.zoom = 1
}

function savePrefs() {
    try {
        fs.mkdirSync(path.dirname(prefsFile()), { recursive: true })
        fs.writeFileSync(prefsFile(), JSON.stringify(prefs, null, 2))
    } catch (err) {
        console.error("desktop preferences:", err)
    }
}

// Starting with the computer (Settings › Desktop app & programs), off unless
// turned on: the system's own login items on Windows and macOS, an autostart
// entry on Linux. Started that way, Aniko opens in the background (tray, or
// the Dock on a Mac) when it keeps running without its window; otherwise
// with its window, so it's never running unseen.
const BACKGROUND = "--background"
const autostartFile = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "autostart", "aniko.desktop")

function startsAtLogin() {
    if (process.platform === "linux") return fs.existsSync(autostartFile())
    return app.getLoginItemSettings(isWindows ? { args: [BACKGROUND] } : undefined).openAtLogin
}

// setStartAtLogin turns starting with the computer on or off; it returns
// what went wrong, if anything.
function setStartAtLogin(on) {
    if (process.platform === "linux") {
        const file = autostartFile()
        try {
            if (!on) {
                fs.rmSync(file, { force: true })
                return null
            }
            // The package's launcher, else this Electron with this app.
            const exec = fs.existsSync("/usr/bin/aniko") ? "/usr/bin/aniko" : `"${process.execPath}" "${app.getAppPath()}"`
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, ["[Desktop Entry]", "Type=Application", "Name=Aniko", "Comment=Aniko in the background", `Exec=${exec} ${BACKGROUND}`, "Icon=aniko", "Terminal=false", "X-GNOME-Autostart-enabled=true", ""].join("\n"))
            return null
        } catch (err) {
            return String(err?.message || err)
        }
    }
    app.setLoginItemSettings(isWindows ? { openAtLogin: on, args: [BACKGROUND] } : { openAtLogin: on })
    if (isMac && on && app.getLoginItemSettings().status === "requires-approval") {
        return "macOS asks you to allow it: in System Settings › General › Login Items (Login Items & Extensions), turn on Aniko."
    }
    return startsAtLogin() === on ? null : "The system didn't take the change."
}

// startedAtLogin reports a launch by the system at login.
function startedAtLogin() {
    if (process.argv.includes(BACKGROUND)) return true
    return isMac && app.getLoginItemSettings().wasOpenedAtLogin
}

// Where the server writes server.json and the shell token: the same folder
// as its config.RuntimeDir().
function serverRuntimeDir() {
    if (isWindows) {
        const local = process.env.LOCALAPPDATA
        return local ? path.join(local, "Aniko", "run") : path.join(os.tmpdir(), "aniko")
    }
    // macOS: $TMPDIR, the user's own temporary folder.
    if (isMac) return path.join(os.tmpdir(), "aniko")
    return path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), "aniko")
}

function serverCandidates() {
    if (isWindows) {
        return [
            process.env.ANIKO_SERVER,
            path.join(process.resourcesPath, "aniko.exe"), // installed or portable app: resources\aniko.exe
            path.join(__dirname, "..", "dist", "windows", "aniko.exe"), // development checkout
        ]
    }
    if (isMac) {
        return [
            process.env.ANIKO_SERVER,
            path.join(process.resourcesPath, "aniko"), // Aniko.app/Contents/Resources/aniko
            path.join(__dirname, "..", "dist", "aniko"), // development checkout
        ]
    }
    return [
        process.env.ANIKO_SERVER,
        path.join(__dirname, "..", "aniko"), // /usr/lib/aniko/app -> /usr/lib/aniko/aniko
        path.join(__dirname, "..", "dist", "aniko"), // development checkout
        "/usr/lib/aniko/aniko",
    ]
}

function findServerBinary() {
    const candidates = serverCandidates().filter(Boolean)
    // X_OK is only an existence check on Windows.
    return candidates.find(p => {
        try {
            fs.accessSync(p, fs.constants.X_OK)
            return true
        } catch {
            return false
        }
    })
}

function readJSON(p) {
    try {
        return JSON.parse(fs.readFileSync(p, "utf8"))
    } catch {
        return null
    }
}

function ping(url) {
    return new Promise(resolve => {
        const req = http.get(url + "/api/status", { timeout: 1500, headers: { "X-Kumo-Shell": readToken() || "" } }, res => {
            res.resume()
            resolve(res.statusCode < 500)
        })
        req.on("error", () => resolve(false))
        req.on("timeout", () => {
            req.destroy()
            resolve(false)
        })
    })
}

function readToken() {
    try {
        return fs.readFileSync(path.join(runtimeDir, "shell-token"), "utf8").trim()
    } catch {
        return ""
    }
}

async function existingServer() {
    const info = readJSON(path.join(runtimeDir, "server.json"))
    if (!info?.port) return null
    try {
        process.kill(info.pid, 0)
    } catch {
        return null
    }
    const url = `http://127.0.0.1:${info.port}`
    return (await ping(url)) ? url : null
}

// The server's last lines (without their timestamps): what went wrong, for
// the box that says Aniko couldn't start.
const serverLines = []
function noteServerOutput(text) {
    for (const line of text.split(/\r?\n/)) {
        const l = line.replace(/^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d(\.\d+)? /, "").trim()
        if (l) serverLines.push(l)
    }
    serverLines.splice(0, Math.max(0, serverLines.length - 30))
}

function startServer() {
    return new Promise((resolve, reject) => {
        const bin = findServerBinary()
        if (!bin) {
            const msg = isWindows
                ? "Aniko's server (aniko.exe) is missing from its folder. Install Aniko again."
                : isMac
                  ? "Aniko's server is missing from the app. Download Aniko again."
                  : "Aniko's server (aniko) is missing. Install the package again."
            return reject(new Error(msg))
        }
        // windowsHide: on Windows the server, and the ffmpeg, ffprobe and bash
        // processes it starts (they share its console), never pop up a console
        // window. Elsewhere it does nothing. Windows has no signals to ask the
        // server to stop: there it stops when its input closes (see
        // before-quit).
        const args = isWindows ? ["--desktop", "--exit-with-stdin"] : ["--desktop"]
        serverProc = spawn(bin, args, { stdio: [isWindows ? "pipe" : "ignore", "pipe", "pipe"], env: process.env, windowsHide: true })
        let resolved = false
        const onData = buf => {
            const text = buf.toString()
            process.stdout.write(text)
            noteServerOutput(text)
            const m = /listening on http:\/\/([\d.]+):(\d+)/.exec(text)
            if (m && !resolved) {
                resolved = true
                resolve(`http://127.0.0.1:${m[2]}`)
            }
            if (/could not start the server/.test(text) && !resolved) {
                resolved = true
                // Its port taken: by another program (Aniko itself would have
                // been found running).
                const port = /:(\d+): bind/.exec(text)?.[1]
                reject(
                    new Error(
                        /address already in use|only one usage of each socket address/i.test(text)
                            ? `Another program is using Aniko's port${port ? ` (${port})` : ""}. Close it, then try again.`
                            : "Aniko's server couldn't start.",
                    ),
                )
            }
        }
        serverProc.stdout.on("data", onData)
        serverProc.stderr.on("data", onData)
        serverProc.on("exit", (code, signal) => {
            // The server stopped for an update: no error box. After an
            // update was installed, the whole app starts again, so that its
            // window loads the new main.js too. On Windows an installer is
            // replacing Aniko, and starts it when it's done; on macOS the
            // server has put the new app in place, and a helper opens it once
            // this one has quit.
            if (code === EXIT_RESTART || code === EXIT_INSTALLING) {
                serverProc = null
                app.isQuitting = true
                // Windows: the installer works unseen for a moment; said, so
                // Aniko doesn't just vanish.
                if (code === EXIT_INSTALLING && Notification.isSupported()) new Notification({ title: "Updating Aniko", body: "Aniko opens again in a moment." }).show()
                // With its window: not as started with the computer.
                if (code === EXIT_RESTART) app.relaunch({ args: process.argv.slice(1).filter(a => a !== BACKGROUND) })
                app.exit(0)
                return
            }
            if (!resolved) reject(new Error("Aniko's server stopped while starting."))
            serverProc = null
            if (resolved && !app.isQuitting) {
                // Stopped, not crashed (the computer shutting down or signing
                // out stops it first): Aniko quits with it, quietly.
                if (code === 0 || ["SIGTERM", "SIGINT", "SIGHUP"].includes(signal)) {
                    app.isQuitting = true
                    app.quit()
                    return
                }
                const msg = "Aniko's server stopped unexpectedly."
                if (mainWindow) {
                    const answer = dialog.showMessageBoxSync(mainWindow, {
                        type: "error",
                        title: "Aniko",
                        message: msg,
                        detail: serverLines.slice(-6).join("\n"),
                        buttons: ["Restart Aniko", "Quit"],
                        defaultId: 0,
                        cancelId: 1,
                    })
                    app.isQuitting = true
                    if (answer === 0) app.relaunch()
                    app.exit(0)
                    return
                }
                // Running without a window: no box that would hold up
                // anything, just a notice.
                if (Notification.isSupported()) new Notification({ title: "Aniko stopped", body: msg + " Open it again to restart it." }).show()
                app.isQuitting = true
                app.quit()
            }
        })
        setTimeout(() => {
            if (!resolved) {
                resolved = true
                reject(new Error("Aniko's server took too long to start."))
            }
        }, 30000)
    })
}

// Aniko's address now: its port can be changed in Settings, the server moves
// to it at once and writes it in server.json.
let serverRead = 0
function serverUrl() {
    // At most once a second (it's asked about each request).
    if (Date.now() - serverRead < 1000) return baseUrl
    serverRead = Date.now()
    const info = readJSON(path.join(runtimeDir, "server.json"))
    if (info?.port) baseUrl = `http://127.0.0.1:${info.port}`
    return baseUrl
}

function installShellHeader() {
    const filter = { urls: ["http://127.0.0.1/*", "http://127.0.0.1:*/*"] }
    session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, cb) => {
        // Only to Aniko: not to another program listening on this computer.
        const token = isInternal(details.url) ? readToken() : ""
        if (token) details.requestHeaders["X-Kumo-Shell"] = token
        cb({ requestHeaders: details.requestHeaders })
    })
}

// A page of Aniko's: at its address (the one it had when it started, or the
// one it moved to).
function isInternal(url) {
    try {
        const u = new URL(url)
        if (u.protocol !== "http:" || u.hostname !== "127.0.0.1") return false
        const at = b => !!b && new URL(b).port === u.port
        return at(baseUrl) || at(serverUrl())
    } catch {
        return false
    }
}

// macOS keeps the app's menu in the menu bar, and the standard shortcuts
// (copy and paste, Cmd+Q, Cmd+W, full screen…) only work through its items.
// Linux and Windows show no menu. Set once, at the start.
function appMenu() {
    if (!isMac) return null
    const open = page => () => showWindowAt(page).catch(() => {})
    return Menu.buildFromTemplate([
        {
            label: "Aniko",
            submenu: [
                { role: "about" },
                { type: "separator" },
                { label: "Settings…", accelerator: "Cmd+,", click: open("/settings") },
                { type: "separator" },
                { role: "services" },
                { type: "separator" },
                { role: "hide" },
                { role: "hideOthers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit" },
            ],
        },
        { role: "fileMenu" },
        { role: "editMenu" },
        {
            label: "View",
            submenu: [
                // Kept between runs (zoomBy), unlike the menu's own zoom.
                { label: "Actual Size", accelerator: "Cmd+0", click: () => zoomTo(1) },
                { label: "Zoom In", accelerator: "Cmd+Plus", click: () => zoomBy(0.1) },
                { label: "Zoom In", accelerator: "Cmd+=", click: () => zoomBy(0.1), visible: false, acceleratorWorksWhenHidden: true },
                { label: "Zoom Out", accelerator: "Cmd+-", click: () => zoomBy(-0.1) },
                { type: "separator" },
                { role: "togglefullscreen" },
            ],
        },
        { role: "windowMenu" },
    ])
}

// The pages' zoom: Ctrl (Cmd) with + and - or the mouse wheel, 0 back to
// normal; kept between runs, and the same in each page of Aniko's.
function zoomTo(f) {
    prefs.zoom = Math.round(Math.min(2, Math.max(0.5, f)) * 100) / 100
    savePrefs()
    mainWindow?.webContents.setZoomFactor(prefs.zoom)
}
function zoomBy(d) {
    zoomTo(prefs.zoom + d)
}

// Where Aniko's window opens: where it was, if that's still on a screen;
// else in the middle of the main one, as big as fits (up to 1600×1000).
function windowBounds() {
    const w = prefs.window
    if (w && [w.x, w.y, w.width, w.height].every(Number.isFinite)) {
        const area = screen.getDisplayMatching(w).workArea
        const visible = w.x < area.x + area.width - 80 && w.x + w.width > area.x + 80 && w.y < area.y + area.height - 80 && w.y + w.height > area.y
        if (visible) return { x: w.x, y: w.y, width: Math.min(w.width, area.width), height: Math.min(w.height, area.height) }
    }
    const area = screen.getPrimaryDisplay().workArea
    const width = Math.min(1600, Math.round(area.width * 0.9))
    const height = Math.min(1000, Math.round(area.height * 0.9))
    return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height }
}

// What the window shows while Aniko's server starts (a first start can take
// a few seconds), and if its page didn't load: in the app's colors.
function waitingPage(text) {
    const logo =
        '<svg viewBox="0 0 64 64" width="56" height="56"><rect width="64" height="64" rx="15" fill="#e2e2e6"/><path d="M24.5 15.5V48.5M41 28 24.5 42M31.5 36.2 41.5 48.5" fill="none" stroke="#141416" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    const html = `<!doctype html><meta charset="utf-8"><title>Aniko</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#a1a1a8;font:14px system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-user-select:none;user-select:none"><div style="display:grid;justify-items:center;gap:18px">${logo}<div>${text}</div></div></body>`
    return "data:text/html;charset=utf-8," + encodeURIComponent(html)
}

// The window's own icon. On Linux it's invisible: KDE and other desktops draw
// it in the window's title bar, where Aniko shows none, while the taskbar and
// the app menu take Aniko's icon from its desktop entry. On Windows the
// window's icon is also the taskbar's.
function windowIcon() {
    if (process.platform === "linux") return nativeImage.createFromBitmap(Buffer.alloc(32 * 32 * 4), { width: 32, height: 32 })
    const iconPath = [path.join(__dirname, "icon.png")].find(p => fs.existsSync(p))
    return iconPath ? nativeImage.createFromPath(iconPath) : undefined
}

// createWindow opens Aniko's window, at a page of it (page, "" for Home);
// waiting: while the server starts, which shows it when it's ready (load).
// (Not named path: that's the path module, used here.)
function createWindow(page = "", waiting = false) {
    if (mainWindow) return
    mainWindow = new BrowserWindow({
        ...windowBounds(),
        minWidth: 960,
        minHeight: 620,
        title: "Aniko",
        backgroundColor: "#0a0a0b",
        autoHideMenuBar: true,
        show: false,
        icon: windowIcon(),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            spellcheck: false,
        },
    })
    if (prefs.window?.maximized) mainWindow.maximize()
    mainWindow.once("ready-to-show", () => mainWindow?.show())

    const wc = mainWindow.webContents
    keepInside(wc)
    wc.on("before-input-event", (e, input) => {
        if (input.type !== "keyDown") return
        const key = input.key.toLowerCase()
        if (key === "f11") mainWindow.setFullScreen(!mainWindow.isFullScreen())
        if (input.control && input.shift && key === "i") wc.toggleDevTools()
        if (input.control && key === "r") wc.reload()
        // Zoom (on a Mac, its View menu's).
        if (!isMac && input.control && !input.alt) {
            const by = key === "=" || key === "+" ? 0.1 : key === "-" ? -0.1 : 0
            if (by) zoomBy(by)
            if (key === "0") zoomTo(1)
            if (by || key === "0") e.preventDefault()
        }
        // Back and forward through the pages: Alt+Left and Right (Cmd+[ and ] on a Mac).
        const back = isMac ? input.meta && key === "[" : input.alt && key === "arrowleft"
        const forward = isMac ? input.meta && key === "]" : input.alt && key === "arrowright"
        if (back || forward) {
            go(wc, back ? -1 : 1)
            e.preventDefault()
        }
    })
    // Ctrl and the mouse wheel.
    wc.on("zoom-changed", (_e, dir) => zoomBy(dir === "in" ? 0.1 : -0.1))
    wc.on("did-finish-load", () => wc.setZoomFactor(prefs.zoom))
    // The mouse's back and forward buttons (Windows and Linux).
    mainWindow.on("app-command", (_e, cmd) => {
        if (cmd === "browser-backward") go(wc, -1)
        if (cmd === "browser-forward") go(wc, 1)
    })
    // Aniko's page didn't load (the server busy, restarting): said, and
    // tried again in a moment, instead of a blank window.
    wc.on("did-fail-load", (_e, code, _desc, url, mainFrame) => {
        if (!mainFrame || code === -3 || !isInternal(url)) return
        wc.loadURL(waitingPage("Aniko isn't answering yet: trying again…")).catch(() => {})
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed() && !parkedUrl) mainWindow.loadURL(url).catch(() => {})
        }, 2000)
    })
    // The page's process ended (a crash, the system short of memory): it's
    // opened again.
    wc.on("render-process-gone", (_e, details) => {
        if (details.reason === "clean-exit") return
        console.error("Aniko's page stopped:", details.reason)
        setTimeout(() => mainWindow?.webContents.reload(), 500)
    })
    // Where it is and how big, for the next time it opens.
    const remember = () => {
        if (!mainWindow || mainWindow.isMinimized() || mainWindow.isFullScreen()) return
        prefs.window = { ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() }
    }
    mainWindow.on("resize", remember)
    mainWindow.on("move", remember)
    mainWindow.on("close", () => {
        remember()
        savePrefs()
    })
    mainWindow.on("closed", () => {
        mainWindow = null
        parkedUrl = null
        // Aniko quits with its window (not kept running): the small player
        // too, or nothing would be left to close it with.
        if (!prefs.keepRunning && !app.isQuitting) miniWindow?.close()
    })
    // Windows is shutting down or signing out, which stops the server too:
    // that isn't worth an error box (the event only exists on Windows).
    mainWindow.on("query-session-end", () => (app.isQuitting = true))
    mainWindow.loadURL(waiting ? waitingPage("Starting Aniko…") : serverUrl() + page).catch(() => {})
}

// go moves through the window's pages (-1 back, 1 forward), where there's one.
function go(wc, step) {
    const h = wc.navigationHistory
    if (step < 0 ? h.canGoBack() : h.canGoForward()) step < 0 ? h.goBack() : h.goForward()
}

// External links open in the system browser; Aniko's windows never navigate
// away from Aniko.
function keepInside(contents) {
    // Right-click: cut, copy and paste in text fields, copy what's selected,
    // and a link's own items. Aniko's own menus (a card's) come first: the
    // page handles those clicks itself.
    contents.on("context-menu", (_e, p) => {
        const items = []
        if (p.isEditable) {
            items.push(
                { role: "cut", enabled: p.editFlags.canCut },
                { role: "copy", enabled: p.editFlags.canCopy },
                { role: "paste", enabled: p.editFlags.canPaste },
                { type: "separator" },
                { role: "selectAll" },
            )
        } else if (p.selectionText.trim()) items.push({ role: "copy" })
        if (/^https?:\/\//.test(p.linkURL) && !isInternal(p.linkURL)) {
            if (items.length) items.push({ type: "separator" })
            items.push({ label: "Open link in browser", click: () => shell.openExternal(p.linkURL) }, { label: "Copy link", click: () => clipboard.writeText(p.linkURL) })
        }
        if (items.length) Menu.buildFromTemplate(items).popup()
    })
    contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url) && !isInternal(url)) shell.openExternal(url)
        return { action: "deny" }
    })
    contents.on("will-navigate", (e, url) => {
        if (!isInternal(url)) {
            e.preventDefault()
            if (/^https?:\/\//.test(url)) shell.openExternal(url)
        }
    })
}

// Picture in picture: Aniko's player in a small window on top of the others
// (its /mini page, the episode in its address), at the bottom right of the
// screen Aniko's window is on, or where the last one was. Its button to go back hands the episode, where
// it's at, to Aniko's window (pendingPlay until that window asks for it).
let miniWindow = null
let pendingPlay = null

ipcMain.handle("aniko:mini-open", (_e, page) => {
    const base = serverUrl()
    if (!base || typeof page !== "string" || !/^\/mini#/.test(page)) return false
    // One open already: a new one where it was (only its address's end would
    // change, which doesn't load the page again).
    let bounds = null
    if (miniWindow) {
        bounds = miniWindow.getBounds()
        const old = miniWindow
        miniWindow = null
        old.destroy()
    }
    // Else where the last one was (still on a screen), else in the corner.
    if (!bounds && prefs.mini && [prefs.mini.x, prefs.mini.y, prefs.mini.width, prefs.mini.height].every(Number.isFinite)) {
        const a = screen.getDisplayMatching(prefs.mini).workArea
        if (prefs.mini.x >= a.x - 40 && prefs.mini.y >= a.y - 40 && prefs.mini.x + prefs.mini.width <= a.x + a.width + 40 && prefs.mini.y + prefs.mini.height <= a.y + a.height + 40) bounds = prefs.mini
    }
    const area = screen.getDisplayMatching(mainWindow?.getBounds() ?? screen.getPrimaryDisplay().bounds).workArea
    const width = bounds?.width ?? 480
    const height = bounds?.height ?? 270
    const win = new BrowserWindow({
        width,
        height,
        x: bounds?.x ?? area.x + area.width - width - 24,
        y: bounds?.y ?? area.y + area.height - height - 24,
        minWidth: 320,
        minHeight: 180,
        title: "Aniko",
        frame: false,
        alwaysOnTop: true,
        fullscreenable: false,
        backgroundColor: "#000000",
        icon: windowIcon(),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            spellcheck: false,
        },
    })
    // Above other apps' windows too (on a Mac, also over full-screen ones).
    win.setAlwaysOnTop(true, "floating")
    if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setAspectRatio(16 / 9)
    keepInside(win.webContents)
    win.on("close", () => {
        prefs.mini = win.getBounds()
        savePrefs()
    })
    win.on("closed", () => {
        if (miniWindow === win) miniWindow = null
    })
    miniWindow = win
    win.loadURL(base + page).catch(() => {})
    return true
})
ipcMain.on("aniko:mini-close", () => miniWindow?.close())
ipcMain.on("aniko:mini-expand", (_e, req) => {
    // An episode (see web/src/lib/pip.ts asRequest), small.
    if (!req || typeof req !== "object" || JSON.stringify(req).length > 4096) return
    miniWindow?.close()
    if (mainWindow && !mainWindow.webContents.isLoading()) {
        mainWindow.webContents.send("aniko:play", req)
        showWindow()
    } else {
        // Opened (or loading): it asks when it's ready.
        pendingPlay = req
        showWindow()
    }
})
ipcMain.handle("aniko:take-play", () => {
    const req = pendingPlay
    pendingPlay = null
    return req
})

// AniList login: open the authorize page in a separate window and capture
// the access token from the redirect (#access_token=…) or the PIN page.
ipcMain.handle("aniko:anilist-login", async (_e, url) => {
    if (typeof url !== "string" || !url.startsWith("https://anilist.co/")) return null
    return new Promise(resolve => {
        const win = new BrowserWindow({
            width: 520,
            height: 760,
            parent: mainWindow ?? undefined,
            modal: false,
            title: "Log in with AniList",
            backgroundColor: "#0b1622",
            autoHideMenuBar: true,
            webPreferences: { partition: "persist:anilist", contextIsolation: true, sandbox: true },
        })
        let done = false
        const finish = token => {
            if (done) return
            done = true
            resolve(token)
            if (!win.isDestroyed()) win.close()
        }
        const check = u => {
            const m = /access_token=([^&#\s]+)/.exec(u || "")
            if (m) finish(decodeURIComponent(m[1]))
        }
        win.webContents.on("will-redirect", (_ev, u) => check(u))
        win.webContents.on("did-navigate", (_ev, u) => check(u))
        win.webContents.on("did-navigate-in-page", (_ev, u) => check(u))
        win.webContents.on("did-finish-load", async () => {
            check(win.webContents.getURL())
            // The PIN page shows the token in a text box.
            try {
                const t = await win.webContents.executeJavaScript(
                    "(document.querySelector('textarea')?.value || document.querySelector('.token, input[readonly]')?.value || '').trim()",
                )
                if (t && t.length > 100) finish(t)
            } catch {
                /* ignore */
            }
        })
        win.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
        win.on("closed", () => finish(null))
        win.loadURL(url)
    })
})

ipcMain.on("aniko:open-external", (_e, url) => {
    if (typeof url === "string" && /^https?:\/\//.test(url)) shell.openExternal(url)
})

ipcMain.handle("aniko:get-prefs", () => ({ keepRunning: prefs.keepRunning, freeWhenLocked: prefs.freeWhenLocked, startAtLogin: startsAtLogin() }))
// set-pref returns true, or { error } when it couldn't be done.
ipcMain.handle("aniko:set-pref", (_e, name, value) => {
    if (typeof value !== "boolean") return { error: "not a setting" }
    if (name === "startAtLogin") {
        const error = setStartAtLogin(value)
        return error ? { error } : true
    }
    if (!["keepRunning", "freeWhenLocked"].includes(name)) return { error: "not a setting" }
    prefs[name] = value
    if (name === "keepRunning") prefs.keepRunningChosen = true
    savePrefs()
    updateTray()
    return true
})

ipcMain.on("aniko:quit", () => app.quit())

// ---------------------------------------------------------------------------
// Updated while running: a package update (makepkg) replaces Aniko's files
// but not the Aniko running in the background. Opened again, it restarts into
// the version installed: the server stops asking to be started again
// (exit code 75), and the app does, with its new files.

// installedVersion is the version of the server program on disk ("1.0.94"),
// or "" when it can't be told.
function installedVersion() {
    const bin = findServerBinary()
    if (!bin) return ""
    try {
        const out = execFileSync(bin, ["--version"], { timeout: 5000, windowsHide: true }).toString()
        return (/(\d+\.\d+\.\d+)/.exec(out) || [])[1] || ""
    } catch {
        return ""
    }
}

// serverCall makes a request to a running Aniko server as its desktop window.
function serverCall(url, method, p) {
    return new Promise(resolve => {
        const req = http.request(url + p, { method, timeout: 3000, headers: { "X-Kumo-Shell": readToken() || "", "Content-Type": "application/json" } }, res => {
            let body = ""
            res.setEncoding("utf8")
            res.on("data", c => (body += c))
            res.on("end", () => {
                try {
                    resolve(res.statusCode < 300 ? JSON.parse(body || "null") ?? true : null)
                } catch {
                    resolve(null)
                }
            })
        })
        req.on("error", () => resolve(null))
        req.on("timeout", () => {
            req.destroy()
            resolve(null)
        })
        req.end(method === "POST" ? "{}" : undefined)
    })
}

// restartIfOutdated restarts the Aniko running at url when it's another
// version than the one installed, and reports whether it did.
async function restartIfOutdated(url) {
    // Only a package (Arch) is updated under a running Aniko: Windows and
    // macOS updates restart it themselves. Not asked there, then (it runs
    // the server program, a moment on each click of the tray or the Dock).
    if (!url || process.platform !== "linux") return false
    const installed = installedVersion()
    const running = (await serverCall(url, "GET", "/api/status"))?.version
    // 1.0.0: built by hand, its version unknown.
    if (!installed || !running || running === "1.0.0" || !olderVersion(running, installed)) return false
    console.log(`Aniko ${running} is running, ${installed} is installed: restarting into it`)
    return !!(await serverCall(url, "POST", "/api/update/restart"))
}

// olderVersion: a before b ("1.0.139" before "2.0.0").
function olderVersion(a, b) {
    const pa = a.split(".").map(Number)
    const pb = b.split(".").map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0
        const y = pb[i] || 0
        if (x !== y) return x < y
    }
    return false
}

let restarting = false

// showWindow brings Aniko's window back, or opens a new one after it was
// closed while Aniko kept running (the tray's and the Dock's handlers: what
// they pass isn't a page).
function showWindow() {
    return showWindowAt("").catch(err => console.error("couldn't show Aniko's window:", err))
}

// showWindowAt does, at a page of it when one is given ("/entry?id=1").
async function showWindowAt(page) {
    const base = serverUrl()
    // Still starting: its window (saying so) comes to the front.
    if (!base && mainWindow) {
        mainWindow.show()
        mainWindow.focus()
        return
    }
    if (!base || restarting) return
    // Updated since it started: the new version opens instead (this app
    // starts again with its own server; one it found running restarts by
    // itself, and is back in a moment).
    if (await restartIfOutdated(base)) {
        if (serverProc) {
            restarting = true
            return
        }
        for (let i = 0; i < 40 && !(await ping(base)); i++) await new Promise(r => setTimeout(r, 250))
    }
    if (!mainWindow) return createWindow(page)
    if (page) {
        parkedUrl = null
        mainWindow.loadURL(base + page).catch(() => {})
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
}

// Alerts from the server (an episode of an anime being watched aired, one
// is ready in the library) while the window is closed, or its page let go
// (the computer locked): the page shows them itself otherwise.
let alertsListening = false
function listenForAlerts() {
    if (alertsListening || !baseUrl) return
    alertsListening = true
    let done = false
    const again = () => {
        if (done) return
        done = true
        alertsListening = false
        if (!app.isQuitting) setTimeout(listenForAlerts, 5000)
    }
    const req = http.get(serverUrl() + "/api/events", { headers: { "X-Kumo-Shell": readToken() || "", Accept: "text/event-stream" } }, res => {
        if (res.statusCode !== 200) {
            res.resume()
            return again()
        }
        res.setEncoding("utf8")
        let buf = ""
        res.on("data", chunk => {
            buf += chunk
            for (let i = buf.indexOf("\n\n"); i >= 0; i = buf.indexOf("\n\n")) {
                const data = buf
                    .slice(0, i)
                    .split("\n")
                    .filter(l => l.startsWith("data:"))
                    .map(l => l.slice(5).trimStart())
                    .join("\n")
                buf = buf.slice(i + 2)
                try {
                    const ev = JSON.parse(data)
                    if (ev?.type === "notify") backgroundAlert(ev.payload)
                } catch {
                    // a keep-alive, or not an event
                }
            }
        })
        res.on("end", again)
        res.on("error", again)
    })
    req.on("error", again)
}

function backgroundAlert(a) {
    if ((mainWindow && !parkedUrl) || !Notification.isSupported() || typeof a?.title !== "string") return
    const n = new Notification({ title: a.title, body: String(a.body || "") })
    const id = Number(a.mediaId)
    n.on("click", () => showWindowAt(id > 0 ? `/entry?id=${id}` : "/local").catch(() => {}))
    n.show()
}

// The tray icon, while Aniko keeps running with its window closed (Windows
// and Linux: on a Mac the Dock icon does it). Without a tray on the
// desktop (GNOME without an extension), opening Aniko again shows its window.
function updateTray() {
    if (isMac) return
    if (prefs.keepRunning && !tray) {
        const icon = nativeImage.createFromPath(path.join(__dirname, "icon.png"))
        tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 32, height: 32, quality: "best" }))
        tray.setToolTip("Aniko")
        tray.setContextMenu(
            Menu.buildFromTemplate([
                { label: "Open Aniko", click: showWindow },
                { type: "separator" },
                { label: "Quit Aniko", click: () => app.quit() },
            ]),
        )
        tray.on("click", showWindow)
    } else if (!prefs.keepRunning && tray) {
        tray.destroy()
        tray = null
    }
}

// The window was closed and Aniko keeps running: said once, in a box (a
// notification may be turned off, or missed), with where to find it.
function wentToBackground() {
    if (prefs.toldKeepRunning) return
    prefs.toldKeepRunning = true
    savePrefs()
    const where = isMac
        ? "Click Aniko in the Dock to open it again, or quit it with Cmd+Q."
        : isWindows
          ? "Open or quit it from its icon at the right of the taskbar (under ^ when it's hidden there). Opening Aniko again also brings its window back."
          : "Open or quit it from its tray icon (on GNOME, the AppIndicator extension shows it). Opening Aniko again also brings its window back."
    const answer = dialog.showMessageBoxSync({
        type: "info",
        title: "Aniko",
        message: "Aniko keeps running",
        detail: `Streaming to your other devices, downloads and the auto downloader keep going while its window is closed. ${where}\n\nYou can change this in Settings › Desktop app & programs.`,
        buttons: ["OK", "Quit Aniko"],
        defaultId: 0,
        cancelId: 0,
    })
    if (answer === 1) app.quit()
}

// Locked computer: after a few minutes the window lets go of its page (the
// app's memory, cached images…) and loads it again when the computer is
// unlocked. Not while the player, the manga reader or Settings are open, so
// nothing is lost.
const PARK_AFTER = 5 * 60_000
const PARKED_PAGE = "data:text/html,<body style='background:%230a0a0b'></body>"
let lockTimer = null
let parkedUrl = null

async function parkPage() {
    if (!prefs.freeWhenLocked || !mainWindow || parkedUrl) return
    const wc = mainWindow.webContents
    let busy = true
    try {
        busy = await wc.executeJavaScript("!!document.querySelector('video') || /^\\/(manga\\/read|settings|webview)/.test(location.pathname)")
    } catch {
        /* keep it */
    }
    if (busy || !mainWindow || parkedUrl) return
    parkedUrl = wc.getURL()
    wc.loadURL(PARKED_PAGE).catch(() => {})
}

function unparkPage() {
    clearTimeout(lockTimer)
    if (!parkedUrl) return
    const url = parkedUrl
    parkedUrl = null
    if (mainWindow && isInternal(url)) mainWindow.loadURL(url).catch(() => {})
}

// Desktop shortcuts are copies of aniko.desktop: those made when Aniko was
// Kumo start /usr/bin/kumo, which is gone. Point them at Aniko (its
// program, name and icon), in place, so they keep their permissions and the
// desktop's trust. Starting with the computer moves to Aniko's entry too.
function updateDesktopShortcuts() {
    if (process.platform !== "linux") return
    const oldAutostart = path.join(path.dirname(autostartFile()), "kumo.desktop")
    if (fs.existsSync(oldAutostart) && !fs.existsSync(autostartFile()) && setStartAtLogin(true) === null) fs.rmSync(oldAutostart, { force: true })
    let dir, names
    try {
        dir = app.getPath("desktop")
        names = fs.readdirSync(dir)
    } catch {
        return
    }
    for (const name of names) {
        if (!name.endsWith(".desktop")) continue
        const file = path.join(dir, name)
        try {
            if (!fs.lstatSync(file).isFile()) continue // never through a link
            const text = fs.readFileSync(file, "utf8")
            if (!/^Exec=(\/usr\/bin\/)?kumo(\s|$)/m.test(text)) continue
            const next = text
                .replace(/^Exec=(\/usr\/bin\/)?kumo(?=\s|$)/gm, "Exec=$1aniko")
                .replace(/^Icon=kumo(-anime)?[ \t]*$/gm, "Icon=aniko")
                .replace(/^Name=Kumo[ \t]*$/gm, "Name=Aniko")
                .replace(/^StartupWMClass=Kumo[ \t]*$/gm, "StartupWMClass=Aniko")
            fs.writeFileSync(file, next)
        } catch {
            // someone else's file, or one we can't write: leave it
        }
    }
}

// Aniko couldn't start: why, the server's last lines, and Try again.
function startupFailed(err) {
    serverProc?.kill()
    serverProc = null
    const detail = [String(err?.message || err), serverLines.length ? "\n" + serverLines.slice(-8).join("\n") : ""].join("\n").trim()
    const answer = dialog.showMessageBoxSync({
        type: "error",
        title: "Aniko",
        message: "Aniko couldn't start",
        detail,
        buttons: ["Try again", "Copy details", "Quit"],
        defaultId: 0,
        cancelId: 2,
    })
    if (answer === 1) clipboard.writeText(detail)
    app.isQuitting = true
    if (answer === 0) app.relaunch()
    app.exit(1)
}

async function boot() {
    // Started with the computer: in the background, if Aniko runs without
    // its window (the tray icon or the Dock opens it). Otherwise the window
    // shows at once, saying Aniko is starting.
    const withWindow = !(startedAtLogin() && prefs.keepRunning)
    if (withWindow) createWindow("", true)
    try {
        baseUrl = (await existingServer()) || (await startServer())
    } catch (err) {
        startupFailed(err)
        return
    }
    // Wait until the token file exists (written right after startup).
    for (let i = 0; i < 50 && !readToken(); i++) await new Promise(r => setTimeout(r, 100))
    installShellHeader()
    // (Closed while it was starting: it stays closed.)
    if (mainWindow) mainWindow.loadURL(serverUrl()).catch(() => {})
    listenForAlerts()
    updateTray()
    updateDesktopShortcuts()
    powerMonitor.on("lock-screen", () => {
        clearTimeout(lockTimer)
        lockTimer = setTimeout(parkPage, PARK_AFTER)
    })
    powerMonitor.on("unlock-screen", unparkPage)
    // Brought back some other way (the screen was never locked by the
    // system's own lock, a missed event…).
    app.on("browser-window-focus", unparkPage)
}

if (!app.requestSingleInstanceLock()) {
    // Aniko is running already and shows its window. When it's an older
    // version (updated while it ran in the background), it's asked to
    // restart into this one: versions before this check only know that.
    existingServer()
        .then(restartIfOutdated)
        .catch(() => {})
        .finally(() => app.quit())
} else {
    // Opening Aniko again shows its window, also after it was closed while
    // Aniko kept running.
    app.on("second-instance", (_e, argv) => {
        // Started with the computer while already running: nothing to show.
        if (!argv.includes(BACKGROUND)) showWindow()
    })
    app.on("activate", showWindow) // the Dock icon (macOS)
    app.whenReady()
        .then(() => {
            loadPrefs()
            // The title bar and the system's menus in the app's dark colors,
            // whatever the system's own are.
            nativeTheme.themeSource = "dark"
            Menu.setApplicationMenu(appMenu())
            return boot()
        })
        .catch(startupFailed)
    app.on("window-all-closed", () => {
        if (!prefs.keepRunning || app.isQuitting) return app.quit()
        wentToBackground()
    })
    app.on("before-quit", event => {
        app.isQuitting = true
        if (!serverProc) return
        if (!isWindows) {
            serverProc.kill("SIGTERM")
            return
        }
        // Windows: closing its input lets the server stop what it started
        // (mpv, ffmpeg) and save; quit once it's gone, or after 5 seconds.
        // kill() would end it at once.
        event.preventDefault()
        const proc = serverProc
        const timer = setTimeout(() => proc.kill(), 5000)
        proc.once("exit", () => {
            clearTimeout(timer)
            serverProc = null
            app.quit()
        })
        proc.stdin?.end()
    })
}
