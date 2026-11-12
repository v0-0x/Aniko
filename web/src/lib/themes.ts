// The app's colors (Settings › Appearance › Theme) and the holiday
// themes that come on by themselves in their month: Christmas in December,
// Halloween in October... (or always one, or none). The server keeps the
// choice (ui.colorTheme, ui.seasonal, ui.seasonalEffects) and the names
// (config.ColorThemes, config.Holidays).

import type { SearchParams } from "./queries"
import { createStore, useStore } from "./store"

// The pages (bg; the window, frame, is the same color in this look), panels
// on them (surface 1-4), the text and its greys, and the lines, as in
// index.css. The classic look's palettes have no text or lines of their
// own: white on dark, as it was.
type Palette = { frame: string; bg: string; s1: string; s2: string; s3: string; s4: string; muted: string; subtle: string; text?: string; line?: string; lineStrong?: string }

// light: dark text on a light page (index.css turns the whites and blacks
// the pages are drawn with around: html[data-scheme="light"]).
export type ColorTheme = { id: string; name: string; accent: string; palette: Palette; light?: boolean }

const dark = (bg: string, s: [string, string, string, string], text: string, muted: string, subtle: string, ink = "255 255 255"): Palette => ({
    frame: bg,
    bg,
    s1: s[0],
    s2: s[1],
    s3: s[2],
    s4: s[3],
    text,
    muted,
    subtle,
    line: `rgb(${ink} / 0.1)`,
    lineStrong: `rgb(${ink} / 0.2)`,
})

// This look's themes: one ink on one ground. Black and White first, then a
// few quiet ones.
export const COLOR_THEMES: ColorTheme[] = [
    { id: "black", name: "Black", accent: "#ededed", palette: dark("#0a0a0a", ["#111111", "#171717", "#1f1f1f", "#292929"], "#ededed", "#9a9a9a", "#6e6e6e") },
    {
        id: "white",
        name: "White",
        accent: "#111111",
        light: true,
        palette: { ...dark("#f6f6f4", ["#efefec", "#e8e8e4", "#dfdfda", "#d3d3cd"], "#111111", "#5c5c5c", "#85857f", "0 0 0"), line: "rgb(0 0 0 / 0.1)", lineStrong: "rgb(0 0 0 / 0.22)" },
    },
    { id: "graphite", name: "Graphite", accent: "#e6e6e8", palette: dark("#18181a", ["#1e1e21", "#252528", "#2c2c30", "#353539"], "#e6e6e8", "#a0a0a7", "#74747b") },
    {
        id: "paper",
        name: "Paper",
        accent: "#2a2620",
        light: true,
        palette: { ...dark("#f3eee3", ["#ebe5d8", "#e3dccd", "#d9d1c0", "#cdc4b1"], "#2a2620", "#6b6456", "#8f8575", "42 38 32"), line: "rgb(42 38 32 / 0.12)", lineStrong: "rgb(42 38 32 / 0.26)" },
    },
    { id: "phosphor", name: "Phosphor", accent: "#8dfab4", palette: dark("#07100b", ["#0b1610", "#101d15", "#15251b", "#1b2e22"], "#dff5e6", "#86ab93", "#5b7c67", "141 250 180") },
    { id: "amber", name: "Amber", accent: "#ffc86b", palette: dark("#110c05", ["#171108", "#1e160b", "#261c0f", "#2f2313"], "#f5e9d3", "#ad9973", "#7d6d50", "255 200 107") },
    { id: "ice", name: "Ice", accent: "#a9d8ff", palette: dark("#070c12", ["#0b121a", "#101923", "#15212d", "#1b2a38"], "#e1edf7", "#8a9fb3", "#5f7286", "169 216 255") },
    { id: "rose", name: "Rose", accent: "#ff9ec0", palette: dark("#120a0d", ["#180d12", "#1f1218", "#27171f", "#301d27"], "#f7e4ea", "#b08f9b", "#80646e", "255 158 192") },
]

