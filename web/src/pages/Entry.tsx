import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
    CalendarClock,
    CheckCheck,
    ExternalLink,
    Film,
    FolderInput,
    FolderOpen,
    HardDrive,
    Info,
    ListEnd,
    ListPlus,
    Magnet,
    MonitorPlay,
    MoreHorizontal,
    Play,
    RefreshCw,
    RotateCcw,
    Tv,
    Users,
} from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "@/lib/toast"
import { EpisodeCard, WatchedToggle } from "@/components/EpisodeCard"
import { AddFromLibraryDialog, EntryFilesMenu } from "@/components/library/EntryFileTools"
import { ListStatusButton, ProgressEditor, ScoreEditor } from "@/components/entry/ListEditor"
import { StreamPanel } from "@/components/entry/StreamPanel"
import { TorrentPanel } from "@/components/entry/TorrentPanel"
import { Carousel, MediaCard } from "@/components/MediaCard"
import { PluginActions, PluginSlot, usePluginDropdownActions } from "@/components/plugins/PluginSlot"
import { sendPluginEvent } from "@/components/plugins/PluginRenderer"
import { Badge, Button, Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger, EmptyState, Skeleton, switchBox, switchItem, Tabs, Tooltip } from "@/components/ui"
import { WatchOrder } from "@/components/WatchOrder"
import { AddToPlaylistDialog } from "@/components/PlaylistDialog"
import { api } from "@/lib/api"
import { formatRanges, missingEpisodes } from "@/lib/missing"
import { usePlay } from "@/lib/play"
import { fetchLanguageMode, useEntry, useEpisodeMarker, useFiller, useLanguageMode, useStatus } from "@/lib/queries"
import { fillerFact } from "@/lib/filler"
import type { PlaylistItem } from "@/lib/playlist"
import { useClassic } from "@/lib/themes"
import type { EntryView, Probe } from "@/lib/types"
import { banner, cleanDescription, cn, cover, formatBytes, formatDuration, formatLabel, img, otherTitle, readLocal, scoreColor, seasonLabel, statusLabel, timeUntil, title, totalEpisodes } from "@/lib/utils"
import { tv } from "@/lib/tv"

type Tab = "episodes" | "stream" | "torrents" | "details"

export default function EntryPage() {
    const [params, setParams] = useSearchParams()
    const id = Number(params.get("id"))
    const { data: entry, isLoading, error } = useEntry(id)
    const { data: status } = useStatus()

    const defaultTab: Tab = entry ? (entry.localCount + (entry.sharedCount ?? 0) > 0 ? "episodes" : status?.settings.onlineStream.enabled !== false ? "stream" : "torrents") : "episodes"
    const tab = (params.get("tab") as Tab) || defaultTab
    const setTab = (t: Tab) =>
        setParams(
            p => {
                p.set("tab", t)
                return p
            },
            { replace: true },
        )

    if (isLoading) return <EntrySkeleton />
    if (error || !entry) {
        return (
            <div className="p-10">
                <EmptyState icon={<Info className="size-6" />} title="Couldn't load this anime">
                    {(error as Error)?.message ?? "Not found"}
                </EmptyState>
            </div>
        )
    }

    const files = entry.localCount + (entry.sharedCount ?? 0)
    // One slim row; a tab's count is a plain muted number (as on Library tools).
    const tabs: { value: Tab; label: React.ReactNode }[] = [
        {
            value: "episodes",
            label: (
                <>
                    Library
                    {files > 0 && <span className="font-normal text-subtle tabular-nums">{files}</span>}
                </>
            ),
        },
        ...(status?.settings.onlineStream.enabled !== false ? [{ value: "stream" as Tab, label: "Watch online" }] : []),
        { value: "torrents", label: "Torrents" },
        { value: "details", label: "Details" },
    ]

    return (
        <div className="relative min-h-full pb-24">
            <EntryHero entry={entry} onTab={setTab} />
            <div className="relative z-10 flex flex-col gap-6 px-6 md:px-8 xl:px-10">
                <PluginSlot slot="before-anime-entry-episode-list" />
                <Tabs variant="underline" value={tab} onChange={setTab} tabs={tabs} />
                {/* Keyed by anime too: panels keep per-anime state (dub, search results). */}
                <div key={`${entry.media.id}-${tab}`} className="fade-in">
                    {tab === "episodes" && (
                        <EpisodesTab
                            entry={entry}
                            onStream={() => setTab("stream")}
                            onTorrents={(ep?: number) =>
                                setParams(
                                    p => {
                                        p.set("tab", "torrents")
                                        if (ep) p.set("episode", String(ep))
                                        else p.delete("episode")
                                        return p
                                    },
                                    { replace: true },
                                )
                            }
                        />
                    )}
                    {tab === "stream" && <StreamPanel entry={entry} />}
                    {tab === "torrents" && <TorrentPanel entry={entry} episode={Number(params.get("episode")) || undefined} />}
                    {tab === "details" && <DetailsTab entry={entry} />}
                </div>
                <PluginSlot slot="after-anime-entry-episode-list" />
                <PluginSlot slot="after-anime-episode-list" />
                <PluginSlot slot="anime-screen-bottom" />
            </div>
        </div>
    )
}

