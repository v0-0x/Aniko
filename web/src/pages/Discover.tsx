import { BookOpen, ChevronLeft, ChevronRight, Compass, Play, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ListCardMenu } from "@/components/ListCardMenu"
import { Carousel, MediaCard, MediaCardSkeleton } from "@/components/MediaCard"
import { PluginSlot } from "@/components/plugins/PluginSlot"
import { artButton, Backdrop, Button, ChipRow, EmptyState, ErrorState, SectionHeader, Skeleton } from "@/components/ui"
import { useDiscover, useGenres, useRecommended, useSearch } from "@/lib/queries"
import { useStore } from "@/lib/store"
import { holidayStore, useClassic } from "@/lib/themes"
import { HolidayIcon } from "@/components/HolidayBadge"
import type { Media } from "@/lib/types"
import { banner, cn, entryUrl, formatLabel, GENRES, SEASONS, seasonLabel, title } from "@/lib/utils"

// The season after the given one: Fall 2026 -> Winter 2027.
function seasonAfter(season: string, year: number) {
    const i = SEASONS.indexOf(season)
    return i === SEASONS.length - 1 ? { season: SEASONS[0], year: year + 1 } : { season: SEASONS[i + 1], year }
}

const seasonSearch = (season?: string, year?: number) => (season && year ? `/search?season=${season}&year=${year}&sort=POPULARITY_DESC` : "/search?sort=POPULARITY_DESC")

const MANGA_ROWS: { key: string; title: string; params: { sort: string[]; country?: string }; more: string }[] = [
    { key: "trending", title: "Trending now", params: { sort: ["TRENDING_DESC", "POPULARITY_DESC"] }, more: "/search?type=MANGA&sort=TRENDING_DESC" },
    { key: "manhwa", title: "Popular manhwa", params: { country: "KR", sort: ["POPULARITY_DESC"] }, more: "/search?type=MANGA&country=KR&sort=POPULARITY_DESC" },
    { key: "popular", title: "All-time popular", params: { sort: ["POPULARITY_DESC"] }, more: "/search?type=MANGA&sort=POPULARITY_DESC" },
    { key: "topRated", title: "Top rated", params: { sort: ["SCORE_DESC"] }, more: "/search?type=MANGA&sort=SCORE_DESC" },
]

