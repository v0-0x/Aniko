import { CalendarDays } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { PluginSlot } from "@/components/plugins/PluginSlot"
import { Button, EmptyState, ErrorState, Skeleton, Tabs } from "@/components/ui"
import { useSchedule } from "@/lib/queries"
import type { ScheduleItem } from "@/lib/types"
import { cn, cover, formatLabel, LIST_STATUS, readLocal, timeUntil, title, writeLocal } from "@/lib/utils"

export default function SchedulePage() {
    const { data, isLoading, error, refetch, isFetching } = useSchedule(8)
    const [filter, setFilter] = useState<"mine" | "all">(() => (readLocal("aniko-schedule-filter") as "mine" | "all") || "mine")

    const days = useMemo(() => {
        const items = (data ?? []).filter(i => filter === "all" || i.listStatus)
        const map = new Map<string, ScheduleItem[]>()
        for (const it of items) {
            const d = new Date(it.airingAt * 1000)
            const key = d.toDateString()
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(it)
        }
        return [...map.entries()].map(([k, v]) => ({ date: new Date(k), items: v }))
    }, [data, filter])

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
                            <h2 className="mb-3 text-sm font-medium text-muted">
                                {isToday && <span className="text-brand-strong">Today · </span>}
                                {d.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                            </h2>
                            <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                                {d.items.map(it => {
                                    const aired = it.airingAt < now
                                    // What airs and where it stands in the list, on one line.
                                    const facts = [`Episode ${it.episode}${it.media.episodes ? ` / ${it.media.episodes}` : ""}`, formatLabel(it.media.format), it.listStatus && LIST_STATUS[it.listStatus]].filter(Boolean)
                                    return (
                                        <Link key={it.id} to={`/entry?id=${it.media.id}`} className={cn("card focus-ring flex items-center gap-4 p-3 transition hover:border-line-strong", aired && "opacity-60")}>
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
