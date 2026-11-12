import {
    ArrowLeft,
    ChevronDown,
    Bell,
    BellOff,
    BookOpen,
    CalendarDays,
    ChartColumn,
    Compass,
    Download,
    ExternalLink,
    FolderSearch,
    HardDrive,
    Home,
    ListChecks,
    ListVideo,
    LogIn,
    LogOut,
    Magnet,
    Puzzle,
    Rss,
    Search,
    Server as ServerIcon,
    Settings as SettingsIcon,
    UserRound,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { api, desktop } from "@/lib/api"
import { useMediaQuery, usePersisted } from "@/lib/hooks"
import { useCollection, useDownloads, useSharing, useStatus } from "@/lib/queries"
import { notificationsMutedStore, torrentCountStore, useStore } from "@/lib/store"
import { holidayStore, useClassic } from "@/lib/themes"
import { tv } from "@/lib/tv"
import { cn, img } from "@/lib/utils"
import { ThemesMenu } from "./ThemesMenu"
import { HolidayOnLogo } from "./HolidayBadge"
import { LoginDialog } from "./LoginDialog"
import { PluginTrays } from "./plugins/PluginTrays"
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger, Tooltip } from "./ui"
import { useQueryClient } from "@tanstack/react-query"
import { toast as sonner } from "sonner"
import { toast } from "@/lib/toast"

const TILE =
    "M59.86 59.86C59.27 60.45 58.63 60.95 57.87 61.4C57.12 61.85 56.31 62.23 55.33 62.56C54.36 62.88 53.35 63.15 52.01 63.36C50.66 63.58 50.57 63.74 47.24 63.84C43.9 63.95 37.08 64 32 64C26.92 64 20.1 63.95 16.76 63.84C13.43 63.74 13.34 63.58 11.99 63.36C10.65 63.15 9.64 62.88 8.67 62.56C7.69 62.23 6.88 61.85 6.13 61.4C5.37 60.95 4.73 60.45 4.14 59.86C3.55 59.27 3.05 58.63 2.6 57.87C2.15 57.12 1.77 56.31 1.44 55.33C1.12 54.36 0.85 53.35 0.64 52.01C0.42 50.66 0.26 50.57 0.16 47.24C0.05 43.9 0 37.08 0 32C0 26.92 0.05 20.1 0.16 16.76C0.26 13.43 0.42 13.34 0.64 11.99C0.85 10.65 1.12 9.64 1.44 8.67C1.77 7.69 2.15 6.88 2.6 6.13C3.05 5.37 3.55 4.73 4.14 4.14C4.73 3.55 5.37 3.05 6.13 2.6C6.88 2.15 7.69 1.77 8.67 1.44C9.64 1.12 10.65 0.85 11.99 0.64C13.34 0.42 13.43 0.26 16.76 0.16C20.1 0.05 26.92 0 32 0C37.08 0 43.9 0.05 47.24 0.16C50.57 0.26 50.66 0.42 52.01 0.64C53.35 0.85 54.36 1.12 55.33 1.44C56.31 1.77 57.12 2.15 57.87 2.6C58.63 3.05 59.27 3.55 59.86 4.14C60.45 4.73 60.95 5.37 61.4 6.13C61.85 6.88 62.23 7.69 62.56 8.67C62.88 9.64 63.15 10.65 63.36 11.99C63.58 13.34 63.74 13.43 63.84 16.76C63.95 20.1 64 26.92 64 32C64 37.08 63.95 43.9 63.84 47.24C63.74 50.57 63.58 50.66 63.36 52.01C63.15 53.35 62.88 54.36 62.56 55.33C62.23 56.31 61.85 57.12 61.4 57.87C60.95 58.63 60.45 59.27 59.86 59.86Z"

