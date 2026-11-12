import { Compass, Ellipsis, HardDrive, Home, Palette, Search, Settings as SettingsIcon, UserRound } from "lucide-react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { useStatus } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import { cn } from "@/lib/utils"
import { useNavGroups } from "./Sidebar"
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "./ui"

// The tabs along the bottom.
const TABS = [
    { to: "/", label: "Home", icon: <Home />, match: (p: string) => p === "/" },
    { to: "/search", label: "Search", icon: <Search /> },
    { to: "/discover", label: "Discover", icon: <Compass /> },
    { to: "/local", label: "Library", icon: <HardDrive /> },
]

// A phone's navigation (narrow windows, not a TV): the sidebar is a bar of
// tabs along the bottom, the main pages in it and the rest under More.
export function PhoneNav() {
    const location = useLocation()
    const navigate = useNavigate()
    const { data: status } = useStatus()
    const groups = useNavGroups()
    const inTabs = (p: string) => TABS.some(t => (t.match ? t.match(p) : p.startsWith(t.to)))
    // The rest of the pages, for More: and a dot on it while one has a count.
    const rest = groups.flatMap(g => g.items).filter(it => !TABS.some(t => t.to === it.to))
    const counted = rest.some(it => (it.badge ?? 0) > 0)
    const onMore = !inTabs(location.pathname)
    const classic = useClassic()
    // This look: small capitals, and a short line over the open page's tab.
    const tab = cn(
        "focus-ring relative flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-lg font-medium transition-colors [&_svg]:size-[21px]",
        classic ? "text-[10.5px] [&_svg]:stroke-[1.75]" : "label text-[9px] tracking-[0.06em] [&_svg]:stroke-[1.5]",
    )
    const mark = (active: boolean) => !classic && <span aria-hidden className={cn("absolute top-0 left-1/2 h-px w-6 -translate-x-1/2 bg-fg transition-transform duration-300 ease-out", active ? "scale-x-100" : "scale-x-0")} />
    return (
        <nav aria-label="Pages" className={cn("relative z-40 flex shrink-0 items-stretch gap-1 border-t bg-frame px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))]", classic ? "border-line pt-1.5" : "border-line-strong pt-1.5")} style={{ height: "calc(3.75rem + env(safe-area-inset-bottom))" }}>
            {TABS.map(t => {
                const active = t.match ? t.match(location.pathname) : location.pathname.startsWith(t.to)
                return (
                    <NavLink key={t.to} to={t.to} className={cn(tab, active ? "text-fg [&_svg]:text-brand-strong" : classic ? "text-subtle" : "text-muted")}>
                        {mark(active)}
                        {t.icon}
                        {t.label}
                    </NavLink>
                )
            })}
            <Dropdown>
                <DropdownTrigger asChild>
                    <button className={cn(tab, onMore ? "text-fg [&_svg]:text-brand-strong" : classic ? "text-subtle" : "text-muted", "data-[state=open]:text-fg")}>
                        {mark(onMore)}
                        <Ellipsis />
                        More
                        {counted && <span className="absolute top-1.5 left-1/2 ml-2.5 size-2 rounded-full bg-brand" />}
                    </button>
                </DropdownTrigger>
                <DropdownContent side="top" align="end" className="max-h-[min(560px,var(--radix-dropdown-menu-content-available-height))] w-60 overflow-y-auto">
                    {rest.map(it => {
                        const active = it.match ? it.match(location.pathname) : location.pathname.startsWith(it.to)
                        return (
                            <DropdownItem key={it.to} icon={it.icon} onSelect={() => navigate(it.to)} className={cn("h-9", active && "bg-white/[0.06]")}>
                                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                                {(it.badge ?? 0) > 0 && <span className="rounded-md bg-white/[0.08] px-1.5 text-[11px] leading-[18px] text-fg/80 tabular-nums">{it.badge! > 99 ? "99+" : it.badge}</span>}
                            </DropdownItem>
                        )
                    })}
                    <DropdownSeparator />
                    <DropdownItem icon={<Palette />} onSelect={() => navigate("/settings?tab=appearance")} className="h-9">
                        Themes
                    </DropdownItem>
                    <DropdownItem icon={<SettingsIcon />} onSelect={() => navigate("/settings")} className="h-9">
                        Settings
                    </DropdownItem>
                    <DropdownItem icon={<UserRound />} onSelect={() => navigate(status?.user ? "/profile" : "/settings?tab=account")} className={cn("h-9", location.pathname === "/profile" && "bg-white/[0.06]")}>
                        <span className="min-w-0 flex-1 truncate">{status?.user ? status.user.name : "Log in"}</span>
                    </DropdownItem>
                </DropdownContent>
            </Dropdown>
        </nav>
    )
}