// The classic look's (before 2.0), as they were (3.0.32's plum was never
// one of them).
export const CLASSIC_THEMES: ColorTheme[] = [
    { id: "graphite", name: "Graphite", accent: "#7c6cf2", palette: { frame: "#0a0a0b", bg: "#111113", s1: "#161618", s2: "#1c1c1f", s3: "#232326", s4: "#2b2b2f", muted: "#a1a1a8", subtle: "#707077" } },
    { id: "midnight", name: "Midnight", accent: "#5b8cff", palette: { frame: "#070a12", bg: "#0c111c", s1: "#111827", s2: "#172033", s3: "#1e2940", s4: "#26334d", muted: "#9aa4b8", subtle: "#6b7488" } },
    { id: "forest", name: "Forest", accent: "#34d399", palette: { frame: "#070b09", bg: "#0c120f", s1: "#111a15", s2: "#16211b", s3: "#1c2a22", s4: "#23342a", muted: "#9fb0a6", subtle: "#6d7f74" } },
    { id: "sakura", name: "Sakura", accent: "#f472b6", palette: { frame: "#0d0709", bg: "#140c10", s1: "#1b1116", s2: "#22161c", s3: "#2a1c23", s4: "#33222b", muted: "#b39aa6", subtle: "#7f6872" } },
    { id: "ember", name: "Ember", accent: "#f59e0b", palette: { frame: "#0d0906", bg: "#14100b", s1: "#1b1610", s2: "#221c14", s3: "#2a2219", s4: "#332a1f", muted: "#b3a691", subtle: "#7f7461" } },
    { id: "ocean", name: "Ocean", accent: "#22d3ee", palette: { frame: "#050c0e", bg: "#0a1416", s1: "#0f1c1f", s2: "#142428", s3: "#1a2d32", s4: "#21373d", muted: "#93aeb3", subtle: "#647d82" } },
    { id: "dusk", name: "Dusk", accent: "#a78bfa", palette: { frame: "#0a0810", bg: "#100d18", s1: "#161220", s2: "#1c1728", s3: "#231d31", s4: "#2b243b", muted: "#a79fb8", subtle: "#766e88" } },
    // True black: OLED screens (and TVs) switch those pixels off.
    { id: "black", name: "Black", accent: "#7c6cf2", palette: { frame: "#000000", bg: "#000000", s1: "#0b0b0c", s2: "#121214", s3: "#19191c", s4: "#212124", muted: "#a1a1a8", subtle: "#6e6e75" } },
]

// A theme saved in one look, drawn in the other: its nearest there (the
// saved name stays, so going back brings the same one).
const IN_FRAME: Record<string, string> = { aniko: "black", midnight: "ice", ocean: "ice", forest: "phosphor", sakura: "rose", ember: "amber", dusk: "graphite" }
const IN_CLASSIC: Record<string, string> = { aniko: "graphite", white: "graphite", paper: "graphite", phosphor: "forest", amber: "ember", ice: "midnight", rose: "sakura" }

// The themes of the look, and the one of them a saved name means.
export const themesOf = (classic: boolean) => (classic ? CLASSIC_THEMES : COLOR_THEMES)
export function colorTheme(id: string | undefined, classic = false) {
    const list = themesOf(classic)
    const alias = classic ? IN_CLASSIC : IN_FRAME
    // Nothing saved: this look's Black; the classic look's Graphite.
    return list.find(t => t.id === id) ?? list.find(t => t.id === alias[id ?? ""]) ?? list[0]
}

export type Effect = "snow" | "bats" | "hearts" | "petals" | "fireworks" | "fireflies"

export type Holiday = {
    id: string
    name: string
    // When it's on by itself ("In December").
    when: string
    accent: string
    // The color the whole app leans to while it's on (a little of it in the
    // window and the pages' colors): Halloween's purple night...
    tint: string
    effect: Effect
    effectName: string // "Falling snow"
    // Month 1-12, and the days of it (all of it without).
    month: number
    days?: [number, number]
    // A row of anime for it on Discover.
    picks?: { title: string; params: SearchParams; more?: string }
}

export const HOLIDAYS: Holiday[] = [
    { id: "newyear", name: "New Year", when: "January 1–7", accent: "#f5c542", tint: "#1e3a8a", effect: "fireworks", effectName: "Fireworks", month: 1, days: [1, 7] },
    {
        id: "valentine",
        name: "Valentine's Day",
        when: "In February",
        accent: "#f2557a",
        tint: "#9f1239",
        effect: "hearts",
        effectName: "Floating hearts",
        month: 2,
        picks: { title: "For Valentine's Day", params: { genres: ["Romance"], sort: ["POPULARITY_DESC"] }, more: "/search?genre=Romance&sort=POPULARITY_DESC" },
    },
    { id: "sakura", name: "Cherry blossoms", when: "In April", accent: "#f9a8d4", tint: "#be185d", effect: "petals", effectName: "Falling petals", month: 4 },
    { id: "summer", name: "Summer festival", when: "In August", accent: "#2dd4bf", tint: "#155e75", effect: "fireflies", effectName: "Fireflies", month: 8 },
    {
        id: "halloween",
        name: "Halloween",
        when: "In October",
        accent: "#f97316",
        tint: "#6b21a8",
        effect: "bats",
        effectName: "Bats",
        month: 10,
        picks: { title: "Halloween picks", params: { genres: ["Horror"], sort: ["POPULARITY_DESC"] }, more: "/search?genre=Horror&sort=POPULARITY_DESC" },
    },
    {
        id: "christmas",
        name: "Christmas",
        when: "In December",
        accent: "#ef4444",
        tint: "#166534",
        effect: "snow",
        effectName: "Falling snow",
        month: 12,
        picks: { title: "Christmas anime", params: { tags: ["Christmas"], sort: ["POPULARITY_DESC"] } },
    },
]

// The holiday theme on now: the one asked for always, or by the date
// ("auto"), or none ("off").
export function activeHoliday(setting: string | undefined, now = new Date()): Holiday | null {
    if (setting === "off") return null
    if (setting && setting !== "auto") return HOLIDAYS.find(h => h.id === setting) ?? null
    const m = now.getMonth() + 1
    const d = now.getDate()
    return HOLIDAYS.find(h => h.month === m && (!h.days || (d >= h.days[0] && d <= h.days[1]))) ?? null
}