// Aniko's logo: the A as a sitting cat (its peak the ears, its legs the
// paws) with a spark, on a plum tile. The same as the app icon
// (packaging/icons/aniko.svg) and the favicon (public/aniko.svg).
export function AnikoLogo({ className }: { className?: string }) {
    const classic = useClassic()
    // In this look, drawn in the theme's ink: the tile an outline, the cat
    // solid, its face the page's color.
    if (!classic)
        return (
            <svg viewBox="0 0 64 64" className={cn("text-fg", className)} aria-hidden>
                <path d={TILE} transform="translate(1.2 1.2) scale(0.9625)" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <g transform="translate(-1.6 0)">
                    <path d="M45 46.5C54.5 49.5 59.4 44.6 57.4 38.8 55.8 34.2 57.2 31 60.2 29.6" fill="none" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M23.5 10.5 29.6 18.4H34.4L40.5 10.5 50.5 49H41L32 39.5 23 49H13.5Z" fill="currentColor" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
                    <path d="M30.9 33.9h2.2l-1.1 1.3Z" fill="var(--bg)" stroke="var(--bg)" strokeWidth=".9" strokeLinejoin="round" />
                    <path d="M24.4 31.4q2.4-3 4.8 0M34.8 31.4q2.4-3 4.8 0" fill="none" stroke="var(--bg)" strokeWidth="1.9" strokeLinecap="round" />
                    <path d="M29.2 36.3q1.4 1.9 2.8 0 1.4 1.9 2.8 0" fill="none" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M15.6 32.6 11.4 31.5M15.2 36 11 36.7M48.4 32.6 51.6 31.5M48.8 36 52 36.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </g>
            </svg>
        )
    return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
            <path d={TILE} fill="#2A1D45" />
            <g transform="translate(-1.6 0)">
                <path d="M45 46.5C54.5 49.5 59.4 44.6 57.4 38.8 55.8 34.2 57.2 31 60.2 29.6" fill="none" stroke="#FFF1DC" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M23.5 10.5 29.6 18.4H34.4L40.5 10.5 50.5 49H41L32 39.5 23 49H13.5Z" fill="#FFF1DC" stroke="#FFF1DC" strokeWidth="5" strokeLinejoin="round" />
                <path d="M24.2 14.6 27.2 18.6 23.2 19.4ZM39.8 14.6 36.8 18.6 40.8 19.4ZM19.9 35.4a2.5 1.4 0 1 0 5 0 2.5 1.4 0 1 0-5 0ZM39.1 35.4a2.5 1.4 0 1 0 5 0 2.5 1.4 0 1 0-5 0Z" fill="#FF8FB1" />
                <path d="M30.9 33.9h2.2l-1.1 1.3Z" fill="#FF8FB1" stroke="#FF8FB1" strokeWidth=".9" strokeLinejoin="round" />
                <path d="M24.4 31.4q2.4-3 4.8 0M34.8 31.4q2.4-3 4.8 0" fill="none" stroke="#2A1D45" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M29.2 36.3q1.4 1.9 2.8 0 1.4 1.9 2.8 0" fill="none" stroke="#2A1D45" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15.6 32.6 11.4 31.5M15.2 36 11 36.7M48.4 32.6 51.6 31.5M48.8 36 52 36.7" fill="none" stroke="#FFF1DC" strokeWidth="1.5" strokeLinecap="round" />
            </g>
            <path d="M54 5.82Q54.7 9.8 58.68 10.5 54.7 11.2 54 15.18 53.3 11.2 49.32 10.5 53.3 9.8 54 5.82Z" fill="#7CE0D6" />
        </svg>
    )
}

