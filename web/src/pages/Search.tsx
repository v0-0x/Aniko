import { Bookmark, BookmarkCheck, Search as SearchIcon, SlidersHorizontal, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ListCardMenu } from "@/components/ListCardMenu"
import { MediaCard, MediaCardSkeleton, MediaGrid } from "@/components/MediaCard"
import { ActiveFilters, FILTER_KEYS, filterCount, filtersQuery, formatsFor, SearchFilters } from "@/components/SearchFilters"
import { Button, EmptyState, ErrorState, IconButton, Input, Select } from "@/components/ui"
import { useSearch } from "@/lib/queries"
import { searchKey, searchLabel, useSearches } from "@/lib/searches"
import type { Media } from "@/lib/types"
import { useClassic } from "@/lib/themes"
import { cn, SEASONS } from "@/lib/utils"

const SORTS = [
    { value: "", label: "Best match / trending" },
    { value: "POPULARITY_DESC", label: "Popularity" },
    { value: "SCORE_DESC", label: "Score" },
    { value: "TRENDING_DESC", label: "Trending" },
    { value: "START_DATE_DESC", label: "Newest" },
    { value: "FAVOURITES_DESC", label: "Favourites" },
    { value: "TITLE_ROMAJI", label: "Title" },
]
// Cleared together: the panel's filters, and the season and year beside it.
const FILTERS = [...FILTER_KEYS, "season", "year"]

