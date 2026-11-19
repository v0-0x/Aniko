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
    WifiOff,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { api, desktop } from "@/lib/api"
import { useMediaQuery, usePersisted } from "@/lib/hooks"
import { useCollection, useDownloads, useSharing, useStatus } from "@/lib/queries"
import { notificationsMutedStore, torrentCountStore, useStore } from "@/lib/store"
import { holidayStore, useCinema, useClassic } from "@/lib/themes"
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

// Nyakuro's logo: a black cat asleep under a crescent moon, on a plum tile.
// The same as the app icon (packaging/icons/nyakuro.svg) and the favicon
// (public/nyakuro.svg).
const MOON = "M47 7a13 13 0 1 0 11 19A9.5 9.5 0 0 1 47 7Z"
const BODY = "M15 43a18 13 0 1 0 36 0a18 13 0 1 0-36 0Z"
const TAIL = "M49 44c4 6-1 12-10 12H17c-5 0-7-3-6-6"
const HEAD = "M14 29l3-12 9 7h6l9-7 3 12c0 7-6 12-15 12S14 36 14 29Z"
const EARS = "M19 22 21.6 25.6l-3 .6ZM39 22 36.4 25.6l3 .6Z"
const EYES = "M21 32q2.5 2.6 5 0M32 32q2.5 2.6 5 0"
const NOSE = "M27.8 35.4h2.4l-1.2 1.3Z"
const SPARK = "M0 -5Q.7 -.7 5 0 .7 .7 0 5 -.7 .7 -5 0 -.7 -.7 0 -5Z"
export function NyakuroLogo({ className }: { className?: string }) {
    const classic = useClassic()
    // In this look, drawn in the theme's ink: the tile an outline, the cat
    // and the moon solid, its face the page's color.
    if (!classic)
        return (
            <svg viewBox="0 0 64 64" className={cn("text-fg", className)} aria-hidden>
                <path d={TILE} transform="translate(1.2 1.2) scale(0.9625)" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d={MOON} fill="currentColor" />
                <path d={BODY} fill="currentColor" stroke="var(--bg)" strokeWidth="2" />
                <path d={TAIL} fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
                <path d={HEAD} fill="currentColor" stroke="var(--bg)" strokeWidth="2" strokeLinejoin="round" />
                <path d={HEAD} fill="currentColor" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" transform="translate(32 29) scale(0.94) translate(-32 -29)" />
                <path d={EYES} fill="none" stroke="var(--bg)" strokeWidth="1.7" strokeLinecap="round" />
                <path d={NOSE} fill="var(--bg)" />
                <path d={SPARK} transform="translate(11 14) scale(0.9)" fill="currentColor" />
                <path d={SPARK} transform="translate(56 40) scale(0.6)" fill="currentColor" />
            </svg>
        )
    return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
            <path d={TILE} fill="#2A1D45" />
            <path d={MOON} fill="#FFF1DC" />
            <path d={BODY} fill="#17121F" />
            <path d={TAIL} fill="none" stroke="#17121F" strokeWidth="5.5" strokeLinecap="round" />
            <path d={HEAD} fill="#17121F" stroke="#17121F" strokeWidth="4" strokeLinejoin="round" />
            <path d={EARS} fill="#FF8FB1" />
            <path d={EYES} fill="none" stroke="#FFF1DC" strokeWidth="1.7" strokeLinecap="round" />
            <path d={NOSE} fill="#FF8FB1" />
            <circle cx="23" cy="36.5" r="1.6" fill="#FF8FB1" opacity=".7" />
            <circle cx="35" cy="36.5" r="1.6" fill="#FF8FB1" opacity=".7" />
            <path d={SPARK} transform="translate(11 14) scale(0.9)" fill="#7CE0D6" />
            <path d={SPARK} transform="translate(56 40) scale(0.6)" fill="#7CE0D6" />
        </svg>
    )
}

