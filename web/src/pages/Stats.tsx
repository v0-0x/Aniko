import { useQuery } from "@tanstack/react-query"
import { ChartColumn, Table } from "lucide-react"
import { useMemo, useState } from "react"
import { Button, EmptyState } from "@/components/ui"
import { api } from "@/lib/api"
import { useCollection } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import type { CollectionItem } from "@/lib/types"
import { cn } from "@/lib/utils"

// Your anime in numbers: from your list (AniList's, or Aniko's own), and
// what you watched in Aniko month by month.

type Month = { month: string; episodes: number; minutes: number }

// The list's statuses in a fixed order, each with its categorical color (the
// order is what keeps neighbors apart for colorblind readers; a color stays
// with its status when others are missing). Dark steps, validated on the
// card surface.
const STATUSES: { status: string; label: string; color: string }[] = [
    { status: "CURRENT", label: "Watching", color: "#3987e5" },
    { status: "COMPLETED", label: "Completed", color: "#d95926" },
    { status: "PAUSED", label: "Paused", color: "#199e70" },
    { status: "DROPPED", label: "Dropped", color: "#c98500" },
    { status: "PLANNING", label: "Planning", color: "#d55181" },
    { status: "REPEATING", label: "Rewatching", color: "#008300" },
]

export default function StatsPage() {
    const { data: coll, isLoading } = useCollection()
    const { data: months } = useQuery({ queryKey: ["stats", "monthly"], queryFn: () => api.get<Month[]>("/api/stats/monthly?months=12") })

    const stats = useMemo(() => {
        const items: { it: CollectionItem; status: string }[] = (coll?.lists ?? []).flatMap(l => l.items.map(it => ({ it, status: l.status })))
        let anime = 0
        let episodes = 0
        let minutes = 0
        let completed = 0
        const genres = new Map<string, number>()
        const byStatus = new Map<string, number>()
        for (const { it, status } of items) {
            byStatus.set(status, (byStatus.get(status) ?? 0) + 1)
            if (status === "PLANNING") continue
            anime++
            if (status === "COMPLETED") completed++
            const e = it.listEntry
            const watched = (e?.progress ?? 0) + (e?.repeat ?? 0) * (it.media.episodes ?? e?.progress ?? 0)
            episodes += watched
            minutes += watched * (it.media.duration ?? 24)
            for (const g of it.media.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + 1)
        }
        const topGenres = [...genres.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8)
        return { anime, episodes, minutes, completed, topGenres, byStatus }
    }, [coll])

    // Every chart as its table, from the one button in the header.
    const [asTable, setAsTable] = useState(false)

    if (isLoading) return <div className="m-10 card h-60 shimmer" />
    if (!coll) return <EmptyState title="Couldn't load your list" />

    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div className="mb-8 flex items-center justify-between gap-4">
                <h1 className="text-[1.75rem] font-semibold tracking-tight">Stats</h1>
                <Button aria-pressed={asTable} icon={asTable ? <ChartColumn className="size-4" /> : <Table className="size-4" />} onClick={() => setAsTable(t => !t)}>
                    {asTable ? "Charts" : "Tables"}
                </Button>
            </div>
            <div className="flex flex-col gap-10">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatTile label="Anime" value={stats.anime.toLocaleString()} sub="Not planned" />
                    <StatTile label="Completed" value={stats.completed.toLocaleString()} />
                    <StatTile label="Episodes" value={compact(stats.episodes)} sub="With rewatches" />
                    {/* In days and hours, and (from a day on) all in hours. */}
                    <StatTile label="Time watched" value={duration(stats.minutes)} sub={stats.minutes >= 24 * 60 ? `${Math.round(stats.minutes / 60).toLocaleString()} hours` : undefined} />
                </div>
                <MonthlyChart months={months ?? []} asTable={asTable} />
                <div className="grid gap-10 lg:grid-cols-2">
                    <GenreBars genres={stats.topGenres} asTable={asTable} />
                    <StatusBar counts={stats.byStatus} asTable={asTable} />
                </div>
            </div>
        </div>
    )
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
    const classic = useClassic()
    return (
        <div className="card min-w-0 px-4 py-4 sm:px-5">
            <p className={cn("truncate text-3xl font-semibold tracking-tight sm:text-4xl", classic ? "tabular-nums" : "font-display")}>{value}</p>
            <p className={cn("truncate text-muted", classic ? "mt-1 text-sm" : "label mt-2")}>{label}</p>
            {sub && <p className="truncate text-xs text-subtle">{sub}</p>}
        </div>
    )
}

