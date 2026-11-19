import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Bell, CloudOff, Download, FolderSearch, RefreshCw, Rss } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Button, IconButton, Popover, Tabs } from "@/components/ui"
import { api } from "@/lib/api"
import { tv } from "@/lib/tv"
import { cn, img } from "@/lib/utils"

// Home's bell: what's new of the anime and manga on your lists (Shows), and
// what Nyakuro did or needs (System). The server puts both together and keeps
// what was seen, so every device agrees (GET /api/notifications). Not the
// sidebar's bell, which mutes the toasts.

type Category = "shows" | "system"

type Item = {
    id: string
    kind: string
    title: string
    text: string
    at: number // unix seconds
    cover?: string
    to?: string
}

type Notifications = { shows: Item[]; system: Item[]; seen: Record<Category, number> }

const KEY = ["notifications"]

// Asked again every few minutes, and when the panel opens.
function useNotifications() {
    return useQuery({
        queryKey: KEY,
        queryFn: () => api.get<Notifications>("/api/notifications"),
        refetchInterval: 3 * 60_000,
        staleTime: 30_000,
        retry: false,
    })
}

const newIn = (d: Notifications | undefined, c: Category) => (d ? d[c].filter(i => i.at > (d.seen[c] ?? 0)).length : 0)

// How long ago, short: now, 5m, 2h, 3d, 4w.
function ago(at: number, now: number) {
    const s = Math.max(0, now - at)
    if (s < 60) return "now"
    if (s < 3600) return `${Math.floor(s / 60)}m`
    if (s < 86400) return `${Math.floor(s / 3600)}h`
    if (s < 14 * 86400) return `${Math.floor(s / 86400)}d`
    return `${Math.floor(s / (7 * 86400))}w`
}

// A System row without a cover: what it's about, where the cover would be.
const ICONS: Record<string, React.ReactNode> = {
    downloaded: <Download />,
    "download-failed": <AlertTriangle />,
    scan: <FolderSearch />,
    "scan-failed": <AlertTriangle />,
    "auto-download": <Rss />,
    update: <RefreshCw />,
    "anilist-waiting": <CloudOff />,
    error: <AlertTriangle />,
    warning: <AlertTriangle />,
}

export function NotificationsButton() {
    const qc = useQueryClient()
    const { data, isLoading, isError, isFetching, refetch } = useNotifications()
    const [open, setOpen] = useState(false)
    const [tab, setTab] = useState<Category>("shows")
    // What each list had seen when it was opened: its new ones stay marked
    // while the panel is open, though the count goes at once.
    const [marks, setMarks] = useState<Partial<Record<Category, number>>>({})

    const counts = { shows: newIn(data, "shows"), system: newIn(data, "system") }
    const count = counts.shows + counts.system

    const onOpen = (v: boolean) => {
        setOpen(v)
        if (!v) return
        setMarks({})
        // On the list with something new (Shows first), else where it was.
        if (counts.shows > 0) setTab("shows")
        else if (counts.system > 0) setTab("system")
        refetch()
    }

    // The list shown is seen, up to its newest: said to the server, which
    // keeps it for every device. Once the list asked for on opening is in:
    // an answer from before would bring the count back, and say it twice.
    useEffect(() => {
        if (!open || !data || isFetching || newIn(data, tab) === 0) return
        const at = Math.max(...data[tab].map(i => i.at))
        const was = data.seen[tab] ?? 0
        setMarks(m => (m[tab] === undefined ? { ...m, [tab]: was } : m))
        qc.setQueryData<Notifications>(KEY, old => (old ? { ...old, seen: { ...old.seen, [tab]: Math.max(old.seen[tab] ?? 0, at) } } : old))
        api.post("/api/notifications/seen", { category: tab, at }).catch(() => {})
    }, [open, tab, data, isFetching, qc])

    const clear = async () => {
        qc.setQueryData<Notifications>(KEY, old => (old ? { ...old, system: [] } : old))
        await api.del("/api/notifications/system").catch(() => {})
        qc.invalidateQueries({ queryKey: KEY })
    }

    const items = data?.[tab] ?? []
    const mark = marks[tab]
    const now = Date.now() / 1000

    return (
        // As Home's toolbar across the banner from it: the same box, the same size.
        <div className="glass flex items-center gap-0.5 rounded-lg p-1 [&_button]:text-white/80 [&_button:hover]:bg-white/10 [&_button:hover]:text-white [&_button[data-state=open]]:bg-white/10">
            <Popover
                open={open}
                onOpenChange={onOpen}
                side="bottom"
                align="start"
                // Under the box, from its edge (the button stands a little inside it).
                className="-ml-1 flex max-h-[70vh] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0"
                trigger={
                    <IconButton label="Notifications" aria-label={count > 0 ? `Notifications, ${count} new` : "Notifications"} size="sm" className="relative">
                        <Bell className="size-4" />
                        {count > 0 && (
                            <span className="pointer-events-none absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center bg-brand px-1 text-[10px] leading-none font-semibold text-[color:var(--on-brand)] tabular-nums">
                                {count > 9 ? "9+" : count}
                            </span>
                        )}
                    </IconButton>
                }
            >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-2 py-1.5">
                    <Tabs
                        value={tab}
                        onChange={setTab}
                        tabs={[
                            { value: "shows", label: "Shows", count: counts.shows || undefined },
                            { value: "system", label: "System", count: counts.system || undefined },
                        ]}
                    />
                    {tab === "system" && items.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={clear}>
                            Clear
                        </Button>
                    )}
                </div>
                {items.length === 0 ? (
                    <p className="px-4 py-6 text-[13px] text-muted">{isLoading ? "Loading" : isError && !data ? "Notifications couldn't be loaded" : "Nothing new"}</p>
                ) : (
                    <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
                        {items.map(it => {
                            const row = (
                                <>
                                    {/* A cover's place: the cover, else what it's about. */}
                                    <span className="grid h-12 w-[34px] shrink-0 place-items-center overflow-hidden bg-surface-2 text-subtle [&_svg]:size-4">
                                        {it.cover ? <img src={img(it.cover)} alt="" loading="lazy" className="size-full object-cover" /> : ICONS[it.kind]}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13px] font-medium text-fg">{it.title}</span>
                                        <span className="mt-0.5 line-clamp-2 text-xs text-muted" title={it.text}>
                                            {it.text}
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                                        {mark !== undefined && it.at > mark && <span className="size-1.5 bg-brand" aria-label="New" />}
                                        <time dateTime={new Date(it.at * 1000).toISOString()} title={new Date(it.at * 1000).toLocaleString()} className="label text-[10px] text-subtle normal-case tabular-nums">
                                            {ago(it.at, now)}
                                        </time>
                                    </span>
                                </>
                            )
                            // The keyboard's place is drawn inside the row (the list cuts off
                            // what's around it); a TV's is drawn around, so its rows stand in a little.
                            const cls = cn("flex items-start gap-3 px-3 py-2.5", tv && "m-1")
                            return (
                                <li key={it.id}>
                                    {it.to ? (
                                        <Link to={it.to} onClick={() => setOpen(false)} className={cn(cls, "outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2", !tv && "focus-visible:shadow-[inset_0_0_0_1px_var(--text)]")}>
                                            {row}
                                        </Link>
                                    ) : (
                                        <div className={cls}>{row}</div>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </Popover>
        </div>
    )
}
