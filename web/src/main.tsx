import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App"
import { PageError } from "./components/PageError"
import "./index.css"
import { startSplash } from "./lib/splash"
import { applyCachedTheme } from "./lib/themes"

// Aniko was called Nyakuro for one beta (3.0.59), and Kumo before 2.0.37: what this
// browser kept under an old name (the theme, sorting, the player's volume…)
// takes Aniko's, once.
function renameStored(store: Storage) {
    for (const key of Object.keys(store)) {
        const old = /^(nyakuro|kumo)(?=[-:.])/.exec(key)
        if (!old) continue
        const name = "aniko" + key.slice(old[1].length)
        if (store.getItem(name) === null) store.setItem(name, store.getItem(key) ?? "")
        store.removeItem(key)
    }
}
for (const store of ["localStorage", "sessionStorage"] as const) {
    try {
        renameStored(window[store])
    } catch {
        // no storage (a private window): nothing kept either
    }
}

// A picture that didn't load (offline, a cover that's gone): nothing in its
// place, not the browser's broken-picture mark. Back when it loads.
window.addEventListener(
    "error",
    e => {
        if (e.target instanceof HTMLImageElement) e.target.style.visibility = "hidden"
    },
    true,
)
window.addEventListener(
    "load",
    e => {
        if (e.target instanceof HTMLImageElement && e.target.style.visibility) e.target.style.visibility = ""
    },
    true,
)

// The colors used last time, before the settings come from the server.
applyCachedTheme()

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: (count, err: any) => count < 1 && err?.status !== 401 && err?.status !== 403 && err?.status !== 404,
        },
    },
})

// The loading screen goes once the first page is there to use.
startSplash(queryClient)

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                {/* An error outside the pages (the sidebar, the player): a message, not a black window. */}
                <PageError full>
                    <App />
                </PageError>
            </BrowserRouter>
        </QueryClientProvider>
    </React.StrictMode>,
)