function EntryHero({ entry, onTab }: { entry: EntryView; onTab: (t: Tab) => void }) {
    const classic = useClassic()
    const media = entry.media
    const { data: status } = useStatus()
    const { playLocal, playStream } = usePlay()
    const [expanded, setExpanded] = useState(false)
    const qc = useQueryClient()
    const dropdownActions = usePluginDropdownActions("anime-page-dropdown")
    const next = entry.nextEpisode
    const desc = cleanDescription(media.description)
    const total = totalEpisodes(media)
    const score = media.meanScore ?? media.averageScore
    const bannerImg = entry.images?.fanart ? img(entry.images.fanart) : banner(media)

    const watch = async () => {
        if (!next) return
        if (next.file) playLocal(next.file.path, media.id, next.number)
        else if (status?.settings.onlineStream.enabled !== false) {
            const provider = readLocal(`aniko-provider-${media.id}`) || status?.settings.onlineStream.defaultProvider || "ani-cli"
            const dub = await fetchLanguageMode(media.id, status?.settings.aniCli.defaultMode === "dub")
            playStream(provider, media.id, next.number, dub)
        } else onTab("torrents")
    }

    const refresh = async () => {
        await api.get(`/api/anime/${media.id}?refresh=1`)
        qc.invalidateQueries({ queryKey: ["entry", media.id] })
        toast.success("Metadata refreshed")
    }

    return (
        <div className="relative">
            <div className="absolute inset-x-0 top-0 h-[460px] overflow-hidden">
                {bannerImg && <img src={bannerImg} alt="" className="size-full object-cover opacity-80 fade-in [mask-image:linear-gradient(to_bottom,#000_80%,transparent)]" />}
                <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/75 to-bg/10" />
                <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/30 to-transparent" />
            </div>
            {/* What the anime is and what to do with it, on one glass panel over its art. */}
            <div className="relative z-10 px-6 pt-28 pb-8 md:px-8 xl:px-10">
            <div className={cn("flex flex-col gap-6 md:flex-row", classic ? "rounded-3xl border border-white/10 bg-black/35 p-5 shadow-[0_24px_60px_-28px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.08)] md:p-6" : "md:gap-8", !tv && classic && "backdrop-blur-2xl")}>
                <div className="w-32 shrink-0 md:w-44">
                    {/* marks: this look's corner marks on the poster (index.css). */}
                    <div className="marks">
                        <img src={cover(media, "poster")} alt="" className="aspect-[2/3] w-full rounded-lg object-cover shadow-2xl shadow-black/60 ring-1 ring-white/10 fade-in" />
                    </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-end gap-4 fade-in">
                    <div>
                        <h1 className="text-3xl leading-[1.1] font-semibold tracking-tight text-white md:text-[2.75rem]">{title(media)}</h1>
                        {otherTitle(media) && <p className="mt-2 text-base text-white/60">{otherTitle(media)}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-white/75">
                        {[
                            score ? <span className={cn("font-semibold", scoreColor(score))}>{score}%</span> : null,
                            <span>{formatLabel(media.format)}</span>,
                            media.season ? <span>{seasonLabel(media.season, media.seasonYear)}</span> : null,
                            total > 0 ? <span>{total} episodes</span> : null,
                            // The next one to air, here with the rest (the studio and length are under Details).
                            media.nextAiringEpisode ? (
                                <span className="font-medium text-brand-strong">
                                    Ep {media.nextAiringEpisode.episode} in {timeUntil(media.nextAiringEpisode.timeUntilAiring)}
                                </span>
                            ) : null,
                        ]
                            .filter(Boolean)
                            .map((el, k) => (
                                <span key={k} className="flex items-center gap-2">
                                    {k > 0 && <span className="text-white/25">·</span>}
                                    {el}
                                </span>
                            ))}
                        <Badge tone={media.status === "RELEASING" ? "green" : "gray"} className="ml-1">
                            {statusLabel(media.status)}
                        </Badge>
                    </div>
                    {/* Its first genres, as words: each opens a search. */}
                    {!!media.genres?.length && (
                        <p className="text-sm text-white/55">
                            {media.genres.slice(0, 3).map((g, k) => (
                                <span key={g}>
                                    {k > 0 && " · "}
                                    <Link to={`/search?genre=${encodeURIComponent(g)}`} className="transition-colors hover:text-white">
                                        {g}
                                    </Link>
                                </span>
                            ))}
                        </p>
                    )}
                    {desc && (
                        <div className="max-w-3xl">
                            <p className={cn("text-[15px] leading-relaxed whitespace-pre-line text-white/70", !expanded && "line-clamp-2")}>{desc}</p>
                            {desc.length > 180 && (
                                <button onClick={() => setExpanded(e => !e)} className="mt-1 text-sm font-medium text-fg/80 transition-colors hover:text-fg">
                                    {expanded ? "Show less" : "Read more"}
                                </button>
                            )}
                        </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2.5">
                        {next && (
                            // A TV's remote starts here when the page opens (lib/pages).
                            <Button variant="white" size="lg" icon={<Play className="size-4 fill-current" />} onClick={watch} data-tv-autofocus>
                                {next.resumeAt > 0 ? "Resume" : entry.listEntry?.progress ? "Continue" : "Watch"} · Ep {next.number}
                            </Button>
                        )}
                        {/* The list's status, progress and score, and the rest: one quiet group. */}
                        <div className={classic ? "flex max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-white/10 bg-white/[0.06] p-0.5 *:h-[38px]! *:rounded-[9px]! *:bg-transparent! [&>button:not([aria-label])]:px-3.5! [&>button]:text-sm! [&>button:hover]:bg-white/[0.08]! [&>button[data-state=open]]:bg-white/[0.08]!" : "flex max-w-full flex-wrap items-center gap-x-1 gap-y-2"}>
                            <ListStatusButton media={media} entry={entry.listEntry} />
                            {entry.listEntry && <ProgressEditor media={media} entry={entry.listEntry} />}
                            <ScoreEditor media={media} entry={entry.listEntry} />
                            <Dropdown>
                                <DropdownTrigger asChild>
                                    <Button variant="ghost" size="lg" className="w-[38px] px-0! text-fg" aria-label="More">
                                        <MoreHorizontal className="size-5" />
                                    </Button>
                                </DropdownTrigger>
                            <DropdownContent align="start">
                                {entry.localCount > 0 && status?.client !== "lan" && (
                                    <DropdownItem icon={<FolderOpen />} onSelect={() => api.post("/api/library/open-folder", { mediaId: media.id }).catch(e => toast.error(e.message))}>
                                        Open folder
                                    </DropdownItem>
                                )}
                                <DropdownItem icon={<ExternalLink />} onSelect={() => window.open(`https://anilist.co/anime/${media.id}`, "_blank", "noopener")}>
                                    View on AniList
                                </DropdownItem>
                                {media.idMal && (
                                    <DropdownItem icon={<ExternalLink />} onSelect={() => window.open(`https://myanimelist.net/anime/${media.idMal}`, "_blank", "noopener")}>
                                        View on MyAnimeList
                                    </DropdownItem>
                                )}
                                <DropdownItem icon={<RefreshCw />} onSelect={refresh}>
                                    Refresh metadata
                                </DropdownItem>
                                {dropdownActions.length > 0 && <DropdownSeparator />}
                                {dropdownActions.map(a => (
                                    <DropdownItem key={a.pluginId + a.id} onSelect={() => sendPluginEvent(a.pluginId, { kind: "action", actionId: a.id, mediaId: media.id })}>
                                        {a.props.label}
                                    </DropdownItem>
                                ))}
                            </DropdownContent>
                            </Dropdown>
                        </div>
                        <PluginActions kind="anime-page-button" mediaId={media.id} />
                    </div>
                </div>
            </div>
            </div>
        </div>
    )
}

function EpisodesTab({ entry, onStream, onTorrents }: { entry: EntryView; onStream: () => void; onTorrents: (episode?: number) => void }) {
    const { playLocal, localPlayer, remote } = usePlay()
    const { data: status } = useStatus()
    const marker = useEpisodeMarker(entry.media, entry.listEntry)
    const { data: filler } = useFiller(entry.media.id)
    const [showAll, setShowAll] = useState(false)
    const [adding, setAdding] = useState(false)
    // Episodes on their way to a playlist (its dialog open).
    const [toPlaylist, setToPlaylist] = useState<PlaylistItem[] | null>(null)
    const media = entry.media

    const withFiles = entry.episodes.filter(e => e.hasFile)
    // Gaps between the episodes there: found as torrents from here.
    const missing = missingEpisodes(withFiles.map(e => e.number), media).gaps
    const hosts = [...new Set(withFiles.map(e => e.file?.hostName).filter((h): h is string => !!h))]
    const list = showAll ? entry.episodes : withFiles
    const specials = [...(entry.specials ?? []), ...(entry.others ?? [])]
    // An episode with its file, as a playlist item.
    const playlistItem = (ep: EntryView["episodes"][number]): PlaylistItem | null =>
        ep.file ? { mediaId: media.id, episode: ep.number, title: title(media), image: ep.image || cover(media), play: { kind: "local", path: ep.file.path } } : null
    const lastFile = withFiles.reduce((m, e) => Math.max(m, e.number), 0)
    // This episode and the ones after it with files.
    const restOf = (from: number) =>
        withFiles
            .filter(e => e.number >= from)
            .sort((a, b) => a.number - b.number)
            .map(playlistItem)
            .filter((x): x is PlaylistItem => !!x)

    // Files on this computer, or shared with it by another Aniko.
    if (entry.localCount + (entry.sharedCount ?? 0) === 0) {
        return (
            <div className="flex flex-col gap-10">
                <EmptyState
                    icon={<HardDrive className="size-6" />}
                    title="No files yet"
                    action={
                        <div className="flex flex-wrap justify-center gap-2">
                            {status?.settings.onlineStream.enabled !== false && (
                                <Button variant="primary" icon={<Tv className="size-4" />} onClick={onStream}>
                                    Watch online
                                </Button>
                            )}
                            <Button icon={<Magnet className="size-4" />} onClick={() => onTorrents()}>
                                Find torrents
                            </Button>
                            <Button icon={<FolderInput className="size-4" />} onClick={() => setAdding(true)}>
                                Add from library
                            </Button>
                            <AddFromLibraryDialog open={adding} onOpenChange={setAdding} media={media} />
                        </div>
                    }
                />
                <WatchOrder mediaId={media.id} />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <p className="min-w-0 text-muted">
                    <span className="tabular-nums">
                        {withFiles.length} of {entry.episodes.length || "?"}
                    </span>{" "}
                    {entry.localCount ? "downloaded" : "available"}
                    {hosts.length > 0 && ` · ${entry.localCount ? "some " : ""}on ${hosts.join(", ")}`}
                </p>
                {missing.length > 0 && (
                    <button onClick={() => onTorrents(missing[0])} className="focus-ring rounded text-amber-200/85 hover:underline" title="Find torrents">
                        Missing {formatRanges(missing, 5)}
                    </button>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
                    <LocalLanguageSwitch mediaId={media.id} samplePath={withFiles[0]?.file?.path} />
                    {entry.episodes.length > withFiles.length && (
                        <button onClick={() => setShowAll(s => !s)} aria-pressed={showAll} className="focus-ring rounded font-medium text-muted transition-colors hover:text-fg">
                            {showAll ? "Downloaded only" : "All episodes"}
                        </button>
                    )}
                    <EntryFilesMenu entry={entry} />
                </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-x-5 gap-y-6">
                {list.map(ep => {
                    const play = () => (ep.file ? playLocal(ep.file.path, media.id, ep.number) : onStream())
                    const canMark = ep.aired || ep.hasFile
                    return (
                        <EpisodeCard
                            key={ep.number}
                            image={ep.image}
                            number={ep.number}
                            epLabel={media.format === "MOVIE" ? false : undefined}
                            title={media.format === "MOVIE" ? title(media) : ep.title || undefined}
                            tag={fillerFact(ep.number, filler)}
                            // Length · air date · the file's size and quality.
                            facts={[
                                !!ep.runtime && `${ep.runtime}m`,
                                ep.airDate,
                                ep.file && formatBytes(ep.file.size),
                                ep.file?.parsed?.resolution,
                                ep.file?.hostName && `on ${ep.file.hostName}`,
                                ep.resumeAt > 0 && `at ${formatDuration(ep.resumeAt)}`,
                                !ep.aired && !ep.hasFile && "Not aired",
                            ]}
                            watched={ep.watched}
                            hasFile={ep.hasFile}
                            aired={ep.hasFile || ep.aired}
                            resumeAt={ep.resumeAt}
                            progress={ep.history?.duration ? ep.resumeAt / ep.history.duration : 0}
                            blur={status?.settings.ui.blurUnwatched}
                            onClick={play}
                            actions={canMark && <WatchedToggle watched={ep.watched} disabled={marker.pending} onToggle={() => marker.mark(ep.number, !ep.watched)} />}
                            menu={
                                <>
                                    {ep.file && (
                                        <DropdownLabel>
                                            <span className="block max-w-72 truncate" title={ep.file.name}>
                                                {ep.file.name}
                                            </span>
                                        </DropdownLabel>
                                    )}
                                    {canMark && (
                                        <DropdownItem icon={<Play />} onSelect={play}>
                                            {ep.file ? (ep.resumeAt > 0 ? "Resume" : "Play") : "Watch online"}
                                        </DropdownItem>
                                    )}
                                    {ep.file && !remote && (
                                        <DropdownItem icon={<MonitorPlay />} onSelect={() => playLocal(ep.file!.path, media.id, ep.number, { player: localPlayer() === "mpv" ? "builtin" : "mpv" })}>
                                            Play in {localPlayer() === "mpv" ? "in-app player" : "mpv"}
                                        </DropdownItem>
                                    )}
                                    {ep.file && ep.resumeAt > 0 && (
                                        <DropdownItem icon={<RotateCcw />} onSelect={() => playLocal(ep.file!.path, media.id, ep.number, { start: 0 })}>
                                            Play from the beginning
                                        </DropdownItem>
                                    )}
                                    {!ep.file && (
                                        <DropdownItem icon={<Magnet />} onSelect={() => onTorrents(ep.number)}>
                                            Find torrents
                                        </DropdownItem>
                                    )}
                                    {ep.file && (
                                        <DropdownItem icon={<ListPlus />} onSelect={() => setToPlaylist([playlistItem(ep)!])}>
                                            Add to playlist…
                                        </DropdownItem>
                                    )}
                                    {ep.file && ep.number < lastFile && (
                                        <DropdownItem icon={<ListEnd />} onSelect={() => setToPlaylist(restOf(ep.number))}>
                                            Add the rest of the season…
                                        </DropdownItem>
                                    )}
                                    <DropdownItem icon={<CheckCheck />} onSelect={() => marker.mark(ep.number, !ep.watched)}>
                                        {ep.watched ? "Mark as unwatched" : "Mark as watched (and everything before)"}
                                    </DropdownItem>
                                </>
                            }
                        />
                    )
                })}
            </div>
            {specials.length > 0 && (
                <div>
                    <h3 className="mb-3 text-sm font-medium text-muted">Specials & extras</h3>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-x-5 gap-y-6">
                        {specials.map(sp => (
                            <EpisodeCard
                                key={sp.file?.path}
                                image={media.bannerImage || cover(media)}
                                number={sp.number}
                                title={sp.title}
                                epLabel={false}
                                facts={[sp.kind === "nc" ? "Opening / ending" : "Special", sp.file && formatBytes(sp.file.size), sp.file?.parsed?.resolution]}
                                hasFile
                                onClick={() => sp.file && playLocal(sp.file.path, media.id, 0)}
                            />
                        ))}
                    </div>
                </div>
            )}
            {entry.metadataNote && <p className="text-xs text-subtle">{entry.metadataNote}</p>}
            <WatchOrder mediaId={media.id} />
            <AddToPlaylistDialog items={toPlaylist} onClose={() => setToPlaylist(null)} />
        </div>
    )
}

// Sub/Dub for dual-audio files: shown when the files have an English and an
// original-language audio track (found by language tag or track title).
function LocalLanguageSwitch({ mediaId, samplePath }: { mediaId: number; samplePath?: string }) {
    const classic = useClassic()
    const language = useLanguageMode(mediaId)
    const { data: probe } = useQuery({
        queryKey: ["probe", samplePath],
        queryFn: () => api.get<Probe>(`/api/local/probe?path=${encodeURIComponent(samplePath!)}`),
        enabled: !!samplePath,
        staleTime: Infinity,
        retry: false,
    })
    const audio = probe?.audio ?? []
    const english = (a: { language: string; title: string }) => !/commentary/i.test(a.title ?? "") && (/^(eng?)$/i.test((a.language ?? "").trim()) || /english|dub|\beng\b/i.test(a.title ?? ""))
    const dual = audio.length > 1 && audio.some(english) && audio.some(a => !english(a))
    if (!dual || !language.loaded) return null
    const mode = language.mode ?? "sub"
    const names = (want: boolean) => audio.filter(a => english(a) === want).map(a => a.title || a.language.toUpperCase()).filter(Boolean)[0]
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-subtle">Audio</span>
            <div className={switchBox(classic)}>
                {(["sub", "dub"] as const).map(m => (
                    <Tooltip key={m} content={m === "dub" ? `English audio${names(true) ? ` (${names(true)})` : ""}, signs & songs subtitles` : `Original audio${names(false) ? ` (${names(false)})` : ""} with full subtitles`}>
                        <button
                            onClick={() => {
                                language.set(m)
                                toast.success(m === "dub" ? "Switched to dub" : "Switched to sub")
                            }}
                            data-on={mode === m || undefined}
                            className={switchItem(classic, mode === m)}
                        >
                            {m}
                        </button>
                    </Tooltip>
                ))}
            </div>
        </div>
    )
}

function DetailsTab({ entry }: { entry: EntryView }) {
    const classic = useClassic()
    const media = entry.media
    const relations = (media.relations?.edges ?? []).filter(e => e.node && ["ANIME", "MANGA"].includes(e.node.type))
    const recs = (media.recommendations?.nodes ?? []).map(n => n.mediaRecommendation).filter(Boolean)
    const chars = media.characters?.edges ?? []
    const tags = (media.tags ?? []).filter(t => !t.isMediaSpoiler).slice(0, 18)
    const rankings = useMemo(() => (media.rankings ?? []).slice(0, 4), [media.rankings])
    return (
        <div className="flex flex-col gap-10">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoCard label="Format" value={formatLabel(media.format)} icon={<Film className="size-4" />} />
                <InfoCard label="Source" value={(media.source ?? "").replace(/_/g, " ").toLowerCase()} icon={<Info className="size-4" />} />
                <InfoCard
                    label="Aired"
                    value={[media.startDate, media.endDate]
                        .map(d => (d?.year ? `${d.year}-${String(d.month ?? 1).padStart(2, "0")}-${String(d.day ?? 1).padStart(2, "0")}` : ""))
                        .filter(Boolean)
                        .join(" → ")}
                    icon={<CalendarClock className="size-4" />}
                />
                <InfoCard label="Popularity" value={media.popularity ? media.popularity.toLocaleString() : "—"} icon={<Users className="size-4" />} />
            </div>
            <WatchOrder mediaId={media.id} />
            {rankings.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {rankings.map((r, i) => (
                        <Badge key={i} tone="brand">
                            #{r.rank} {r.context} {r.season ? seasonLabel(r.season, r.year) : r.year ?? ""}
                        </Badge>
                    ))}
                </div>
            )}
            {tags.length > 0 && (
                <div>
                    <h3 className="mb-3 text-lg font-semibold tracking-tight">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                        {tags.map(t => (
                            <span key={t.name} className="rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-sm">
                                {t.name} <span className="text-subtle">{t.rank}%</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {chars.length > 0 && (
                <div>
                    <h3 className="mb-4 text-lg font-semibold tracking-tight">Characters</h3>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {chars.map(c => (
                            <div key={c.node.id} className="card flex items-center justify-between gap-3 overflow-hidden p-0">
                                <div className="flex items-center gap-3">
                                    <img src={img(c.node.image.large)} alt="" loading="lazy" className="h-20 w-14 object-cover" />
                                    <div>
                                        <p className="text-sm font-semibold">{c.node.name.full}</p>
                                        <p className="text-xs text-subtle capitalize">{c.role.toLowerCase()}</p>
                                    </div>
                                </div>
                                {c.voiceActors[0] && (
                                    <div className="flex items-center gap-3 text-right">
                                        <div>
                                            <p className="text-sm font-medium">{c.voiceActors[0].name.full}</p>
                                            <p className="text-xs text-subtle">Japanese</p>
                                        </div>
                                        <img src={img(c.voiceActors[0].image.large)} alt="" loading="lazy" className="h-20 w-14 object-cover" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {relations.length > 0 && (
                <div>
                    <h3 className="mb-4 text-lg font-semibold tracking-tight">Related</h3>
                    <Carousel>
                        {relations.map(r => (
                            <div key={r.node.id}>
                                <p className="mb-2 text-xs font-medium text-subtle capitalize">{r.relationType.replace(/_/g, " ").toLowerCase()}</p>
                                <MediaCard media={r.node} />
                            </div>
                        ))}
                    </Carousel>
                </div>
            )}
            {recs.length > 0 && (
                <div>
                    <h3 className="mb-4 text-lg font-semibold tracking-tight">Recommendations</h3>
                    <Carousel>{recs.map(m => <MediaCard key={m!.id} media={m!} />)}</Carousel>
                </div>
            )}
            {media.trailer?.site === "youtube" && (
                <a href={`https://www.youtube.com/watch?v=${media.trailer.id}`} target="_blank" rel="noopener noreferrer" className="marks on-dark group relative block w-full max-w-xl overflow-hidden rounded-lg">
                    <img src={img(media.trailer.thumbnail)} alt="" className="aspect-video w-full object-cover transition-[filter] duration-300 group-hover:brightness-110" />
                    <span className="absolute inset-0 grid place-items-center bg-black/40">
                        <span className={cn("flex items-center gap-2 bg-white px-4", classic ? "rounded-full py-2 text-sm font-medium text-neutral-950" : "label rounded-sm py-2.5 text-black")}>
                            <Play className="size-4 fill-current" /> Watch trailer
                        </span>
                    </span>
                </a>
            )}
        </div>
    )
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
    return (
        <div className="card flex items-center gap-4 p-4">
            <span className="grid size-9 place-items-center rounded-lg bg-white/[0.05] text-muted [&_svg]:size-[18px]">{icon}</span>
            <div>
                <p className="text-xs text-subtle">{label}</p>
                <p className="font-medium capitalize">{value || "—"}</p>
            </div>
        </div>
    )
}

function EntrySkeleton() {
    return (
        <div className="px-6 pt-[200px] md:px-8 xl:px-10">
            <div className="flex gap-8">
                <Skeleton className="aspect-[2/3] w-56" />
                <div className="flex flex-1 flex-col justify-end gap-4">
                    <Skeleton className="h-12 w-2/3" />
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-20 w-full max-w-3xl" />
                    <Skeleton className="h-12 w-72" />
                </div>
            </div>
        </div>
    )
}