export default function DiscoverPage() {
    // Anime, or manga (?type=MANGA): the switch in the page's top corner.
    const [params, setParams] = useSearchParams()
    const manga = params.get("type") === "MANGA"
    const anime = useDiscover()
    // Manga's rows are AniList searches (kept like any search), asked for only when it's shown.
    const m0 = useSearch({ type: "MANGA", perPage: 20, ...MANGA_ROWS[0].params }, manga)
    const m1 = useSearch({ type: "MANGA", perPage: 20, ...MANGA_ROWS[1].params }, manga)
    const m2 = useSearch({ type: "MANGA", perPage: 20, ...MANGA_ROWS[2].params }, manga)
    const m3 = useSearch({ type: "MANGA", perPage: 20, ...MANGA_ROWS[3].params }, manga)
    const mangaRows = [m0, m1, m2, m3]
    const data = anime.data
    const isLoading = manga ? m0.isLoading : anime.isLoading
    const error = manga ? (m0.data ? null : m0.error) : anime.error
    const isFetching = manga ? m0.isFetching : anime.isFetching
    const refetch = () => (manga ? mangaRows.forEach(r => r.refetch()) : anime.refetch())
    const { data: recommended } = useRecommended()
    const genres = useGenres(GENRES)
    // The holiday theme's row (Halloween's horror...), when it has one.
    const holiday = useStore(holidayStore)
    const picks = holiday?.picks
    const { data: pickData } = useSearch({ ...picks?.params, type: "ANIME", perPage: 20 }, !!picks)
    const pickMedia = picks ? (pickData?.media ?? []) : []
    const featured = ((manga ? m0.data?.media : data?.trending) ?? []).filter(m => m.bannerImage).slice(0, 6)
    const [i, setI] = useState(0)
    useEffect(() => setI(0), [manga])
    // Not while the focus is on it (a TV remote's): its buttons would go.
    const [hold, setHold] = useState(false)
    useEffect(() => {
        if (featured.length < 2 || hold) return
        const t = setInterval(() => setI(x => (x + 1) % featured.length), 9000)
        return () => clearInterval(t)
    }, [featured.length, hold])

    const typeSwitch = (
        <div className="glass absolute top-4 z-30 flex gap-1 rounded-lg p-1 max-sm:left-4 sm:right-4">
            {(["ANIME", "MANGA"] as const).map(t => (
                <button
                    key={t}
                    aria-pressed={manga === (t === "MANGA")}
                    onClick={() => setParams(t === "MANGA" ? { type: "MANGA" } : {}, { replace: true })}
                    className={cn("word label focus-ring h-8 px-3.5 text-[10.5px] transition-colors", manga === (t === "MANGA") ? "text-fg" : "text-muted hover:text-fg")}
                >
                    {t === "ANIME" ? "Anime" : "Manga"}
                </button>
            ))}
        </div>
    )

    if (error)
        return (
            <div className="relative p-10 pt-20">
                {typeSwitch}
                <ErrorState title="Couldn't reach AniList" error={error} retrying={isFetching} onRetry={() => refetch()} />
            </div>
        )

    const next = data ? seasonAfter(data.season, data.year) : undefined
    // The season is named in the heading itself, not on a line under it.
    const rows: { key: string; title: string; more: string; items: Media[] }[] = manga
        ? MANGA_ROWS.map((r, k) => ({ key: r.key, title: r.title, more: r.more, items: mangaRows[k].data?.media ?? [] }))
        : [
              { key: "trending", title: "Trending now", more: "/search?sort=TRENDING_DESC", items: data?.trending ?? [] },
              { key: "thisSeason", title: data ? `Popular in ${seasonLabel(data.season, data.year)}` : "Popular this season", more: seasonSearch(data?.season, data?.year), items: data?.thisSeason ?? [] },
              { key: "nextSeason", title: next ? `Coming in ${seasonLabel(next.season, next.year)}` : "Coming next season", more: seasonSearch(next?.season, next?.year), items: data?.nextSeason ?? [] },
              { key: "popular", title: "All-time popular", more: "/search?sort=POPULARITY_DESC", items: data?.popular ?? [] },
              { key: "topRated", title: "Top rated", more: "/search?sort=SCORE_DESC", items: data?.topRated ?? [] },
          ]
    // AniList can come back with nothing at all (it couldn't be reached and
    // nothing is cached): skip empty rows instead of showing bare headers.
    const shown = isLoading ? rows : rows.filter(r => r.items.length > 0)
    const hero = isLoading || !!featured[i]

    return (
        <div className="relative min-h-full pb-24">
            {typeSwitch}
            {isLoading ? <Skeleton className="h-[clamp(340px,50vh,540px)] rounded-none max-sm:h-[440px]" /> : featured[i] && <Featured media={featured[i]} index={i} count={featured.length} onIndex={setI} onHold={setHold} />}
            {/* Without a hero banner there is nothing to overlap. */}
            <div className={cn("relative z-10 flex flex-col gap-10 px-6 md:px-8 xl:px-10", hero ? "-mt-14" : "pt-20")}>
                <PluginSlot slot="after-discover-screen-header" />
                {/* From the user's own list, so it comes first. The rows below the
                    window aren't drawn till they're scrolled near (a hundred
                    cards less to draw when the page opens). */}
                {!manga && (recommended ?? []).map(r => (
                    <section key={r.because.id} className="[content-visibility:auto] [contain-intrinsic-size:auto_24rem]">
                        <SectionHeader
                            title={
                                <span>
                                    Because you watched{" "}
                                    <Link to={`/entry?id=${r.because.id}`} className="underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg">
                                        {title(r.because)}
                                    </Link>
                                </span>
                            }
                        />
                        <Carousel>{r.items.map(m => <MediaCard key={m.id} media={m} listEntry={m.mediaListEntry} menu={<ListCardMenu media={m} />} />)}</Carousel>
                    </section>
                ))}
                {shown.length === 0 && (
                    <EmptyState
                        icon={<Compass className="size-6" />}
                        title="Nothing to discover right now"
                        action={
                            <Button icon={<RefreshCw className="size-4" />} loading={isFetching} onClick={() => refetch()}>
                                Try again
                            </Button>
                        }
                    >
                        AniList returned nothing. Check your connection.
                    </EmptyState>
                )}
                {!manga && holiday && picks && pickMedia.length > 0 && (
                    <section>
                        <SectionHeader
                            title={
                                <span className="flex items-center gap-2.5">
                                    <HolidayIcon id={holiday.id} className="size-6" />
                                    {picks.title}
                                </span>
                            }
                            action={
                                picks.more && (
                                    <Link to={picks.more} className="text-[13px] font-medium text-muted transition-colors hover:text-fg">
                                        See all
                                    </Link>
                                )
                            }
                        />
                        <Carousel>{pickMedia.map(m => <MediaCard key={m.id} media={m} listEntry={m.mediaListEntry} menu={<ListCardMenu media={m} />} />)}</Carousel>
                    </section>
                )}
                {shown.map(r => (
                    <section key={r.key} className="[content-visibility:auto] [contain-intrinsic-size:auto_24rem]">
                        <SectionHeader
                            title={r.title}
                            action={
                                <Link to={r.more} className="text-[13px] font-medium text-muted transition-colors hover:text-fg">
                                    See all
                                </Link>
                            }
                        />
                        {isLoading ? (
                            <div className="flex gap-4 overflow-hidden">
                                {Array.from({ length: 7 }).map((_, k) => (
                                    <div key={k} className="w-[160px] shrink-0">
                                        <MediaCardSkeleton />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Carousel>{r.items.map(m => <MediaCard key={m.id} media={m} listEntry={m.mediaListEntry} menu={<ListCardMenu media={m} />} />)}</Carousel>
                        )}
                    </section>
                ))}
                {/* Last: the rows above are what most come for. */}
                {genres.length > 0 && (
                    <section>
                        <SectionHeader title="Genres" />
                        <ChipRow label="More genres">
                            {genres.map(g => (
                                <Link key={g} to={`/search?genre=${encodeURIComponent(g)}${manga ? "&type=MANGA" : ""}`} className="flex h-9 shrink-0 items-center rounded-xl border border-white/10 bg-white/[0.045] px-4 text-[13px] font-medium text-fg/80 transition-colors hover:bg-white/[0.09] hover:text-fg">
                                    {g}
                                </Link>
                            ))}
                        </ChipRow>
                    </section>
                )}
            </div>
        </div>
    )
}

function Featured({ media, index, count, onIndex, onHold }: { media: Media; index: number; count: number; onIndex: (i: number) => void; onHold: (on: boolean) => void }) {
    const classic = useClassic()
    // One line: score, format, season, then its first genres.
    const facts = [media.meanScore ? `${media.meanScore}%` : "", formatLabel(media.format), seasonLabel(media.season, media.seasonYear), media.genres?.slice(0, 3).join(", ") ?? ""].filter(Boolean)
    return (
        <div
            className="rail-bleed relative h-[clamp(340px,50vh,540px)] overflow-hidden max-sm:h-[440px]"
            onFocus={() => onHold(true)}
            onBlur={e => !e.currentTarget.contains(e.relatedTarget as Node | null) && onHold(false)}
        >
            <Backdrop src={banner(media)} className="absolute inset-0 size-full object-cover [mask-image:linear-gradient(to_bottom,#000_80%,transparent)]" />
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-bg/5" />
            <div className="absolute inset-0 bg-gradient-to-r from-bg/80 via-bg/25 to-transparent" />
            <div key={media.id + "t"} className="rail-in absolute inset-x-0 bottom-24 max-w-3xl px-6 rise-in md:px-8 xl:px-10">
                <p className={cn(classic ? "text-sm font-medium" : "label", "text-white/65")}>Trending #{index + 1}</p>
                <h1 className="mt-1.5 line-clamp-2 text-4xl leading-[1.1] font-semibold tracking-tight text-white md:text-[2.75rem]">{title(media)}</h1>
                <p className="mt-2 line-clamp-1 text-[15px] text-white/80">{facts.join(" · ")}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Link to={entryUrl(media)}>
                        <Button variant="white" icon={media.type === "MANGA" ? <BookOpen className="size-4" /> : <Play className="size-4 fill-current" />}>
                            {media.type === "MANGA" ? "Read" : "Watch now"}
                        </Button>
                    </Link>
                    {/* A manga's page has no tabs: the one button opens it. */}
                    {media.type !== "MANGA" && (
                        <Link to={`/entry?id=${media.id}&tab=details`} className={classic ? "focus-ring inline-flex h-9 items-center rounded-lg bg-white/10 px-3.5 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20" : artButton}>
                            Details
                        </Link>
                    )}
                </div>
            </div>
            {count > 1 && (
                // On a phone, up in the corner: clear of the buttons below.
                <div className="absolute right-6 bottom-24 flex items-center gap-3 max-sm:top-4 max-sm:right-4 max-sm:bottom-auto md:right-8 xl:right-10">
                    <div className="flex gap-1.5 max-sm:hidden">
                        {Array.from({ length: count }).map((_, k) => (
                            <button
                                key={k}
                                aria-label={`Show ${k + 1}`}
                                onClick={() => onIndex(k)}
                                className={cn("h-1 rounded-full transition-all duration-300", k === index ? "w-5 bg-white" : "w-2.5 bg-white/30 hover:bg-white/50")}
                            />
                        ))}
                    </div>
                    <div className="flex gap-1">
                        <button aria-label="Previous" className="glass grid size-8 place-items-center rounded-full transition-colors hover:bg-black/70" onClick={() => onIndex((index - 1 + count) % count)}>
                            <ChevronLeft className="size-4" />
                        </button>
                        <button aria-label="Next" className="glass grid size-8 place-items-center rounded-full transition-colors hover:bg-black/70" onClick={() => onIndex((index + 1) % count)}>
                            <ChevronRight className="size-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