// "Nyakuro" in the logo's typeface (Mochiy Pop One); in the text color.
export function NyakuroWordmark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 191.3 43.3" className={className} aria-hidden>
            <path transform="translate(-2.88 32.48)" d="M10 2.80L2.88 2.92Q2.88-3.32 3.06-8.34Q3.24-13.36 3.54-17.50Q3.84-21.64 4.22-25.22Q4.60-28.80 4.96-32.08L4.96-32.08L11.84-31.80Q11.68-30.56 11.48-29.12L11.48-29.12Q12.84-27.28 14.46-24.92Q16.08-22.56 17.78-19.94Q19.48-17.32 21.12-14.70Q22.76-12.08 24.24-9.70Q25.72-7.32 26.84-5.44L26.84-5.44Q27.12-8.20 27.12-13.20L27.12-13.20Q27.12-15.76 27.04-18.48Q26.96-21.20 26.84-23.70Q26.72-26.20 26.52-28.18Q26.32-30.16 26.08-31.28L26.08-31.28L33.60-32.20Q33.68-30.24 33.70-27.06Q33.72-23.88 33.72-20.32L33.72-20.32Q33.72-17.16 33.68-13.98Q33.64-10.80 33.52-8.12Q33.40-5.44 33.16-3.68L33.16-3.68Q32.72-0.24 31.40 1.40Q30.08 3.04 27.68 3.04L27.68 3.04Q25.72 3.04 24.10 1.68Q22.48 0.32 20.60-2.80L20.60-2.80Q19.32-4.96 17.62-7.78Q15.92-10.60 14.10-13.56Q12.28-16.52 10.60-19.20L10.60-19.20Q10.28-14.52 10.12-9.86Q9.96-5.20 9.96-1.44L9.96-1.44Q9.96-0.24 9.96 0.82Q9.96 1.88 10 2.80L10 2.80ZM44.92 10.84L44.92 10.84L38.92 7.64Q41.16 5.16 43.28 2.54Q45.40-0.08 47.32-2.84L47.32-2.84Q45.44-5.36 43.56-8.26Q41.68-11.16 40.08-13.96Q38.48-16.76 37.48-18.96L37.48-18.96L43.88-21.76Q44.60-19.84 45.74-17.60Q46.88-15.36 48.26-13.04Q49.64-10.72 51.12-8.60L51.12-8.60Q55.44-15.60 58.24-22.40L58.24-22.40L64.88-19.76Q63.08-16.32 60.82-12.38Q58.56-8.44 55.98-4.38Q53.40-0.32 50.60 3.58Q47.80 7.48 44.92 10.84ZM77.68 3.16L77.68 3.16Q74.68 3.16 72.24 1.62Q69.80 0.08 68.38-2.54Q66.96-5.16 66.96-8.40L66.96-8.40Q66.96-11.44 68.08-13.90Q69.20-16.36 71.14-18.12Q73.08-19.88 75.56-20.82Q78.04-21.76 80.76-21.76L80.76-21.76Q83.04-21.76 85.24-21.12L85.24-21.12Q85.40-21.96 85.52-22.80L85.52-22.80L92.36-21.64Q92.08-20.88 91.80-19.36Q91.52-17.84 91.34-15.96Q91.16-14.08 91.04-12.20Q90.92-10.32 90.92-8.80L90.92-8.80Q90.92-7.56 91.10-6.38Q91.28-5.20 91.88-4.46Q92.48-3.72 93.72-3.72L93.72-3.72L94.28-3.72L93.28 3.24Q90.64 3.24 88.92 2.34Q87.20 1.44 86.16-0.08L86.16-0.08Q84.44 1.84 82.24 2.50Q80.04 3.16 77.68 3.16ZM73.52-7.60L73.52-7.60Q73.72-5.68 75.10-4.54Q76.48-3.40 78.60-3.40L78.60-3.40Q80.64-3.40 82-4.50Q83.36-5.60 84.24-7.52L84.24-7.52Q84.20-8.16 84.20-8.84L84.20-8.84Q84.20-10.24 84.28-11.72Q84.36-13.20 84.48-14.64L84.48-14.64Q82.80-15.28 80.96-15.28L80.96-15.28Q78.80-15.28 77.10-14.42Q75.40-13.56 74.44-12.04Q73.48-10.52 73.48-8.52L73.48-8.52Q73.48-8.28 73.48-8.04Q73.48-7.80 73.52-7.60ZM104.04 2.76L97.08 2.92Q96.92 1 96.82-2Q96.72-5 96.72-8.52L96.72-8.52Q96.72-11.64 96.78-14.96Q96.84-18.28 96.98-21.50Q97.12-24.72 97.30-27.54Q97.48-30.36 97.72-32.48L97.72-32.48L104.68-32Q104.12-27.92 103.82-23.74Q103.52-19.56 103.44-15.24L103.44-15.24Q105.68-16.80 108.66-18.54Q111.64-20.28 115.84-22.48L115.84-22.48L119.60-16.20Q115.28-14.84 111.96-13.10Q108.64-11.36 106.52-9.60L106.52-9.60Q106.12-9.32 106-9.20Q105.88-9.08 105.88-9.04L105.88-9.04Q105.88-8.80 107.20-8.16L107.20-8.16Q108.96-7.24 110.84-6.36Q112.72-5.48 115.04-4.58Q117.36-3.68 120.36-2.68L120.36-2.68L117.60 3.24Q113.96 2.16 110.32 0.52Q106.68-1.12 103.72-2.80L103.72-2.80Q103.76-1.44 103.86-0.04Q103.96 1.36 104.04 2.76L104.04 2.76ZM130.92 3.28L130.92 3.28Q128.36 3.28 126.70 2.38Q125.04 1.48 124.06-0.08Q123.08-1.64 122.62-3.58Q122.16-5.52 122.02-7.62Q121.88-9.72 121.88-11.68L121.88-11.68Q121.88-13.92 122.02-16.24Q122.16-18.56 122.32-21.32L122.32-21.32L129.64-21.76Q129.52-20.92 129.28-19.24Q129.04-17.56 128.84-15.40Q128.64-13.24 128.64-10.88L128.64-10.88Q128.64-7 129.32-5.14Q130-3.28 131.36-3.28L131.36-3.28Q134.08-3.28 135.36-7.24Q136.64-11.20 136.64-19.76L136.64-19.76L136.64-21.60L140.04-21.68L144.16-21.76Q143.60-18 143.32-14.84Q143.04-11.68 142.96-9.54Q142.88-7.40 142.88-6.68L142.88-6.68Q142.88-4.84 143.20-4.06Q143.52-3.28 144.32-3.28L144.32-3.28Q144.72-3.28 145.20-3.44Q145.68-3.60 146.32-4L146.32-4L146.04 2.88Q144.52 3.12 143.40 3.12L143.40 3.12Q141.48 3.12 140.26 2.40Q139.04 1.68 138.32 0.48L138.32 0.48Q137.08 1.80 135.26 2.54Q133.44 3.28 130.92 3.28ZM156.16 3.12L149.44 3.12Q149.60-0.20 149.68-3.52Q149.76-6.84 149.76-10.08L149.76-10.08Q149.72-13.04 149.66-15.94Q149.60-18.84 149.44-21.56L149.44-21.56L156.16-21.76Q156.20-20.28 156.28-18.72L156.28-18.72Q157.56-20.32 159.26-21.30Q160.96-22.28 163.16-22.28L163.16-22.28Q164-22.28 165.32-22.04Q166.64-21.80 168-21.12L168-21.12L167.24-14.36Q166.24-14.96 165.10-15.22Q163.96-15.48 163.20-15.48L163.20-15.48Q160.64-15.48 158.86-13.18Q157.08-10.88 156.44-6.80L156.44-6.80Q156.44-4 156.38-1.46Q156.32 1.08 156.16 3.12L156.16 3.12ZM181.52 3.28L181.52 3.28Q178.32 3.28 175.94 2.24Q173.56 1.20 172-0.62Q170.44-2.44 169.68-4.80Q168.92-7.16 168.92-9.76L168.92-9.76Q168.92-12.40 169.86-14.66Q170.80-16.92 172.46-18.60Q174.12-20.28 176.36-21.22Q178.60-22.16 181.24-22.16L181.24-22.16Q184-22.16 186.36-21.20Q188.72-20.24 190.48-18.52Q192.24-16.80 193.22-14.48Q194.20-12.16 194.20-9.44L194.20-9.44Q194.20-3.40 190.88-0.06Q187.56 3.28 181.52 3.28ZM181.48-3.20L181.48-3.20Q184.40-3.20 185.94-4.84Q187.48-6.48 187.48-9.56L187.48-9.56Q187.48-12.32 185.80-14Q184.12-15.68 181.40-15.68L181.40-15.68Q179.76-15.68 178.40-14.82Q177.04-13.96 176.22-12.54Q175.40-11.12 175.40-9.40L175.40-9.40Q175.40-7.88 176.02-6.44Q176.64-5 178-4.10Q179.36-3.20 181.48-3.20Z" fill="currentColor" />
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
                // Year in review is reached from it.
                { to: "/stats", label: "Stats", icon: <ChartColumn />, match: p => p.startsWith("/stats") || p.startsWith("/year") },
                // Your mediaserver, when this device uses one.
                ...(hasServer ? [{ to: "/server", label: "Server", icon: <ServerIcon /> }] : []),
            ],
        },
    ]
}