export type ThemeChoice = { colorTheme?: string; accentColor?: string; seasonal?: string; seasonalEffects?: boolean; classicLook?: boolean }

// What's drawn: the colors, the accent (the holiday's while one is on), the
// holiday (the sidebar's decoration and its animation), and whether in the
// classic look (before 2.0).
export function resolveTheme(ui: ThemeChoice | undefined, now = new Date()) {
    const classic = !!ui?.classicLook
    const theme = colorTheme(ui?.colorTheme, classic)
    const holiday = activeHoliday(ui?.seasonal ?? "auto", now)
    return { theme, holiday, accent: holiday?.accent ?? (ownAccent(ui?.accentColor, classic) || theme.accent), effects: !!holiday && (ui?.seasonalEffects ?? true), classic }
}

// The accent as a choice of the user's ("" when it isn't one): not what
// every install had saved as its default (before 3.0.32, and since), and
// in the classic look not an ink of this look's themes, which would be
// white buttons with white text there.
const OLD_ACCENTS = ["#7c6cf2", "#ff7eb6"]
export function ownAccent(accent: string | undefined, classic: boolean) {
    const a = (accent ?? "").toLowerCase()
    if (!a) return ""
    if (classic) return COLOR_THEMES.some(t => t.accent === a) ? "" : a
    return OLD_ACCENTS.includes(a) ? "" : a
}

function luminance(hex: string) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return 0
    const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Text on the accent: dark on a light one, white on the rest.
const onAccent = (hex: string) => (luminance(hex) > 0.36 ? "#0a0a0a" : "#ffffff")

const CACHE_KEY = "aniko-theme"

// Sets the colors on the page, and remembers them for the next start (drawn
// before the settings come from the server: no flash of the default ones).
// cache: remembered for the next start (not colors only being tried).
export function applyTheme(t: { theme: ColorTheme; holiday: Holiday | null; accent: string; classic: boolean }, cache = true) {
    const p = t.theme.palette
    // A holiday leans the colors toward its own, a little (the window most;
    // not in the classic look, whose holidays only brought their accent).
    const lean = (color: string, pct: number) => (t.holiday && !t.classic ? `color-mix(in oklab, ${color} ${100 - pct}%, ${t.holiday.tint})` : color)
    const light = !!t.theme.light && !t.classic
    const vars: Record<string, string> = {
        "--brand": t.accent,
        "--on-brand": t.classic ? "#ffffff" : onAccent(t.accent),
        // On what stays dark in a light theme (the player): an accent too
        // dark to see there is drawn light.
        "--brand-on-dark": luminance(t.accent) < 0.12 ? "#ededed" : t.accent,
        "--frame": lean(p.frame, 12),
        "--bg": lean(p.bg, 8),
        "--surface-1": lean(p.s1, 7),
        "--surface-2": lean(p.s2, 7),
        "--surface-3": lean(p.s3, 6),
        "--surface-4": lean(p.s4, 6),
        "--muted": p.muted,
        "--subtle": p.subtle,
        // The classic look's: white on dark ("" leaves index.css's).
        "--text": p.text ?? "",
        "--line": p.line ?? "",
        "--line-strong": p.lineStrong ?? "",
    }
    setVars(vars, t.holiday?.id ?? "", t.classic, light)
    // The browser's own bars (phones) in the window's color.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", p.frame)
    if (!cache) return
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ vars, holiday: t.holiday?.id ?? "", classic: t.classic, light }))
    } catch {
        /* drawn with the default colors at the next start */
    }
}

function setVars(vars: Record<string, string>, holiday: string, classic: boolean, light: boolean) {
    const el = document.documentElement
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v)
    // For index.css (data-scheme="light"): dark text on a light page.
    if (light) el.dataset.scheme = "light"
    else delete el.dataset.scheme
    if (holiday) el.dataset.holiday = holiday
    else delete el.dataset.holiday
    // For index.css (data-look="classic"); the components read classicStore.
    if (classic) el.dataset.look = "classic"
    else delete el.dataset.look
    classicStore.set(classic)
}

// The colors used last time, at once (main.tsx, before the first render).
export function applyCachedTheme() {
    try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { vars?: Record<string, string>; holiday?: string; classic?: boolean; light?: boolean } | null
        if (c?.vars) setVars(c.vars, HOLIDAYS.some(h => h.id === c.holiday) ? c.holiday! : "", c.classic === true, c.light === true)
    } catch {
        /* the default colors */
    }
}

// Changed in Settings and not saved yet (null: the saved ones).
export const themePreviewStore = createStore<ThemeChoice | null>(null)

// The holiday theme drawn now (App sets it): the sidebar decorates for it.
export const holidayStore = createStore<Holiday | null>(null)

// The classic look (before 2.0) is on: the components draw themselves as
// they were then (ui.tsx, the sidebar, cards, the holiday themes).
export const classicStore = createStore(false)
export const useClassic = () => useStore(classicStore)
