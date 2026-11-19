// Exposes a tiny, safe bridge to the web UI.
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("kumoDesktop", {
    platform: process.platform,
    anilistLogin: url => ipcRenderer.invoke("nyakuro:anilist-login", url),
    openExternal: url => ipcRenderer.send("nyakuro:open-external", url),
    // The desktop app's own settings (Settings › Desktop app & programs).
    getPrefs: () => ipcRenderer.invoke("nyakuro:get-prefs"),
    setPref: (name, value) => ipcRenderer.invoke("nyakuro:set-pref", name, value),
    // Quits Nyakuro, server and all.
    quit: () => ipcRenderer.send("nyakuro:quit"),
    // Picture in picture: the small player window (web/src/lib/pip.ts).
    openMiniPlayer: page => ipcRenderer.invoke("nyakuro:mini-open", page),
    closeMiniPlayer: () => ipcRenderer.send("nyakuro:mini-close"),
    expandMiniPlayer: req => ipcRenderer.send("nyakuro:mini-expand", req),
    // An episode handed back by the small window, for this one to play.
    takePendingPlay: () => ipcRenderer.invoke("nyakuro:take-play"),
    onPlay: fn => ipcRenderer.on("nyakuro:play", (_e, req) => fn(req)),
})
