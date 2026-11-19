import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Button, EmptyState, ErrorState, SectionHeader, Select, Tabs } from "@/components/ui"
import { api } from "@/lib/api"
import { useCollection } from "@/lib/queries"
import type { CollectionItem, EntryView, Media } from "@/lib/types"
import { cn, cover, entryUrl, plural, title } from "@/lib/utils"

// A year of your anime: what was watched in Nyakuro that year (the server's
// watch history: hours, episodes, the busiest day, the first and the last
// episode, the shows watched most), and from your list what was completed
// that year, its genres and your scores.

type Month = { month: string; episodes: number; minutes: number }
type Show = { mediaId: number; episodes: number; minutes: number }
type Watched = { mediaId: number; episode: number; at: number }
// GET /api/stats/year (the server's history.YearReview).
type YearReview = {
    year: number
    years: number[]
    episodes: number
    minutes: number
    days: number
    months: Month[]
    busiest: { date: string; episodes: number; minutes: number; mediaId: number } | null
    first: Watched | null
    last: Watched | null
    shows: Show[]
}

// How many anime that aren't on the list are looked up (one request each):
// the ones shown first. The rest are shown plainly.
const LOOKUPS = 6

export default function YearPage() {
    const [params, setParams] = useSearchParams()
    const now = new Date().getFullYear()
    const asked = Number(params.get("year"))
    const year = Number.isInteger(asked) && asked > 1900 && asked < 10000 ? asked : now
    // In place: Back leaves the page, it doesn't walk the years.
    const setYear = (y: number) => setParams(y === now ? {} : { year: String(y) }, { replace: true })

    const { data: coll, isLoading: collLoading } = useCollection()
    // The year before stays up while the next one loads.
    const review = useQuery({ queryKey: ["stats", "year", year], queryFn: () => api.get<YearReview>(`/api/stats/year?year=${year}`), placeholderData: keepPreviousData })
    const yr = review.data
    // What's drawn is the year the server answered for (the one before, for
    // the moment another loads): the list's part is of that year too.
    const shown = yr?.year ?? year

    const list = useMemo(() => {
        const byId = new Map<number, CollectionItem>()
        for (const it of [...(coll?.lists ?? []).flatMap(l => l.items), ...(coll?.localOnly ?? [])]) if (!byId.has(it.media.id)) byId.set(it.media.id, it)
        // The years anything was completed in: the picker's, with the history's.
        const years = new Set<number>()
        const completed: CollectionItem[] = []
        for (const it of byId.values()) {
            const y = it.listEntry?.completedAt?.year
            if (!y) continue
            years.add(y)
            if (y === shown) completed.push(it)
        }
        return { byId, years, completed }
    }, [coll, shown])

    // Anime to show that aren't on the list: asked for by id, the first few.
    const missing = useMemo(() => {
        if (!yr || !coll) return []
        const ids = [yr.first?.mediaId, yr.last?.mediaId, yr.busiest?.mediaId, ...yr.shows.slice(0, 10).map(s => s.mediaId)]
        return [...new Set(ids.filter((id): id is number => !!id && !list.byId.has(id)))].slice(0, LOOKUPS)
    }, [yr, coll, list])
    const looked = useQueries({
        queries: missing.map(id => ({ queryKey: ["entry", id], queryFn: () => api.get<EntryView>(`/api/anime/${id}`), staleTime: 30_000, retry: false })),
    })
    const media = (id: number): Media | undefined => list.byId.get(id)?.media ?? looked[missing.indexOf(id)]?.data?.media

    const facts = useMemo(() => {
        // The year's anime: watched in Nyakuro, or completed on the list.
        const ids = new Set<number>([...(yr?.shows ?? []).map(s => s.mediaId), ...list.completed.map(it => it.media.id)])
        const genres = new Map<string, number>()
        const scored: CollectionItem[] = []
        for (const id of ids) {
            const it = list.byId.get(id)
            if (!it) continue
            for (const g of it.media.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + 1)
            if ((it.listEntry?.score ?? 0) > 0) scored.push(it)
        }
        return {
            genres: [...genres.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6),
            scored: scored.sort((a, b) => b.listEntry!.score - a.listEntry!.score || title(a.media).localeCompare(title(b.media))).slice(0, 5),
        }
    }, [yr, list])

    const header = (picker?: React.ReactNode) => (
        <>
            <Link to="/stats" className="word label focus-ring mb-3 -ml-2.5 inline-flex h-7 items-center gap-1.5 px-2.5 text-muted transition-colors hover:text-fg">
                <ArrowLeft className="size-4" /> Stats
            </Link>
            <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <h1 className="text-[1.75rem] font-semibold tracking-tight">Year in review</h1>
                {picker}
            </div>
        </>
    )
    const page = "min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10"

    if (!yr || collLoading)
        return (
            <div className={page}>
                {header()}
                {review.error ? <ErrorState title="Couldn't load the year" error={review.error} onRetry={() => review.refetch()} retrying={review.isFetching} /> : <div className="card h-60 shimmer" />}
            </div>
        )

    // The years with something, the latest first; and the one open, and
    // this one, with or without.
    const withData = [...new Set([...yr.years, ...list.years])].sort((a, b) => b - a)
    const years = [...new Set([...withData, now, year])].sort((a, b) => b - a)
    const picker =
        years.length < 2 ? (
            <span className="label text-subtle tabular-nums">{year}</span>
        ) : years.length <= 6 ? (
            <Tabs value={String(year)} onChange={v => setYear(Number(v))} tabs={years.map(y => ({ value: String(y), label: String(y) }))} />
        ) : (
            <Select value={String(year)} onChange={v => setYear(Number(v))} options={years.map(y => ({ value: String(y), label: String(y) }))} className="w-24" />
        )

    const watched = yr.shows.length > 0
    if (!watched && list.completed.length === 0) {
        // The last year with something (the one open has nothing).
        const other = withData.find(y => y !== shown)
        return (
            <div className={page}>
                {header(picker)}
                <EmptyState
                    title={shown === now ? `Nothing in ${shown} yet` : `Nothing in ${shown}`}
                    action={
                        other && (
                            <Button variant="primary" onClick={() => setYear(other)}>
                                See {other}
                            </Button>
                        )
                    }
                >
                    {!other && "What you watch in Nyakuro and complete on your list shows here."}
                </EmptyState>
            </div>
        )
    }

    const same = yr.first && yr.last && yr.first.mediaId === yr.last.mediaId && yr.first.episode === yr.last.episode
    return (
        <div className={page}>
            {header(picker)}
            <div className="flex flex-col gap-12">
                <div>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {watched && <Tile label="Hours watched" value={hours(yr.minutes)} sub="In Nyakuro" />}
                        {watched && <Tile label="Episodes" value={yr.episodes.toLocaleString()} sub="Finished in Nyakuro" />}
                        {/* Only a list that keeps the dates can say (0 would be a guess). */}
                        {list.years.size > 0 && <Tile label="Anime completed" value={list.completed.length.toLocaleString()} sub="On your list" />}
                        {watched && <Tile label="Days watched" value={yr.days.toLocaleString()} sub="In Nyakuro" />}
                    </div>
                    {/* Why the hours aren't there: the year is the list's alone. */}
                    {!watched && <p className="mt-4 text-sm text-muted">Nothing watched in Nyakuro in {shown}.</p>}
                </div>

                {yr.minutes > 0 && <Months months={yr.months} />}

                {(facts.genres.length > 0 || yr.busiest) && (
                    <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
                        {facts.genres.length > 0 && <Genres genres={facts.genres} />}
                        {yr.busiest && (
                            <section className="min-w-0">
                                <SectionHeader title="Longest binge" action={<Note>Busiest day</Note>} />
                                <p className="font-display text-2xl font-semibold tracking-tight">{dayName(yr.busiest.date)}</p>
                                <p className="mt-1 text-sm text-muted tabular-nums">{[yr.busiest.episodes > 0 && plural(yr.busiest.episodes, "episode"), duration(yr.busiest.minutes)].filter(Boolean).join(" · ")}</p>
                                <div className="mt-4 border-t border-line">
                                    <ShowRow id={yr.busiest.mediaId} media={media(yr.busiest.mediaId)} sub="Watched most that day" />
                                </div>
                            </section>
                        )}
                    </div>
                )}

                {yr.first && yr.last && (
                    <section>
                        <SectionHeader title={same ? "First and last" : "First and last show"} action={<Note>In Nyakuro</Note>} />
                        <div className="grid gap-6 sm:grid-cols-2 sm:gap-10">
                            <Bookend label={same ? "First and last" : "First"} w={yr.first} media={media(yr.first.mediaId)} />
                            {!same && <Bookend label="Last" w={yr.last} media={media(yr.last.mediaId)} />}
                        </div>
                    </section>
                )}

                {(watched || facts.scored.length > 0) && (
                    <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
                        {watched && (
                            <section className="min-w-0">
                                <SectionHeader title="Most watched" action={<Note>In Nyakuro</Note>} className="mb-2" />
                                <ol className="divide-y divide-line">
                                    {yr.shows.slice(0, 10).map((s, i) => (
                                        <li key={s.mediaId}>
                                            <ShowRow rank={i + 1} id={s.mediaId} media={media(s.mediaId)} sub={s.episodes > 0 ? plural(s.episodes, "episode") : undefined} value={duration(s.minutes)} />
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        )}
                        {facts.scored.length > 0 && (
                            <section className="min-w-0">
                                <SectionHeader title="Highest scored" action={<Note>Your scores</Note>} className="mb-2" />
                                <ol className="divide-y divide-line">
                                    {facts.scored.map((it, i) => {
                                        const score = it.listEntry!.score
                                        return (
                                            <li key={it.media.id}>
                                                <ShowRow rank={i + 1} id={it.media.id} media={it.media} sub={completedOn(it, shown)} value={(score / 10).toFixed(score % 10 ? 1 : 0)} />
                                            </li>
                                        )
                                    })}
                                </ol>
                            </section>
                        )}
                    </div>
                )}

                {watched && <p className="text-xs text-subtle">An episode counts on the day it was last watched.</p>}
            </div>
        </div>
    )
}

// What a section counts, at the end of its title's line.
function Note({ children }: { children: React.ReactNode }) {
    return <span className="label mb-1 shrink-0 text-[10px] text-subtle">{children}</span>
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="card min-w-0 px-4 py-4 sm:px-5">
            <p className="truncate font-display text-3xl font-semibold tracking-tight sm:text-4xl">{value}</p>
            <p className="label mt-2 truncate text-muted">{label}</p>
            {sub && <p className="truncate text-xs text-subtle">{sub}</p>}
        </div>
    )
}

// The year's months: the hours watched in each, one bar a month. The
// tallest says its hours; each says its own under the pointer, where the
// keyboard (or a TV's remote) is, and when tapped.
function Months({ months }: { months: Month[] }) {
    const [on, setOn] = useState<number | null>(null)
    const max = Math.max(1, ...months.map(m => m.minutes))
    const peak = months.findIndex(m => m.minutes === max)
    return (
        <section>
            <SectionHeader title="Months" action={<Note>Hours in Nyakuro</Note>} />
            {peak >= 0 && (
                <p className="sr-only">
                    Most in {monthName(months[peak].month)}: {duration(months[peak].minutes)}.
                </p>
            )}
            {/* The room above the bars is the readout's, over the tallest. */}
            <div role="group" aria-label="Hours watched by month" className="flex h-48 border-b border-line-strong pt-14">
                {months.map((m, i) => {
                    const pct = (m.minutes / max) * 100
                    return (
                        <button
                            key={m.month}
                            type="button"
                            aria-label={`${monthName(m.month)}: ${duration(m.minutes)}, ${plural(m.episodes, "episode")}`}
                            className="relative flex min-w-0 flex-1 cursor-default items-end justify-center outline-none focus-visible:bg-white/[0.06]"
                            onPointerEnter={() => setOn(i)}
                            onPointerLeave={() => setOn(o => (o === i ? null : o))}
                            onFocus={() => setOn(i)}
                            onBlur={() => setOn(o => (o === i ? null : o))}
                            onClick={() => setOn(i)}
                        >
                            <span className={cn("block w-1/2 max-w-5 bg-brand transition-opacity", on !== null && on !== i && "opacity-50")} style={{ height: `${pct}%`, minHeight: m.minutes > 0 ? 2 : 0 }} />
                            {i === peak && on === null && (
                                <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-fg tabular-nums" style={{ bottom: `calc(${pct}% + 6px)` }}>
                                    {m.minutes < 60 ? `${m.minutes} min` : `${hours(m.minutes)} h`}
                                </span>
                            )}
                            {on === i && (
                                <span
                                    className={cn(
                                        "pointer-events-none absolute z-10 block border border-line-strong bg-bg px-3 py-2 text-left text-xs whitespace-nowrap",
                                        i < 2 ? "left-0" : i > months.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                                    )}
                                    style={{ bottom: `calc(${pct}% + 8px)` }}
                                >
                                    <span className="block text-sm font-semibold text-fg">{duration(m.minutes)}</span>
                                    <span className="block text-muted">
                                        {monthName(m.month)} · {plural(m.episodes, "episode")}
                                    </span>
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>
            <div aria-hidden className="mt-2 flex">
                {months.map((m, i) => (
                    <span key={m.month} className={cn("label min-w-0 flex-1 text-center text-[10px]", on === i ? "text-fg" : "text-subtle")}>
                        {monthName(m.month, "narrow")}
                    </span>
                ))}
            </div>
        </section>
    )
}

// The genres of the year's anime (watched in Nyakuro, or completed on the
// list): each anime once.
function Genres({ genres }: { genres: [string, number][] }) {
    const max = Math.max(1, ...genres.map(g => g[1]))
    return (
        <section className="min-w-0">
            <SectionHeader title="Top genres" action={<Note>Anime watched or completed</Note>} />
            <ul className="flex flex-col gap-3">
                {genres.map(([g, n]) => (
                    <li key={g} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 text-sm">
                        <span className="truncate text-muted">{g}</span>
                        <span className="flex items-center gap-2">
                            <span className="block h-2 bg-brand" style={{ width: `${(n / max) * 85}%` }} />
                            <span className="text-xs text-muted tabular-nums">{n}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    )
}

// A cover, small: the anime's, or an empty frame for one that isn't known
// (not on the list, and not looked up).
function Cover({ media, className }: { media?: Media; className?: string }) {
    const src = cover(media, "thumb")
    return (
        <span className={cn("on-dark relative block shrink-0 overflow-hidden rounded-sm bg-surface-2", className)} style={{ backgroundColor: media?.coverImage?.color || undefined }}>
            {src && <img src={src} alt="" loading="lazy" className="size-full object-cover" />}
            {/* A hairline, so dark covers don't melt into the page. */}
            <span className="pointer-events-none absolute inset-0 rounded-sm ring-1 ring-white/[0.07] ring-inset" />
        </span>
    )
}

const name = (id: number, media?: Media) => (media ? title(media) : `Anime ${id}`)

// An anime in a list: its place, cover and title, and a number at the end.
function ShowRow({ rank, id, media, sub, value }: { rank?: number; id: number; media?: Media; sub?: string; value?: string }) {
    return (
        <Link to={entryUrl(media ?? { id })} className="focus-ring flex items-center gap-3 py-2 transition-colors hover:bg-white/[0.05]">
            {rank !== undefined && <span className="w-5 shrink-0 text-right text-xs text-subtle tabular-nums">{rank}</span>}
            <Cover media={media} className="h-14 w-10" />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{name(id, media)}</span>
                {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
            </span>
            {value && <span className="shrink-0 pr-1 text-xs text-muted tabular-nums">{value}</span>}
        </Link>
    )
}

// The first or the last episode of the year, with its anime's cover.
function Bookend({ label, w, media }: { label: string; w: Watched; media?: Media }) {
    return (
        <Link to={entryUrl(media ?? { id: w.mediaId })} className="group focus-ring flex min-w-0 items-center gap-4">
            <Cover media={media} className="aspect-[2/3] w-24 sm:w-28" />
            <span className="min-w-0">
                <span className="label block text-subtle">{label}</span>
                <span className="mt-1.5 line-clamp-2 text-[17px] leading-snug font-medium text-fg/90 transition-colors group-hover:text-fg">{name(w.mediaId, media)}</span>
                <span className="mt-1 block text-sm text-muted">Episode {w.episode}</span>
                <span className="block text-sm text-subtle">{new Date(w.at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "long" })}</span>
            </span>
        </Link>
    )
}

// "Completed 14 Mar", for an anime completed in the year.
function completedOn(it: CollectionItem, year: number) {
    const d = it.listEntry?.completedAt
    if (!d?.year || d.year !== year) return undefined
    if (!d.month) return "Completed"
    return `Completed ${new Date(d.year, d.month - 1, d.day ?? 1).toLocaleDateString(undefined, d.day ? { day: "numeric", month: "short" } : { month: "long" })}`
}

// "2026-03" as its month's name (or its initial).
function monthName(m: string, form: "long" | "narrow" = "long") {
    const [y, mo] = m.split("-").map(Number)
    return new Date(y, mo - 1, 1).toLocaleString(undefined, { month: form })
}

// "2026-03-14" as "Saturday 14 March".
function dayName(date: string) {
    const [y, m, d] = date.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
}

// Minutes as hours: to a tenth under ten.
function hours(min: number) {
    const h = min / 60
    return h < 10 ? h.toFixed(1).replace(/\.0$/, "") : Math.round(h).toLocaleString()
}

function duration(min: number) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}