// "Aniko" in the logo's typeface (Mochiy Pop One); in the text color.
export function AnikoWordmark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 126.6 35.9" className={className} aria-hidden>
            <path d="M6.84 35.44L0 34.16Q1.92 26.40 4.02 20.12Q6.12 13.84 8.36 9.36Q10.60 4.88 12.94 2.46Q15.28 0.04 17.64 0.04Q22.40 0.04 26.40 8.86Q30.40 17.68 33.20 34.40L26.12 35.36Q25.64 32.72 25.08 29.94Q24.52 27.16 23.92 24.52Q22.96 24.48 21.84 24.48Q19.88 24.48 17.70 24.56Q15.52 24.64 13.42 24.82Q11.32 25 9.52 25.20Q8.76 27.76 8.06 30.38Q7.36 33 6.84 35.44M14.20 12.08Q13.32 13.96 11.84 18.16Q13.56 17.96 15.48 17.86Q17.40 17.76 19.24 17.76Q20.80 17.76 22.24 17.84Q21.68 15.80 21.18 14.20Q20.68 12.60 20.28 11.68Q19.44 9.52 18.80 8.62Q18.16 7.72 17.48 7.72Q16.76 7.72 16.04 8.66Q15.32 9.60 14.20 12.08M43.40 35.44L36.96 35.48Q36.84 31.96 36.78 28.96Q36.72 25.96 36.72 23.04Q36.72 20.12 36.78 17.18Q36.84 14.24 37 10.88L43.76 10.88Q43.60 12.68 43.48 14.52Q44.84 12.80 46.72 11.66Q48.60 10.52 51.16 10.52Q53.68 10.52 55.30 11.36Q56.92 12.20 57.86 13.68Q58.80 15.16 59.22 17.06Q59.64 18.96 59.76 21.14Q59.88 23.32 59.88 25.52Q59.88 27.92 59.80 30.12Q59.72 32.32 59.64 33.80Q59.56 35.28 59.52 35.56L52.80 35.56Q52.88 33.92 52.96 32.06Q53.04 30.20 53.12 28.38Q53.20 26.56 53.20 25.08Q53.20 16.56 50.44 16.56Q48.16 16.56 46.30 18.54Q44.44 20.52 43.20 23.52Q43.20 23.92 43.20 24.32Q43.20 26.24 43.22 28.30Q43.24 30.36 43.30 32.22Q43.36 34.08 43.40 35.44M71.36 6.76L64.48 6.76Q64.48 6.40 64.46 6.02Q64.44 5.64 64.44 5.16Q64.44 3.88 64.52 2.44Q64.60 1 64.68 0L71.80 0.12Q71.68 1.48 71.54 3.20Q71.40 4.92 71.36 6.76M71.28 35.40L64.32 35.40Q64.20 32.92 64.16 30.10Q64.12 27.28 64.12 24.44Q64.12 20.72 64.20 17.20Q64.28 13.68 64.40 10.80L71.28 10.76Q71.12 12.60 71.08 15.30Q71.04 18 71.04 20.96Q71.04 23.88 71.08 26.72Q71.12 29.56 71.18 31.86Q71.24 34.16 71.28 35.40M83.20 35.36L76.24 35.52Q76.08 33.60 75.98 30.60Q75.88 27.60 75.88 24.08Q75.88 20.96 75.94 17.64Q76 14.32 76.14 11.10Q76.28 7.88 76.46 5.06Q76.64 2.24 76.88 0.12L83.84 0.60Q83.28 4.68 82.98 8.86Q82.68 13.04 82.60 17.36Q84.84 15.80 87.82 14.06Q90.80 12.32 95 10.12L98.76 16.40Q94.44 17.76 91.12 19.50Q87.80 21.24 85.68 23Q85.28 23.28 85.16 23.40Q85.04 23.52 85.04 23.56Q85.04 23.80 86.36 24.44Q88.12 25.36 90 26.24Q91.88 27.12 94.20 28.02Q96.52 28.92 99.52 29.92L96.76 35.84Q93.12 34.76 89.48 33.12Q85.84 31.48 82.88 29.80Q82.92 31.16 83.02 32.56Q83.12 33.96 83.20 35.36M113.88 35.88Q110.68 35.88 108.30 34.84Q105.92 33.80 104.36 31.98Q102.80 30.16 102.04 27.80Q101.28 25.44 101.28 22.84Q101.28 20.20 102.22 17.94Q103.16 15.68 104.82 14Q106.48 12.32 108.72 11.38Q110.96 10.44 113.60 10.44Q116.36 10.44 118.72 11.40Q121.08 12.36 122.84 14.08Q124.60 15.80 125.58 18.12Q126.56 20.44 126.56 23.16Q126.56 29.20 123.24 32.54Q119.92 35.88 113.88 35.88M113.84 29.40Q116.76 29.40 118.30 27.76Q119.84 26.12 119.84 23.04Q119.84 20.28 118.16 18.60Q116.48 16.92 113.76 16.92Q112.12 16.92 110.76 17.78Q109.40 18.64 108.58 20.06Q107.76 21.48 107.76 23.20Q107.76 24.72 108.38 26.16Q109 27.60 110.36 28.50Q111.72 29.40 113.84 29.40" fill="currentColor" />
        </svg>
    )
}

