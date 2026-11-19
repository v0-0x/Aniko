import { CalendarDays, Info } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ListCardMenu } from "@/components/ListCardMenu"
import { PluginSlot } from "@/components/plugins/PluginSlot"
import { Button, ContextArea, DropdownItem, DropdownSeparator, EmptyState, ErrorState, Skeleton, Tabs } from "@/components/ui"
import { useRawList, useSchedule } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import type { ListEntry, ScheduleItem } from "@/lib/types"
import { cn, cover, formatLabel, LIST_STATUS, readLocal, timeUntil, title, writeLocal } from "@/lib/utils"

export default function SchedulePage() {
    const classic = useClassic()
    const { data, isLoading, error, refetch, isFetching } = useSchedule(8)
    const [filter, setFilter] = useState<"mine" | "all">(() => (readLocal("aniko-schedule-filter") as "mine" | "all") || "mine")
    const navigate = useNavigate()
    // Your list's entries, for a row's menu (and so a change made from it
    // shows at once; the schedule's own listStatus is as old as the schedule).
    const { data: list } = useRawList("ANIME")
    const entries = useMemo(() => {
        const m = new Map<number, ListEntry>()
        for (const l of list?.lists ?? []) for (const e of l.entries) m.set(e.mediaId, e)
        return m
    }, [list])
    const statusOf = (i: ScheduleItem) => (list ? (entries.get(i.media.id)?.status ?? "") : i.listStatus)

    const days = useMemo(() => {
        const items = (data ?? []).filter(i => filter === "all" || statusOf(i))
        const map = new Map<string, ScheduleItem[]>()
        for (const it of items) {
            const d = new Date(it.airingAt * 1000)
            const key = d.toDateString()
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(it)
        }
        return [...map.entries()].map(([k, v]) => ({ date: new Date(k), items: v }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, filter, list, entries])

    const today = new Date().toDateString()
    const now = Date.now() / 1000

    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <PluginSlot slot="schedule-screen-top" className="mb-8" />
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-[1.75rem] font-semibold tracking-tight">Schedule</h1>
                <Tabs
                    value={filter}
                    onChange={v => {
                        setFilter(v)
                        writeLocal("aniko-schedule-filter", v)
                    }}
                    tabs={[
                        { value: "mine", label: "My list" },
                        { value: "all", label: "All" },
                    ]}
                />
            </div>
            {isLoading && (
                <div className="flex flex-col gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-20" />
                    ))}
                </div>
            )}
            {error && !data && <ErrorState title="Couldn't load the schedule" error={error} retrying={isFetching} onRetry={() => refetch()} />}
            {data && days.length === 0 && (
                <EmptyState
                    icon={<CalendarDays className="size-6" />}
                    title="Nothing scheduled"
                    action={
                        filter === "mine" && (
                            <Button
                                onClick={() => {
                                    setFilter("all")
                                    writeLocal("aniko-schedule-filter", "all")
                                }}
                            >
                                Show all
                            </Button>
                        )
                    }
                >
                    {filter === "mine" ? "Nothing from your list airs this week." : "No episodes found."}
                </EmptyState>
            )}
            <div className="flex flex-col gap-8">
                {days.map(d => {
                    const isToday = d.date.toDateString() === today
                    return (
                        <section key={d.date.toISOString()}>
                            <h2 className={cn("text-sm font-medium text-muted", classic ? "mb-3" : "mb-1")}>
                                {/* This look: a small capital label (in a span: a heading has its own face). */}
                                <span className={classic ? undefined : "label"}>
                                    {isToday && <span className={classic ? "text-brand-strong" : "text-fg"}>Today · </span>}
                                    {d.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                                </span>
                            </h2>
                            {/* This look: rows on hairlines, not a box each. */}
                            <div className={cn("grid md:grid-cols-2 2xl:grid-cols-3", classic ? "gap-2" : "grid-cols-1 gap-x-8 border-t border-line")}>
                                {d.items.map(it => {
                                    const aired = it.airingAt < now
                                    // What airs and where it stands in the list, on one line.
                                    const facts = [`Episode ${it.episode}${it.media.episodes ? ` / ${it.media.episodes}` : ""}`, formatLabel(it.media.format), statusOf(it) && LIST_STATUS[statusOf(it)]].filter(Boolean)
                                    const entry = entries.get(it.media.id)
                                    // A right-click on the row: its page, and the list menu a card has. That one needs the
                                    // entry itself (its progress and score, to undo a change): not while it's unknown.
                                    const menu = (
                                        <>
                                            <DropdownItem icon={<Info />} onSelect={() => navigate(`/entry?id=${it.media.id}`)}>
                                                Anime page
                                            </DropdownItem>
                                            {list && (entry || !it.listStatus) && (
                                                <>
                                                    <DropdownSeparator />
                                                    <ListCardMenu media={{ ...it.media, mediaListEntry: entry ? { id: entry.id, status: entry.status, progress: entry.progress, score: entry.score, repeat: entry.repeat } : null }} />
                                                </>
                                            )}
                                        </>
                                    )
                                    return (
                                        <ContextArea key={it.id} menu={menu}>
                                        <Link to={`/entry?id=${it.media.id}`} className={cn("focus-ring flex items-center gap-4 transition", classic ? "card p-3 hover:border-line-strong" : "border-b border-line py-3 hover:border-fg/45", aired && "opacity-60")}>
                                            <img src={cover(it.media, "thumb")} alt="" loading="lazy" className="h-16 w-11 shrink-0 rounded-lg object-cover" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-medium">{title(it.media)}</p>
                                                <p className="mt-0.5 truncate text-sm text-muted">{facts.join(" · ")}</p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="font-medium tabular-nums">{new Date(it.airingAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                                                <p className="mt-0.5 text-xs text-subtle">{aired ? "Aired" : `in ${timeUntil(it.airingAt - now)}`}</p>
                                            </div>
                                        </Link>
                                        </ContextArea>
                                    )
                                })}
                            </div>
                        </section>
                    )
                })}
            </div>
            <PluginSlot slot="schedule-screen-bottom" className="mt-8" />
        </div>
    )
}