// Back to the page before, when there's one in Nyakuro. Not on a TV: its
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
    // Cinema (experimental): a rail of icons over the pages' left edge,
    // whatever the window's width (a TV keeps the names).
    const rail = useCinema() && !tv
    const wide = useMediaQuery(WIDE) && !rail
    // The Classic look (before 3.0.37): rounded links, the open page a pill
    // in the accent. This look: words, the open page in brackets.
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
    const [moreOpen, setMoreOpen] = usePersisted("nyakuro-sidebar-more", false)
    const folds = wide
    const showRest = !folds || moreOpen || rest.some(isActive)
    const restBadge = rest.reduce((n, i) => n + (i.badge ?? 0), 0)

    // List changes made while AniList couldn't be reached, not sent yet.
    const waiting = status?.user ? (status.anilistPending ?? 0) : 0

    // Offline mode (Settings › Web UI & network): this computer's, so not
    // switched from another device.
    const offline = !!status?.settings.server.offline
    const canOffline = !!status && status.client !== "lan"
    const toggleOffline = async () => {
        const s = status?.settings
        if (!s) return
        try {
            await api.put("/api/settings", { ...s, server: { ...s.server, offline: !offline } })
            toast.success(offline ? "Back online" : "Offline mode: Nyakuro uses what it has here, and list changes wait")
        } catch (e: any) {
            toast.error(e.message)
        }
        qc.invalidateQueries()
    }

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
                    classic ? "rounded-full font-display text-[13.5px] [&>svg]:stroke-[1.75]" : "label rounded-sm [&>svg]:stroke-[1.5]",
                    wide ? (classic ? "gap-3 px-3" : "gap-1.5 px-3") : "w-10 justify-center",
                    // The page it's on: tinted with the accent.
                    classic
                        ? active
                            ? "bg-[color-mix(in_oklab,var(--brand)_20%,transparent)] text-fg [&>svg]:text-brand-strong" // the open page: a pill in the accent
                            : "text-muted hover:bg-white/[0.045] hover:text-fg"
                        : active
                          ? cn("text-fg", !wide && "shadow-[inset_0_-1px_0_var(--text)]") // the open page: in brackets (index.css's nav-label); a line under the icon alone
                          : "text-muted hover:text-fg",
                )}
            >
                {it.icon}
                {wide && <span className={cn("truncate", !classic && "nav-label")}>{it.label}</span>}
                {badge &&
                    (wide ? (
                        <span className={cn("ml-auto px-1.5 text-fg/80 tabular-nums", classic ? "rounded-md bg-white/[0.08] text-[11px] leading-[18px]" : "border border-line-strong text-[10px] leading-4")}>{badge}</span>
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
        <aside
            className={cn(
                "z-40 flex shrink-0 flex-col py-3",
                rail ? "absolute inset-y-0 left-0 w-[4.5rem] items-center bg-gradient-to-r from-bg/75 via-bg/40 to-transparent px-2" : "relative h-full",
                !rail && (wide ? "w-52 px-2.5" : "w-16 items-center px-2"),
            )}
        >
            <div className={cn("mb-4 flex", wide ? "items-center gap-1" : "flex-col items-center gap-1")}>
                {/* Home is the first link below: the remote skips this one. */}
                <button
                    onClick={() => navigate("/")}
                    data-tv-skip-nav
                    className={cn("focus-ring flex h-10 items-center gap-2.5 rounded-md", wide ? "min-w-0 flex-1 px-2" : "justify-center")}
                    aria-label="Nyakuro home"
                >
                    <span className="relative shrink-0">
                        <NyakuroLogo className="size-8" />
                        <HolidayOnLogo holiday={holiday} />
                    </span>
                    {wide && (classic ? <NyakuroWordmark className="h-[18px] w-auto text-fg" /> : <span className="font-display text-[19px] leading-none font-semibold tracking-tight">Nyakuro</span>)}
                </button>
                {!tv && <BackButton wide={wide} />}
            </div>

            <nav
                ref={navRef}
                className={cn("no-scrollbar flex flex-1 flex-col overflow-y-auto", "gap-3", !wide && "items-center")}
                style={more ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined}
            >
                <div className={cn("flex flex-col gap-0.5", !wide && "items-center")}>{main.map(link)}</div>
                {/* The pages used less: under More, closed until asked for (open on one of them). */}
                {rest.length > 0 && (
                    <div className={cn("flex flex-col gap-0.5", !wide && "items-center", "border-t pt-3", classic ? "border-line/70" : "border-line")}>
                        {folds && (
                            <button
                                onClick={() => setMoreOpen(!moreOpen)}
                                aria-expanded={showRest}
                                className={cn(
                                    "focus-ring flex h-9 shrink-0 items-center text-muted transition-colors duration-200 hover:text-fg",
                                    classic ? "gap-3 rounded-[10px] px-2.5 text-[13.5px] font-medium hover:bg-white/[0.045]" : "label gap-1.5 rounded-sm px-3",
                                )}
                            >
                                <ChevronDown className={cn("size-[18px] shrink-0 transition-transform duration-200", classic ? "stroke-[1.75]" : "stroke-[1.5]", !showRest && "-rotate-90")} />
                                <span className={cn("truncate", !classic && "nav-label")}>More</span>
                                {!showRest && restBadge > 0 && (
                                    <span className={cn("ml-auto px-1.5 text-fg/80 tabular-nums", classic ? "rounded-md bg-white/[0.08] text-[11px] leading-[18px]" : "border border-line-strong text-[10px] leading-4")}>
                                        {restBadge > 99 ? "99+" : restBadge}
                                    </span>
                                )}
                            </button>
                        )}
                        {showRest && rest.map(link)}
                    </div>
                )}
            </nav>

            <div className={cn("flex flex-col gap-0.5 border-t border-line pt-3", !wide && "items-center")}>
                {/* Themes, notifications and Settings: three icons in a row (one
                    under the other in the icons-only sidebar), named by tooltips.
                    The TV keeps its labelled rows. */}
                {tv ? (
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
                                        "focus-ring grid size-9 shrink-0 place-items-center transition-colors duration-200 [&>svg]:size-[18px]",
                                        classic ? "rounded-[10px] [&>svg]:stroke-[1.75]" : "rounded-sm [&>svg]:stroke-[1.5]",
                                        location.pathname.startsWith("/settings")
                                            ? classic
                                                ? "bg-white/[0.08] text-brand-strong"
                                                : "text-fg shadow-[inset_0_-1px_0_var(--text)]"
                                            : cn("text-muted hover:text-fg", classic && "hover:bg-white/[0.045]"),
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
                                "mt-1.5 data-[state=open]:bg-white/[0.07]",
                                classic ? "rounded-[10px]" : "rounded-sm",
                                wide ? (classic ? "h-12 bg-white/[0.03] px-2 hover:bg-white/[0.055]" : "h-12 px-2 hover:bg-white/[0.05]") : "size-10 justify-center hover:bg-white/[0.05]",
                            )}
                            aria-label="Account"
                        >
                            {status?.user?.avatar?.large ? (
                                <img src={img(status.user.avatar.large)} alt="" className={cn("size-8 shrink-0 rounded-full object-cover", classic && "ring-1 ring-white/10")} />
                            ) : (
                                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-muted", classic ? "bg-surface-3 ring-1 ring-white/10" : "border border-line-strong")}>
                                    <UserRound className="size-4" />
                                </span>
                            )}
                            {wide && (
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-medium">{status?.user ? status.user.name : "Not logged in"}</span>
                                    <span className="block truncate text-[11px] text-subtle" title={waiting ? `${waiting} change${waiting === 1 ? "" : "s"} waiting for AniList` : undefined}>
                                        {offline ? "Offline" : status?.user ? (waiting ? `${waiting} change${waiting === 1 ? "" : "s"} to sync` : "AniList") : "Log in to sync"}
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
                                {canOffline && (
                                    <DropdownItem icon={<WifiOff />} checked={offline} onSelect={toggleOffline}>
                                        Offline mode
                                    </DropdownItem>
                                )}
                                <DropdownSeparator />
                                <DropdownItem icon={<LogOut />} danger onSelect={logout}>
                                    Log out
                                </DropdownItem>
                            </>
                        ) : (
                            <>
                                <DropdownItem icon={<LogIn />} onSelect={() => setLoginOpen(true)}>
                                    Log in with AniList
                                </DropdownItem>
                                {canOffline && (
                                    <DropdownItem icon={<WifiOff />} checked={offline} onSelect={toggleOffline}>
                                        Offline mode
                                    </DropdownItem>
                                )}
                            </>
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
