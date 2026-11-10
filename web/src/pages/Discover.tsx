import { ChevronLeft, ChevronRight, Compass, Play, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ListCardMenu } from "@/components/ListCardMenu"
import { Carousel, MediaCard, MediaCardSkeleton } from "@/components/MediaCard"
import { PluginSlot } from "@/components/plugins/PluginSlot"
import { Button, ChipRow, EmptyState, ErrorState, SectionHeader, Skeleton } from "@/components/ui"
import { useDiscover, useGenres, useSearch } from "@/lib/queries"
import { useStore } from "@/lib/store"
import { holidayStore } from "@/lib/themes"
import { HolidayIcon } from "@/components/HolidayBadge"
import type { Media } from "@/lib/types"
import { banner, cn, formatLabel, GENRES, SEASONS, seasonLabel, title } from "@/lib/utils"

// The season after the given one: Fall 2026 -> Winter 2027.
function seasonAfter(season: string, year: number) {
    const i = SEASONS.indexOf(season)
    return i === SEASONS.length - 1 ? { season: SEASONS[0], year: year + 1 } : { season: SEASONS[i + 1], year }
}

const seasonSearch = (season?: string, year?: number) => (season && year ? `/search?season=${season}&year=${year}&sort=POPULARITY_DESC` : "/search?sort=POPULARITY_DESC")

export default function DiscoverPage() {
    const { data, isLoading, error, refetch, isFetching } = useDiscover()
    const genres = useGenres(GENRES)
    // The holiday theme's row (Halloween's horror...), when it has one.
    const holiday = useStore(holidayStore)
    const picks = holiday?.picks
    const { data: pickData } = useSearch({ ...picks?.params, type: "ANIME", perPage: 20 }, !!picks)
    const pickMedia = picks ? (pickData?.media ?? []) : []
    const featured = (data?.trending ?? []).filter(m => m.bannerImage).slice(0, 6)
    const [i, setI] = useState(0)
    // Not while the focus is on it (a TV remote's): its buttons would go.
    const [hold, setHold] = useState(false)
    useEffect(() => {
        if (featured.length < 2 || hold) return
        const t = setInterval(() => setI(x => (x + 1) % featured.length), 9000)
        return () => clearInterval(t)
    }, [featured.length, hold])

    if (error)
        return (
            <div className="p-10">
                <ErrorState title="Couldn't reach AniList" error={error} retrying={isFetching} onRetry={() => refetch()} />
            </div>
        )

    const next = data ? seasonAfter(data.season, data.year) : undefined
    // The season is named in the heading itself, not on a line under it.
    const rows: { key: keyof NonNullable<typeof data>; title: string; more: string }[] = [
        { key: "trending", title: "Trending now", more: "/search?sort=TRENDING_DESC" },
        { key: "thisSeason", title: data ? `Popular in ${seasonLabel(data.season, data.year)}` : "Popular this season", more: seasonSearch(data?.season, data?.year) },
        { key: "nextSeason", title: next ? `Coming in ${seasonLabel(next.season, next.year)}` : "Coming next season", more: seasonSearch(next?.season, next?.year) },
        { key: "popular", title: "All-time popular", more: "/search?sort=POPULARITY_DESC" },
        { key: "topRated", title: "Top rated", more: "/search?sort=SCORE_DESC" },
    ]
    // AniList can come back with nothing at all (it couldn't be reached and
    // nothing is cached): skip empty rows instead of showing bare headers.
    const shown = isLoading ? rows : rows.filter(r => ((data?.[r.key] as Media[] | undefined) ?? []).length > 0)
    const hero = isLoading || !!featured[i]

    return (
        <div className="min-h-full pb-24">
            {isLoading ? <Skeleton className="h-[clamp(340px,50vh,540px)] rounded-none max-sm:h-[440px]" /> : featured[i] && <Featured media={featured[i]} index={i} count={featured.length} onIndex={setI} onHold={setHold} />}
            {/* Without a hero banner there is nothing to overlap. */}
            <div className={cn("relative z-10 flex flex-col gap-10 px-6 md:px-8 xl:px-10", hero ? "-mt-14" : "pt-8")}>
                <PluginSlot slot="after-discover-screen-header" />
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
                {holiday && picks && pickMedia.length > 0 && (
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
                    <section key={r.key}>
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
                            <Carousel>{((data?.[r.key] as Media[]) ?? []).map(m => <MediaCard key={m.id} media={m} listEntry={m.mediaListEntry} menu={<ListCardMenu media={m} />} />)}</Carousel>
                        )}
                    </section>
                ))}
                {/* Last: the rows above are what most come for. */}
                {genres.length > 0 && (
                    <section>
                        <SectionHeader title="Genres" />
                        <ChipRow label="More genres">
                            {genres.map(g => (
                                <Link key={g} to={`/search?genre=${encodeURIComponent(g)}`} className="flex h-9 shrink-0 items-center rounded-xl border border-white/10 bg-white/[0.045] px-4 text-[13px] font-medium text-fg/80 transition-colors hover:bg-white/[0.09] hover:text-fg">
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
    // One line: score, format, season, then its first genres.
    const facts = [media.meanScore ? `${media.meanScore}%` : "", formatLabel(media.format), seasonLabel(media.season, media.seasonYear), media.genres?.slice(0, 3).join(", ") ?? ""].filter(Boolean)
    return (
        <div
            className="relative h-[clamp(340px,50vh,540px)] overflow-hidden max-sm:h-[440px]"
            onFocus={() => onHold(true)}
            onBlur={e => !e.currentTarget.contains(e.relatedTarget as Node | null) && onHold(false)}
        >
            <img key={media.id} src={banner(media)} alt="" className="absolute inset-0 size-full object-cover fade-in [mask-image:linear-gradient(to_bottom,#000_80%,transparent)]" />
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-bg/5" />
            <div className="absolute inset-0 bg-gradient-to-r from-bg/80 via-bg/25 to-transparent" />
            <div key={media.id + "t"} className="absolute inset-x-0 bottom-24 max-w-3xl px-6 rise-in md:px-8 xl:px-10">
                <p className="text-sm font-medium text-white/65">Trending #{index + 1}</p>
                <h1 className="mt-1.5 line-clamp-2 text-4xl leading-[1.1] font-semibold tracking-tight text-white md:text-[2.75rem]">{title(media)}</h1>
                <p className="mt-2 line-clamp-1 text-[15px] text-white/80">{facts.join(" · ")}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Link to={`/entry?id=${media.id}`}>
                        <Button variant="white" icon={<Play className="size-4 fill-current" />}>
                            Watch now
                        </Button>
                    </Link>
                    <Link to={`/entry?id=${media.id}&tab=details`} className="focus-ring inline-flex h-9 items-center rounded-lg bg-white/10 px-3.5 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20">
                        Details
                    </Link>
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
