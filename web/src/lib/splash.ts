import type { QueryClient } from "@tanstack/react-query"

// The loading screen (index.html's #splash) stays over the window until the
// app is there to use: its first page drawn, what that page asked the server
// answered, and the pictures in view loaded. On a slow device (a TV) that
// takes seconds, during which the page under it would stand half-drawn and
// not answer.
const LONGEST = 12_000 // never kept longer (a server that doesn't answer)
const PICTURES = 2_500 // nor waiting for pictures longer than this

export function startSplash(qc: QueryClient) {
    const el = document.getElementById("splash")
    if (!el) return
    const started = Date.now()
    let calm = 0
    const hide = () => {
        el.classList.add("done")
        setTimeout(() => el.remove(), 300)
    }
    const timer = setInterval(() => {
        const root = document.getElementById("root")
        // Still loading: a request under way, nothing drawn yet, or a page's
        // code on its way (App marks that with data-page-loading).
        const busy = qc.isFetching() > 0 || !root?.firstElementChild || !!document.querySelector("[data-page-loading]")
        calm = busy ? 0 : calm + 1
        const late = Date.now() - started > LONGEST
        // Twice in a row: a page that asks for more once it has its first answer.
        if (calm < 2 && !late) return
        clearInterval(timer)
        if (late) hide()
        else pictures().then(hide)
    }, 150)
}

// The pictures in view have loaded (or failed), or PICTURES went by.
function pictures(): Promise<void> {
    const inView = [...document.images].filter(i => {
        if (i.complete || i.closest("#splash")) return false
        const r = i.getBoundingClientRect()
        return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth
    })
    if (!inView.length) return Promise.resolve()
    return new Promise(done => {
        let left = inView.length
        const one = () => --left <= 0 && done()
        for (const i of inView) {
            i.addEventListener("load", one, { once: true })
            i.addEventListener("error", one, { once: true })
        }
        setTimeout(done, PICTURES)
    })
}