export default function SearchPage() {
    const classic = useClassic()
    const [params, setParams] = useSearchParams()
    const q = params.get("q") ?? ""
    const [text, setText] = useState(q)
    const type = (params.get("type") as "ANIME" | "MANGA") || "ANIME"
    const season = params.get("season") ?? ""
    const year = params.get("year") ?? ""
    const sort = params.get("sort") ?? ""
    const get = (k: string) => params.get(k) ?? ""
    const getAll = (k: string) => params.getAll(k)
    // The filters' panel: open from the start when the address has some.
    const [open, setOpen] = useState(() => filterCount(new URLSearchParams(window.location.search)) > 0)
    const [page, setPage] = useState(1)
    const [acc, setAcc] = useState<Media[]>([])

    // setParams hands its updater the params of the render it came from, which
    // are out of date in the debounced update below (or after two quick
    // clicks): always build on the URL as it is now.
    const update = (change: (p: URLSearchParams) => void) =>
        setParams(
            () => {
                const p = new URLSearchParams(window.location.search)
                change(p)
                return p
            },
            { replace: true },
        )
    const set = (k: string, v: string | string[] | null) =>
        update(p => {
            p.delete(k)
            if (Array.isArray(v)) v.forEach(x => p.append(k, x))
            else if (v) p.set(k, v)
        })

    // The box writes q to the URL after a pause in typing and follows q when
    // it changes from outside (Back/Forward, quick search). synced is the
    // last q written or seen, so our own writes don't reset what is typed.
    const synced = useRef(q)
    useEffect(() => {
        if (q === synced.current) return
        synced.current = q
        setText(q)
    }, [q])
    useEffect(() => {
        const t = setTimeout(() => {
            const next = text.trim()
            if (next === synced.current) return
            synced.current = next
            set("q", next || null)
        }, 350)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text])

    const query = useMemo(
        () => ({
            search: params.get("q") ?? undefined,
            type,
            season: season || undefined,
            year: year ? Number(year) : undefined,
            sort: sort ? [sort] : undefined,
            perPage: 36,
            // A format of the other type (an old link) isn't sent.
            ...filtersQuery(get, getAll, type),
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [params.toString()],
    )
    useEffect(() => {
        setPage(1)
        setAcc([])
    }, [query])
    const { data, isFetching, error, refetch } = useSearch({ ...query, page })
    useEffect(() => {
        if (!data?.media) return
        setAcc(prev => (page === 1 ? data.media! : [...prev, ...data.media!.filter(m => !prev.some(p => p.id === m.id))]))
    }, [data, page])

    // Kept searches: the saved ones and the last ones made (lib/searches).
    const kept = useSearches()
    const key = searchKey(params)
    // Something is looked for: a title, or a filter (anime or manga alone, or a sort, isn't).
    const searching = q.trim().length >= 2 || filterCount(params) > 0 || !!season || !!year
    const saved = kept.saved.some(s => s.query === key)
    // A search stays a moment before it counts as made (not each letter typed).
    const addRecent = useRef(kept.addRecent)
    addRecent.current = kept.addRecent
    useEffect(() => {
        if (!searching) return
        const t = setTimeout(() => addRecent.current(key), 2500)
        return () => clearTimeout(t)
    }, [key, searching])
    const go = (query: string) => setParams(new URLSearchParams(query))

    const years = Array.from({ length: new Date().getFullYear() - 1959 }, (_, i) => String(new Date().getFullYear() + 1 - i))
    // Those in the panel; the season and year sit beside its button.
    const tucked = filterCount(params)
    const active = tucked + (season ? 1 : 0) + (year ? 1 : 0)

    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div className="mb-8 flex flex-col gap-5">
                <div className="flex items-center justify-between gap-4">
                    <h1 className="text-[1.75rem] font-semibold tracking-tight">Search</h1>
                    <div className={cn("flex", classic ? "rounded-xl border border-white/10 bg-white/[0.045] p-0.5" : "gap-1")}>
                        {(["ANIME", "MANGA"] as const).map(t => (
                            <button
                                key={t}
                                aria-pressed={type === t}
                                onClick={() =>
                                    update(p => {
                                        if (t === "ANIME") p.delete("type")
                                        else p.set("type", t)
                                        // Anime and manga have different formats.
                                        const keep = p.getAll("format").filter(f => formatsFor(t).includes(f))
                                        p.delete("format")
                                        keep.forEach(f => p.append("format", f))
                                    })
                                }
                                className={cn(
                                    "h-8 px-3.5 font-medium transition-colors",
                                    classic ? "rounded-[10px] text-[13px]" : "word label focus-ring text-[10.5px]",
                                    type === t ? (classic ? "bg-white/[0.1] text-fg" : "text-fg") : "text-muted hover:text-fg",
                                )}
                            >
                                {t === "ANIME" ? "Anime" : "Manga"}
                            </button>
                        ))}
                    </div>
                </div>
                <Input
                    autoFocus
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Search by title…"
                    aria-label="Search by title"
                    icon={<SearchIcon className="size-5" />}
                    className="h-14 rounded-2xl border-white/10 bg-white/[0.045] pr-4 pl-11 text-base"
                />
                {/* Two by two on a phone, one row from there up. */}
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                    <Select className="sm:w-40" value={season} onChange={v => set("season", v)} options={[{ value: "", label: "Any season" }, ...SEASONS.map(s => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))]} />
                    <Select className="sm:w-32" value={year} onChange={v => set("year", v)} options={[{ value: "", label: "Any year" }, ...years.map(y => ({ value: y, label: y }))]} />
                    <Select className="sm:w-52" value={sort} onChange={v => set("sort", v)} options={SORTS} />
                    <div className="flex min-w-0 items-center gap-1">
                        <Button
                            variant={classic ? "ghost" : "outline"}
                            aria-expanded={open}
                            data-on={open || undefined}
                            onClick={() => setOpen(o => !o)}
                            className={cn("min-w-0 flex-1 sm:flex-none", classic && "rounded-xl border border-white/10 bg-white/[0.045]")}
                            icon={<SlidersHorizontal className="size-4" />}
                        >
                            Filters
                            {tucked > 0 && <span className={cn("grid h-5 min-w-5 place-items-center px-1.5 text-xs font-semibold text-fg", classic ? "rounded-full bg-white/15" : "tabular-nums")}>{tucked}</span>}
                        </Button>
                        {active > 0 && (
                            <IconButton label="Clear filters" onClick={() => update(p => FILTERS.forEach(k => p.delete(k)))}>
                                <X className="size-4" />
                            </IconButton>
                        )}
                        {searching && (
                            <IconButton label={saved ? "Remove from saved searches" : "Save this search"} aria-pressed={saved} onClick={() => (saved ? kept.unsave(key) : kept.save(key))}>
                                {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
                            </IconButton>
                        )}
                    </div>
                </div>
                {/* Before anything is looked for: the searches kept, each a click away (and its x takes it off). */}
                {!searching && !open && (kept.saved.length > 0 || kept.recent.length > 0) && (
                    <div className="flex flex-col gap-2">
                        {kept.saved.length > 0 && (
                            <KeptRow label="Saved">
                                {kept.saved.map(s => (
                                    <KeptSearch key={s.id} name={s.name} onGo={() => go(s.query)} onRemove={() => kept.unsave(s.query)} />
                                ))}
                            </KeptRow>
                        )}
                        {kept.recent.length > 0 && (
                            <KeptRow
                                label="Recent"
                                action={
                                    <button onClick={kept.clearRecent} className={cn("h-8 shrink-0 px-2.5 text-muted transition-colors hover:text-fg", classic ? "rounded-lg text-xs" : "word label focus-ring text-[10.5px]")}>
                                        Clear
                                    </button>
                                }
                            >
                                {kept.recent.map(r => (
                                    <KeptSearch key={r.query} name={searchLabel(r.query)} onGo={() => go(r.query)} onRemove={() => kept.removeRecent(r.query)} />
                                ))}
                            </KeptRow>
                        )}
                    </div>
                )}
                {open && <SearchFilters type={type} get={get} getAll={getAll} update={update} />}
                {!open && <ActiveFilters type={type} getAll={getAll} update={update} />}
            </div>

            {acc.length === 0 && isFetching ? (
                <MediaGrid>
                    {Array.from({ length: 18 }).map((_, i) => (
                        <MediaCardSkeleton key={i} />
                    ))}
                </MediaGrid>
            ) : acc.length === 0 && error ? (
                <ErrorState title="Couldn't search AniList" error={error} onRetry={() => refetch()} />
            ) : acc.length === 0 ? (
                <EmptyState icon={<SearchIcon className="size-6" />} title="Nothing found">
                    Try a different title or fewer filters.
                </EmptyState>
            ) : (
                <>
                    <MediaGrid>
                        {acc.map(m => (
                            <MediaCard key={m.id} media={m} listEntry={m.mediaListEntry} menu={<ListCardMenu media={m} />} />
                        ))}
                    </MediaGrid>
                    {error && page > 1 ? (
                        <ErrorState compact className="mt-6" title="Couldn't load more results" error={error} retrying={isFetching} onRetry={() => refetch()} />
                    ) : (
                        data?.pageInfo?.hasNextPage && (
                            <div className="mt-10 flex justify-center">
                                <Button loading={isFetching} onClick={() => setPage(p => p + 1)}>
                                    Load more
                                </Button>
                            </div>
                        )
                    )}
                </>
            )}
        </div>
    )
}

// A row of kept searches under its name: Saved, Recent.
function KeptRow({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <span className="label w-14 shrink-0 pt-2.5 text-subtle">{label}</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5">{children}</div>
            {action}
        </div>
    )
}

// One of them: its name runs it again, the x beside it takes it off.
function KeptSearch({ name, onGo, onRemove }: { name: string; onGo: () => void; onRemove: () => void }) {
    return (
        <span className="flex max-w-full items-center">
            <button onClick={onGo} className="word focus-ring h-8 max-w-72 truncate px-2.5 text-[13px] text-fg/85 transition-colors hover:text-fg">
                {name}
            </button>
            <button onClick={onRemove} aria-label={`Remove ${name}`} className="focus-ring grid size-6 shrink-0 place-items-center rounded-sm text-subtle transition-colors hover:text-fg">
                <X className="size-3" />
            </button>
        </span>
    )
}
