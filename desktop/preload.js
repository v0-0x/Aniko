// Exposes a tiny, safe bridge to the web UI.
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("kumoDesktop", {
    platform: process.platform,
    anilistLogin: url => ipcRenderer.invoke("kumo:anilist-login", url),
    openExternal: url => ipcRenderer.send("kumo:open-external", url),
    // The desktop app's own settings (Settings › Desktop app & programs).
    getPrefs: () => ipcRenderer.invoke("kumo:get-prefs"),
    setPref: (name, value) => ipcRenderer.invoke("kumo:set-pref", name, value),
    // Quits Kumo, server and all.
    quit: () => ipcRenderer.send("kumo:quit"),
    // Picture in picture: the small player window (web/src/lib/pip.ts).
    openMiniPlayer: page => ipcRenderer.invoke("kumo:mini-open", page),
    closeMiniPlayer: () => ipcRenderer.send("kumo:mini-close"),
    expandMiniPlayer: req => ipcRenderer.send("kumo:mini-expand", req),
    // An episode handed back by the small window, for this one to play.
    takePendingPlay: () => ipcRenderer.invoke("kumo:take-play"),
    onPlay: fn => ipcRenderer.on("kumo:play", (_e, req) => fn(req)),
})
