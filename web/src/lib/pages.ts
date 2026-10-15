// Going back to a page finds it as it was left: scrolled where it was and,
// on a TV, with the remote's focus on what it was on. A new page starts at
// its top.

import { FOCUSABLE, focusEl, tv } from "./tv"

type Mark = { label: string; nth: number }
type Page = { scroll: number; focus: Mark | null }

const pages = new Map<string, Page>()
let current = ""
let listening = false

const main = () => document.getElementById("main-scroll")

// What a focusable thing is called, to find it again: where a link goes,
// else its name or text.
function labelOf(el: Element) {
    return (el.getAttribute("href") || el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160)
}

function sameAs(root: HTMLElement, label: string) {
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => labelOf(el) === label)
}

function page(): Page | null {
    if (!current) return null
    let p = pages.get(current)
    if (!p) pages.set(current, (p = { scroll: 0, focus: null }))
    return p
}

function listen() {
    if (listening) return
    const m = main()
    if (!m) return
    listening = true
    m.addEventListener(
        "scroll",
        () => {
            const p = page()
            if (p) p.scroll = m.scrollTop
        },
        { passive: true },
    )
    if (tv)
        document.addEventListener("focusin", e => {
            const el = e.target as HTMLElement
            const p = page()
            if (!p || !m.contains(el)) return
            const label = labelOf(el)
            p.focus = label ? { label, nth: Math.max(0, sameAs(m, label).indexOf(el)) } : null
        })
}

// openPage is called when the page shown changes (key: the history entry).
export function openPage(key: string, how: "POP" | "PUSH" | "REPLACE") {
    listen()
    const m = main()
    // The same entry with a new query (a filter): it stays as it is.
    const before = current
    current = key
    if (!m || how === "REPLACE" || before === key) return
    const saved = pages.get(key)
    if (how === "PUSH" || !saved) {
        m.scrollTop = 0
        return
    }
    // Back: the page may still be loading; tried until it's there (2s).
    const until = Date.now() + 2000
    const step = () => {
        if (current !== key) return
        if (m.scrollHeight - m.clientHeight >= saved.scroll - 1) m.scrollTop = saved.scroll
        const scrolled = Math.abs(m.scrollTop - saved.scroll) < 2
        let focused = !tv || !saved.focus
        if (!focused && saved.focus) {
            const same = sameAs(m, saved.focus.label)
            const el = same[saved.focus.nth] ?? same[0]
            const a = document.activeElement
            if (el && (!a || a === document.body || !m.contains(a))) el.focus({ preventScroll: true })
            focused = !!el
        }
        if ((scrolled && focused) || Date.now() > until) return
        setTimeout(step, 50)
    }
    step()
}

// TV: the remote's focus doesn't drop out of the page when what had it goes
// (a card removed, a list redrawn): it goes to what's nearest instead.
export function keepFocus() {
    if (!tv) return
    let last: HTMLElement | null = null
    let rect: DOMRect | null = null
    document.addEventListener("focusin", e => {
        last = e.target as HTMLElement
        rect = last.getBoundingClientRect()
    })
    let timer = 0
    new MutationObserver(() => {
        if (!last || last.isConnected || timer) return
        // A moment later: a dialog closing gives the focus back itself, and
        // the player to what opened it.
        timer = window.setTimeout(() => {
            timer = 0
            const a = document.activeElement
            if (!last || last.isConnected || !rect || (a && a !== document.body)) return
            const r = rect
            const root = document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"], [data-tv-scope]') ?? main() ?? document.body
            let best: HTMLElement | null = null
            let bestD = Infinity
            for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
                const b = el.getBoundingClientRect()
                if (b.width < 2 || b.height < 2 || el.closest('[aria-hidden="true"], [inert]')) continue
                const d = Math.hypot(b.left + b.width / 2 - (r.left + r.width / 2), b.top + b.height / 2 - (r.top + r.height / 2))
                if (d < bestD) {
                    bestD = d
                    best = el
                }
            }
            if (best) focusEl(best)
        }, 60)
    }).observe(document.body, { childList: true, subtree: true })
}