// A chart's frame: a plain heading with what it counts beside it, then the
// chart (or its table) on the page itself.
function ChartSection({ title, note, asTable, table, children }: { title: string; note?: string; asTable: boolean; table: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="min-w-0">
            <h2 className="mb-4 text-xl font-semibold tracking-tight">
                {title}
                {note && <span className="ml-2 text-sm font-normal tracking-normal text-subtle">{note}</span>}
            </h2>
            {asTable ? table : children}
        </section>
    )
}

// Episodes finished in Aniko, month by month: one series, in the accent.
function MonthlyChart({ months, asTable }: { months: Month[]; asTable: boolean }) {
    const classic = useClassic()
    const [hover, setHover] = useState<number | null>(null)
    const max = Math.max(0, ...months.map(m => m.episodes))
    const ticks = niceTicks(max)
    const top = ticks[ticks.length - 1] || 1
    // No bar to draw (minutes of episodes not finished don't make one).
    const empty = months.every(m => m.episodes === 0)
    const table = (
        <table className="w-full text-sm">
            <thead className={cn("text-left text-subtle", classic ? "text-xs" : "label text-[10px]")}>
                <tr>
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 text-right font-medium">Episodes</th>
                    <th className="pb-2 text-right font-medium">Time watched</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-line">
                {months.map(m => (
                    <tr key={m.month}>
                        <td className="py-1.5">{monthName(m.month, true)}</td>
                        <td className="py-1.5 text-right tabular-nums">{m.episodes}</td>
                        <td className="py-1.5 text-right text-muted tabular-nums">{hoursMinutes(m.minutes)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
    return (
        <ChartSection title="Watched in Aniko" note="Episodes, last 12 months" asTable={asTable} table={table}>
            {empty ? (
                <p className="py-10 text-sm text-muted">Nothing watched yet.</p>
            ) : (
                // Headroom above the plot: the hover readout over the tallest
                // month stays clear of the title.
                <div className="mt-14 flex gap-2 sm:gap-3">
                    {/* y axis: clean ticks, tabular so they line up */}
                    <div className={cn("relative h-48 w-6 shrink-0 sm:w-8 text-right text-[11px] text-subtle", classic ? "tabular-nums" : "font-mono")}>
                        {ticks.map(t => (
                            // This look: on its line.
                            <span key={t} className={cn("absolute right-0", classic ? "-translate-y-1/2" : "translate-y-1/2")} style={{ bottom: `${(t / top) * 100}%` }}>
                                {t}
                            </span>
                        ))}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="relative h-48">
                            {/* hairline gridlines, recessive */}
                            {ticks.map(t => (
                                <div key={t} className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-white/20" : "bg-white/[0.06]")} style={{ bottom: `${(t / top) * 100}%` }} />
                            ))}
                            <div className="absolute inset-0 flex">
                                {months.map((m, i) => (
                                    <div
                                        key={m.month}
                                        tabIndex={0}
                                        aria-label={`${monthName(m.month, true)}: ${m.episodes} episodes, ${hoursMinutes(m.minutes)}`}
                                        className="group relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center rounded-t-md outline-none focus-visible:bg-white/[0.06]"
                                        onPointerEnter={() => setHover(i)}
                                        onPointerLeave={() => setHover(h => (h === i ? null : h))}
                                        onFocus={() => setHover(i)}
                                        onBlur={() => setHover(h => (h === i ? null : h))}
                                    >
                                        <div
                                            className={cn("w-full max-w-6 bg-brand transition-opacity", classic && "rounded-t-[4px]", hover !== null && hover !== i && "opacity-60")}
                                            style={{ height: `${(m.episodes / top) * 100}%` }}
                                        />
                                        {hover === i && (
                                            <div
                                                className={cn(
                                                    "pointer-events-none absolute z-10 px-3 py-2 text-xs whitespace-nowrap",
                                                    classic ? "rounded-lg bg-surface-3 shadow-xl ring-1 ring-white/10" : "border border-line-strong bg-bg",
                                                    i < 2 ? "left-0" : i > months.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                                                )}
                                                style={{ bottom: `calc(${(m.episodes / top) * 100}% + 8px)` }}
                                            >
                                                <p className="text-sm font-semibold text-fg">{m.episodes} episodes</p>
                                                <p className="text-muted">
                                                    {monthName(m.month, true)} · {hoursMinutes(m.minutes)}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="mt-2 flex text-[11px] text-subtle">
                            {months.map((m, i) => (
                                <span key={m.month} className={cn("min-w-0 flex-1 text-center whitespace-nowrap", i % 2 === 1 && "max-sm:invisible")}>
                                    {monthName(m.month, i === 0 || m.month.endsWith("-01"))}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </ChartSection>
    )
}

// The genres of the anime on the list (not planned): one series, bars with
// their count at the tip.
function GenreBars({ genres, asTable }: { genres: [string, number][]; asTable: boolean }) {
    const classic = useClassic()
    const max = Math.max(1, ...genres.map(g => g[1]))
    const table = (
        <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
                {genres.map(([g, n]) => (
                    <tr key={g}>
                        <td className="py-1.5">{g}</td>
                        <td className="py-1.5 text-right tabular-nums">{n}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
    return (
        <ChartSection title="Top genres" asTable={asTable} table={table}>
            {genres.length === 0 ? (
                <p className="py-10 text-sm text-muted">No anime yet.</p>
            ) : (
                <div className="flex flex-col gap-2.5">
                    {genres.map(([g, n]) => (
                        <div key={g} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 text-sm" title={`${g}: ${n} anime`}>
                            <span className="truncate text-muted">{g}</span>
                            <div className="flex items-center gap-2">
                                <div className={cn("h-4 bg-brand", classic && "rounded-r-[4px]")} style={{ width: `${(n / max) * 85}%` }} />
                                <span className="text-xs text-muted tabular-nums">{n}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </ChartSection>
    )
}

// The list by status: one bar of its parts, with a legend (and the counts in
// it, so identity never rests on color alone).
function StatusBar({ counts, asTable }: { counts: Map<string, number>; asTable: boolean }) {
    const classic = useClassic()
    const parts = STATUSES.filter(s => (counts.get(s.status) ?? 0) > 0).map(s => ({ ...s, n: counts.get(s.status)! }))
    const total = parts.reduce((s, p) => s + p.n, 0)
    const [hover, setHover] = useState<string | null>(null)
    const table = (
        <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
                {parts.map(p => (
                    <tr key={p.status}>
                        <td className="py-1.5">{p.label}</td>
                        <td className="py-1.5 text-right tabular-nums">{p.n}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
    return (
        <ChartSection title="Your list" note={`${total.toLocaleString()} anime`} asTable={asTable} table={table}>
            {total === 0 ? (
                <p className="py-10 text-sm text-muted">No anime yet.</p>
            ) : (
                <div className="flex flex-col gap-5">
                    <div className="flex h-6 gap-[2px]">
                        {parts.map((p, i) => (
                            <div
                                key={p.status}
                                tabIndex={0}
                                aria-label={`${p.label}: ${p.n}`}
                                className={cn("outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-white/70", classic && i === 0 && "rounded-l-[4px]", classic && i === parts.length - 1 && "rounded-r-[4px]", hover && hover !== p.status && "opacity-50")}
                                style={{ flexGrow: p.n, flexBasis: 0, minWidth: 3, background: p.color }}
                                onPointerEnter={() => setHover(p.status)}
                                onPointerLeave={() => setHover(null)}
                                onFocus={() => setHover(p.status)}
                                onBlur={() => setHover(null)}
                            />
                        ))}
                    </div>
                    <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                        {parts.map(p => (
                            <li key={p.status} className={cn("flex items-center gap-2 transition-opacity", hover && hover !== p.status && "opacity-50")}>
                                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: p.color }} />
                                <span className="text-muted">{p.label}</span>
                                <span className="ml-auto font-medium tabular-nums">{p.n}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </ChartSection>
    )
}

// Clean ticks from 0 up to at least max: 0, then steps of 1, 2, 5, 10, 20…
function niceTicks(max: number): number[] {
    if (max <= 0) return [0, 1]
    const raw = max / 3
    const mag = 10 ** Math.floor(Math.log10(raw))
    const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) ?? 10 * mag
    const whole = Math.max(1, Math.round(step))
    const out: number[] = []
    for (let t = 0; ; t += whole) {
        out.push(t)
        if (t >= max) return out
    }
}

function monthName(m: string, withYear: boolean) {
    const [y, mo] = m.split("-").map(Number)
    const name = new Date(y, mo - 1, 1).toLocaleString(undefined, { month: "short" })
    return withYear ? `${name} ${y}` : name
}

function hoursMinutes(min: number) {
    const h = Math.floor(min / 60)
    return h ? `${h} h ${min % 60} min` : `${min} min`
}

function compact(n: number) {
    return n >= 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : n.toLocaleString()
}

function duration(min: number) {
    const days = min / 60 / 24
    return days >= 1 ? `${days.toFixed(days >= 10 ? 0 : 1)} days` : `${Math.round(min / 60)} hours`
}
