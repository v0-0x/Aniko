// Exposes a tiny, safe bridge to the web UI.
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("kumoDesktop", {
    platform: process.platform,
    anilistLogin: url => ipcRenderer.invoke("aniko:anilist-login", url),
    openExternal: url => ipcRenderer.send("aniko:open-external", url),
    // The desktop app's own settings (Settings › Desktop app & programs).
    getPrefs: () => ipcRenderer.invoke("aniko:get-prefs"),
    setPref: (name, value) => ipcRenderer.invoke("aniko:set-pref", name, value),
    // Quits Aniko, server and all.
    quit: () => ipcRenderer.send("aniko:quit"),
    // Picture in picture: the small player window (web/src/lib/pip.ts).
    openMiniPlayer: page => ipcRenderer.invoke("aniko:mini-open", page),
    closeMiniPlayer: () => ipcRenderer.send("aniko:mini-close"),
    expandMiniPlayer: req => ipcRenderer.send("aniko:mini-expand", req),
    // An episode handed back by the small window, for this one to play.
    takePendingPlay: () => ipcRenderer.invoke("aniko:take-play"),
    onPlay: fn => ipcRenderer.on("aniko:play", (_e, req) => fn(req)),
})