type Item = NavItem

export type NavItem = { to: string; label: string; icon: React.ReactNode; badge?: number; hint?: string; match?: (p: string) => boolean }

// The app's pages, in their groups, with the counts shown on them (active
// downloads, unmatched files): the sidebar's, and the phone's tab bar's.
export function useNavGroups(): { label: string; items: NavItem[] }[] {
    const { data: status } = useStatus()
    const { data: coll } = useCollection()
    const { data: downloads } = useDownloads()
    const torrentCount = useStore(torrentCountStore)
    const settings = status?.settings
    const { data: sharing } = useSharing(!!settings?.sharing?.enabled)
    // Only while one is connected: it shares with this device and answers.
    const hasServer = !!sharing?.peers?.some(p => p.role === "hub" && p.shares && p.online)
    const activeDownloads = (downloads ?? []).filter(d => ["queued", "resolving", "downloading"].includes(d.status)).length

    // Three groups: finding and watching anime (what's used most, first),
    // getting it, and looking after the library.
    return [
        {
            label: "Watch",
            items: [
                { to: "/", label: "Home", icon: <Home />, match: p => p === "/" },
                { to: "/search", label: "Search", icon: <Search />, hint: "Ctrl K" },
                { to: "/discover", label: "Discover", icon: <Compass /> },
                { to: "/local", label: "Local library", icon: <HardDrive /> },
                { to: "/lists", label: "My lists", icon: <ListChecks /> },
                { to: "/schedule", label: "Schedule", icon: <CalendarDays /> },
                ...(settings?.manga.enabled !== false ? [{ to: "/manga", label: "Manga", icon: <BookOpen />, match: (p: string) => p.startsWith("/manga") }] : []),
            ],
        },
        {
            label: "Downloads",
            items: [
                { to: "/downloads", label: "Downloads", icon: <Download />, badge: activeDownloads },
                { to: "/torrent-list", label: "Torrents", icon: <Magnet />, badge: settings?.torrent.showActiveCount ? torrentCount : 0 },
                { to: "/auto-downloader", label: "Auto downloader", icon: <Rss /> },
            ],
        },
        {
            label: "Manage",
            items: [
                { to: "/library", label: "Library tools", icon: <FolderSearch />, badge: coll?.unmatchedCount ?? 0 },
                { to: "/extensions", label: "Extensions", icon: <Puzzle /> },
                { to: "/playlists", label: "Playlists", icon: <ListVideo /> },
                { to: "/stats", label: "Stats", icon: <ChartColumn /> },
                // Your mediaserver, when this device uses one.
                ...(hasServer ? [{ to: "/server", label: "Server", icon: <ServerIcon /> }] : []),
            ],
        },
    ]
}

// Back to the page before, when there's one in Aniko. Not on a TV: its
// remote has Back. In the desktop app, Alt+Left (⌘[ on a Mac) and a
// mouse's back button too, which a browser does by itself.
function BackButton({ wide }: { wide: boolean }) {
    const location = useLocation()
    const navigate = useNavigate()
    // React Router counts the pages it went through (history.state.idx).
    const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
    useEffect(() => {
        if (!canGoBack || !desktop()) return
        const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
        const onKey = (e: KeyboardEvent) => {
            const mac = navigator.platform.startsWith("Mac")
            if (((!mac && e.altKey && e.key === "ArrowLeft") || (mac && e.metaKey && e.key === "[")) && !typing(e.target)) {
                e.preventDefault()
                navigate(-1)
            }
        }
        const onMouse = (e: MouseEvent) => {
            if (e.button === 3) {
                e.preventDefault()
                navigate(-1)
            }
        }
        window.addEventListener("keydown", onKey)
        window.addEventListener("mouseup", onMouse)
        return () => {
            window.removeEventListener("keydown", onKey)
            window.removeEventListener("mouseup", onMouse)
        }
    }, [canGoBack, navigate, location.key])
    if (!canGoBack) return null
    return (
        <Tooltip content="Back" side={wide ? "bottom" : "right"}>
            <button
                onClick={() => navigate(-1)}
                aria-label="Back"
                className="focus-ring grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
            >
                <ArrowLeft className="size-[18px] stroke-[1.75]" />
            </button>
        </Tooltip>
    )
}

// Labels from 1024px wide; narrower, only the icons, named by tooltips.
const WIDE = "(min-width: 1024px)"
const FADE = "linear-gradient(to bottom, #000 calc(100% - 36px), transparent)"

export function Sidebar() {
    const { data: status } = useStatus()
    const [loginOpen, setLoginOpen] = useState(false)
    const location = useLocation()
    const navigate = useNavigate()
    const qc = useQueryClient()
    const wide = useMediaQuery(WIDE)
    // Before 2.0: no group names, the open page in plain white.
    const classic = useClassic()
    // Links that don't fit scroll: they fade out at the bottom while there
    // are more below, so they aren't taken for all of them.
    const navRef = useRef<HTMLElement>(null)
    const [more, setMore] = useState(false)
    useEffect(() => {
        const nav = navRef.current
        if (!nav) return
        const check = () => setMore(nav.scrollTop + nav.clientHeight < nav.scrollHeight - 2)
        const ro = new ResizeObserver(check)
        ro.observe(nav)
        for (const group of nav.children) ro.observe(group)
        nav.addEventListener("scroll", check, { passive: true })
        check()
        return () => {
            ro.disconnect()
            nav.removeEventListener("scroll", check)
        }
    }, [])
    const holiday = useStore(holidayStore)

    const groups = useNavGroups()
    // What's used every day stays in sight; the rest folds under More (on
    // the TV too, whose screen is short; not in the icons-only sidebar).
    const all = groups.flatMap(g => g.items)
    const daily = new Set([...(groups[0]?.items ?? []).map(i => i.to), "/downloads"])
    const main = all.filter(i => daily.has(i.to))
    const rest = all.filter(i => !daily.has(i.to))
    const isActive = (it: Item) => (it.match ? it.match(location.pathname) : location.pathname.startsWith(it.to))
    const [moreOpen, setMoreOpen] = usePersisted("aniko-sidebar-more", false)
    const folds = wide && !classic
    const showRest = !folds || moreOpen || rest.some(isActive)
    const restBadge = rest.reduce((n, i) => n + (i.badge ?? 0), 0)

    // List changes made while AniList couldn't be reached, not sent yet.
    const waiting = status?.user ? (status.anilistPending ?? 0) : 0

    const logout = async () => {
        await api.post("/api/auth/logout")
        qc.invalidateQueries()
        toast.success("Logged out of AniList")
    }

    const link = (it: Item) => {
        const active = isActive(it)
        const badge = it.badge && it.badge > 0 ? (it.badge > 99 ? "99+" : String(it.badge)) : ""
        const el = (
            <NavLink
                key={it.to}
                to={it.to}
                // Icons only (narrow): named for screen readers too.
                aria-label={wide ? undefined : it.label}
                className={cn(
                    "focus-ring relative flex h-9 shrink-0 items-center font-medium transition-colors duration-200 [&>svg]:size-[18px] [&>svg]:shrink-0 [&>svg]:transition-colors [&>svg]:duration-200",
                    classic ? "rounded-md text-[13.5px] [&>svg]:stroke-[1.75]" : "label rounded-sm [&>svg]:stroke-[1.5]",
                    wide ? (classic ? "gap-3 px-2.5" : "gap-1.5 px-3") : "w-10 justify-center",
                    // The page it's on: tinted with the accent.
                    classic
                        ? active
                            ? "bg-white/[0.08] text-fg"
                            : "text-muted hover:bg-white/[0.04] hover:text-fg"
                        : active
                          ? cn("text-fg", !wide && "shadow-[inset_0_0_0_1px_var(--line-strong)]") // the open page: in brackets (index.css's nav-label); a box around the icon alone
                          : "text-muted hover:text-fg",
                )}
            >
                {it.icon}
                {wide && <span className={cn("truncate", !classic && "nav-label")}>{it.label}</span>}
                {badge &&
                    (wide ? (
                        <span className={cn("ml-auto px-1.5 text-fg/80 tabular-nums", classic ? "rounded bg-white/[0.08] text-[11px] leading-[18px]" : "border border-line-strong text-[10px] leading-4")}>{badge}</span>
                    ) : (
                        <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white tabular-nums">{badge}</span>
                    ))}
            </NavLink>
        )
        return wide ? (
            el
        ) : (
            <Tooltip key={it.to} content={it.label} side="right">
                {el}
            </Tooltip>
        )
    }

    return (
        <aside className={cn("relative z-40 flex h-full shrink-0 flex-col py-3", wide ? "w-52 px-2.5" : "w-16 items-center px-2")}>
            <div className={cn("mb-4 flex", wide ? "items-center gap-1" : "flex-col items-center gap-1")}>
                {/* Home is the first link below: the remote skips this one. */}
                <button
                    onClick={() => navigate("/")}
                    data-tv-skip-nav
                    className={cn("focus-ring flex h-10 items-center gap-2.5 rounded-md", wide ? "min-w-0 flex-1 px-2" : "justify-center")}
                    aria-label="Aniko home"
                >
                    <span className="relative shrink-0">
                        <AnikoLogo className="size-8" />
                        <HolidayOnLogo holiday={holiday} />
                    </span>
                    {wide && (classic ? <AnikoWordmark className="h-[18px] w-auto text-fg" /> : <span className="font-display text-[19px] leading-none font-semibold tracking-tight">Aniko</span>)}
                </button>
                {!tv && <BackButton wide={wide} />}
            </div>

            <nav
                ref={navRef}
                className={cn("no-scrollbar flex flex-1 flex-col overflow-y-auto", wide ? (classic ? "gap-4" : "gap-3") : "items-center gap-3")}
                style={more ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined}
            >
                <div className={cn("flex flex-col gap-0.5", !wide && "items-center")}>{main.map(link)}</div>
                {/* The pages used less: under More, closed until asked for (open on one of them). */}
                {rest.length > 0 && (
                    <div className={cn("flex flex-col gap-0.5", !wide && "items-center", !classic && "border-t border-line pt-3")}>
                        {folds && (
                            <button
                                onClick={() => setMoreOpen(!moreOpen)}
                                aria-expanded={showRest}
                                className="label focus-ring flex h-9 shrink-0 items-center gap-1.5 rounded-sm px-3 text-muted transition-colors duration-200 hover:text-fg"
                            >
                                <ChevronDown className={cn("size-[18px] shrink-0 stroke-[1.5] transition-transform duration-200", !showRest && "-rotate-90")} />
                                <span className="nav-label truncate">More</span>
                                {!showRest && restBadge > 0 && <span className="ml-auto border border-line-strong px-1.5 text-[10px] leading-4 text-fg/80 tabular-nums">{restBadge > 99 ? "99+" : restBadge}</span>}
                            </button>
                        )}
                        {showRest && rest.map(link)}
                    </div>
                )}
            </nav>

            <div className={cn("flex flex-col gap-0.5 pt-3", !classic && "border-t border-line", !wide && "items-center")}>
                {/* Themes, notifications and Settings: three icons in a row (one
                    under the other in the icons-only sidebar), named by tooltips.
                    The classic look and the TV keep their labelled rows. */}
                {classic || tv ? (
                    <>
                        <ThemesMenu wide={wide} />
                        <PluginTrays />
                        <div className={cn("flex gap-0.5", wide ? "items-center" : "flex-col-reverse items-center")}>
                            <div className={wide ? "min-w-0 flex-1" : undefined}>{link({ to: "/settings", label: "Settings", icon: <SettingsIcon /> })}</div>
                            <MuteButton side={wide ? "top" : "right"} />
                        </div>
                    </>
                ) : (
                    <>
                        <PluginTrays />
                        <div className={cn("flex items-center gap-1", wide ? "justify-center gap-2" : "flex-col")}>
                            <ThemesMenu wide={false} />
                            <MuteButton side={wide ? "top" : "right"} />
                            <Tooltip content="Settings" side={wide ? "top" : "right"}>
                                <NavLink
                                    to="/settings"
                                    aria-label="Settings"
                                    className={cn(
                                        "focus-ring grid size-9 shrink-0 place-items-center rounded-sm transition-colors duration-200 [&>svg]:size-[18px] [&>svg]:stroke-[1.5]",
                                        location.pathname.startsWith("/settings") ? "text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-muted hover:text-fg",
                                    )}
                                >
                                    <SettingsIcon />
                                </NavLink>
                            </Tooltip>
                        </div>
                    </>
                )}
                <Dropdown>
                    <DropdownTrigger asChild>
                        <button
                            className={cn(
                                "focus-ring flex items-center gap-2.5 text-left transition-colors",
                                classic
                                    ? cn("mt-1 h-10 rounded-md hover:bg-white/[0.04] data-[state=open]:bg-white/[0.06]", wide ? "px-2" : "w-10 justify-center")
                                    : cn(
                                          "mt-1.5 rounded-sm data-[state=open]:bg-white/[0.07]",
                                          wide ? "h-12 px-2 hover:bg-white/[0.05]" : "size-10 justify-center hover:bg-white/[0.05]",
                                      ),
                            )}
                            aria-label="Account"
                        >
                            {status?.user?.avatar?.large ? (
                                <img src={img(status.user.avatar.large)} alt="" className={cn("shrink-0 rounded-full object-cover", classic ? "size-7" : "size-8")} />
                            ) : (
                                <span className={cn("grid shrink-0 place-items-center rounded-full text-muted", classic ? "size-7 bg-surface-3" : "size-8 border border-line-strong")}>
                                    <UserRound className="size-4" />
                                </span>
                            )}
                            {wide && (
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-medium">{status?.user ? status.user.name : "Not logged in"}</span>
                                    <span className="block truncate text-[11px] text-subtle" title={waiting ? `${waiting} change${waiting === 1 ? "" : "s"} waiting for AniList` : undefined}>
                                        {status?.user ? (waiting ? `${waiting} change${waiting === 1 ? "" : "s"} to sync` : "AniList") : "Log in to sync"}
                                    </span>
                                </span>
                            )}
                        </button>
                    </DropdownTrigger>
                    <DropdownContent align="start" side="top" className="w-52">
                        <DropdownLabel>{status?.user ? status.user.name : "Not logged in"}</DropdownLabel>
                        {status?.user ? (
                            <>
                                <DropdownItem icon={<UserRound />} onSelect={() => navigate("/profile")}>
                                    Your profile
                                </DropdownItem>
                                {/* A TV has no browser to open it in. */}
                                {!tv && (
                                    <DropdownItem icon={<ExternalLink />} onSelect={() => window.open(`https://anilist.co/user/${status.user!.name}`, "_blank", "noopener")}>
                                        Open on AniList
                                    </DropdownItem>
                                )}
                                <DropdownSeparator />
                                <DropdownItem icon={<LogOut />} danger onSelect={logout}>
                                    Log out
                                </DropdownItem>
                            </>
                        ) : (
                            <DropdownItem icon={<LogIn />} onSelect={() => setLoginOpen(true)}>
                                Log in with AniList
                            </DropdownItem>
                        )}
                    </DropdownContent>
                </Dropdown>
            </div>
            <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
        </aside>
    )
}

// Mutes notifications (toasts), all but errors (lib/toast.ts), or turns them
// back on.
function MuteButton({ side }: { side: "top" | "right" }) {
    const classic = useClassic()
    const muted = useStore(notificationsMutedStore)
    const label = muted ? "Unmute notifications" : "Mute notifications"
    const toggle = () => {
        if (!muted) sonner.dismiss() // what's on screen goes too
        notificationsMutedStore.set(!muted)
        // Shown past the mute: it says what just happened.
        sonner.message(muted ? "Notifications on" : "Notifications muted. Errors still show.", { duration: 2500 })
    }
    return (
        <Tooltip content={label} side={side}>
            <button
                onClick={toggle}
                aria-label={label}
                aria-pressed={muted}
                className={cn(
                    "focus-ring grid size-9 shrink-0 place-items-center rounded-md transition-colors [&>svg]:size-[18px]",
                    classic ? "hover:bg-white/[0.04] [&>svg]:stroke-[1.75]" : "[&>svg]:stroke-[1.5]",
                    muted ? "text-amber-300" : "text-muted hover:text-fg",
                )}
            >
                {muted ? <BellOff /> : <Bell />}
            </button>
        </Tooltip>
    )
}
