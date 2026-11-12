import { RefreshCw, Check, CheckCheck, ChevronDown, FolderOpen, FolderSearch, FolderSync, HardDrive, Info, LayoutGrid, List as ListIcon, Play, Search, Share2, SlidersHorizontal, Upload } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "@/lib/toast"
import { EpisodeCard } from "@/components/EpisodeCard"
import { Carousel, MediaCard, MediaCardSkeleton, MediaGrid } from "@/components/MediaCard"
import { useLibraryCardMenu } from "@/components/library/LibraryCardMenu"
import { UploadDialog, useUploadTargets } from "@/components/UploadDialog"
import { Button, Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger, EmptyState, IconButton, Input, Progress, Tabs, Tooltip } from "@/components/ui"
import { api } from "@/lib/api"
import { usePersisted } from "@/lib/hooks"
import { usePlay } from "@/lib/play"
import { useCollection, useEpisodeMarker, useLibraryFiles, useScan, useSharedLibraries, useStatus } from "@/lib/queries"
import { scanStore, useStore } from "@/lib/store"
import { useClassic } from "@/lib/themes"
import { tv } from "@/lib/tv"
import type { CollectionItem, LocalFile } from "@/lib/types"
import { banner, cn, cover, entryUrl, formatBytes, formatLabel, LIST_STATUS, mostCommon, relativeTime, title, totalEpisodes } from "@/lib/utils"

// "Local library": only anime that have files on this computer.

type Group = {
    item: CollectionItem
    files: LocalFile[] // main episodes first (by number), then specials / NC
    episodes: number[] // distinct downloaded main episode numbers
    size: number
    latest: number // newest file, unix seconds
    resolutions: string[]
    releaseGroups: string[]
    dir: string
    unwatched: number
    next: LocalFile | null // first downloaded episode not watched yet
}

type StatusFilter = "ALL" | "CURRENT" | "PLANNING" | "COMPLETED" | "PAUSED" | "DROPPED" | "NONE"
type SortKey = "added" | "title" | "unwatched" | "episodes" | "size"
type View = "grid" | "list"

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "CURRENT", label: "Watching" },
    { value: "PLANNING", label: "Planning" },
    { value: "COMPLETED", label: "Completed" },
    { value: "PAUSED", label: "Paused" },
    { value: "DROPPED", label: "Dropped" },
    { value: "NONE", label: "Not on my list" },
]

function statusOf(g: Group): StatusFilter {
    const s = g.item.listEntry?.status
    if (!s) return "NONE"
    return s === "REPEATING" ? "CURRENT" : (s as StatusFilter)
}

// What kind of anime: series, movies, or the OVAs, ONAs and specials.
type TypeFilter = "ALL" | "TV" | "MOVIE" | "EXTRA"
const TYPES: { value: TypeFilter; label: string }[] = [
    { value: "ALL", label: "All types" },
    { value: "TV", label: "TV series" },
    { value: "MOVIE", label: "Movies" },
    { value: "EXTRA", label: "OVAs, ONAs & specials" },
]
function typeOf(g: Group): TypeFilter {
    const f = g.item.media.format
    return f === "MOVIE" ? "MOVIE" : f === "OVA" || f === "ONA" || f === "SPECIAL" || f === "MUSIC" ? "EXTRA" : "TV"
}

const SORTS: { value: SortKey; label: string }[] = [
    { value: "added", label: "Recently added" },
    { value: "title", label: "Title" },
    { value: "unwatched", label: "Most unwatched" },
    { value: "episodes", label: "Most episodes" },
    { value: "size", label: "Largest on disk" },
]

// A menu row's mark: a tick on the one that's chosen.
const tick = (on: boolean) => (on ? <Check /> : <span className="block size-4" />)

const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))]

// [1, 2, 3, 5, 7, 8] -> "1–3, 5, 7–8"
function episodeRanges(nums: number[]) {
    const s = [...new Set(nums)].sort((a, b) => a - b)
    const out: string[] = []
    for (let i = 0; i < s.length; ) {
        let j = i
        while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
        out.push(i === j ? `${s[i]}` : `${s[i]}–${s[j]}`)
        i = j + 1
    }
    return out.join(", ")
}

function buildGroups(items: CollectionItem[], files: LocalFile[]): Group[] {
    const byMedia = new Map<number, LocalFile[]>()
    for (const f of files) {
        if (f.ignored || !f.mediaId) continue
        const list = byMedia.get(f.mediaId)
        if (list) list.push(f)
        else byMedia.set(f.mediaId, [f])
    }
    const rank = (k: string) => (k === "main" ? 0 : k === "special" ? 1 : 2)
    const out: Group[] = []
    for (const item of items) {
        const fs = byMedia.get(item.media.id)
        if (!fs?.length) continue
        fs.sort((a, b) => rank(a.kind) - rank(b.kind) || a.episode - b.episode || a.name.localeCompare(b.name))
        const main = fs.filter(f => f.kind === "main")
        const le = item.listEntry
        const watchedUpTo = le?.status === "COMPLETED" ? Infinity : (le?.progress ?? 0)
        const unwatched = main.filter(f => f.episode > watchedUpTo)
        out.push({
            item,
            files: fs,
            episodes: [...new Set(main.map(f => f.episode))],
            size: fs.reduce((n, f) => n + f.size, 0),
            latest: Math.max(...fs.map(f => f.modTime)),
            resolutions: uniq(fs.map(f => f.parsed?.resolution)),
            releaseGroups: uniq(fs.map(f => f.parsed?.releaseGroup)),
            dir: mostCommon(fs.map(f => f.dir)),
            unwatched: new Set(unwatched.map(f => f.episode)).size,
            next: unwatched[0] ?? null,
        })
    }
    return out
}

export default function LocalLibraryPage() {
    const classic = useClassic()
    const { data: status } = useStatus()
    const { data: coll, isLoading: collLoading, error } = useCollection()
    const { data: localFiles, isLoading: filesLoading } = useLibraryFiles()
    // The libraries other Aniko apps on the network share with this one.
    const { data: shared } = useSharedLibraries()
    const [source, setSource] = usePersisted<string>("aniko-local-source", "local")
    // This computer's library off (Settings › Local library): only the
    // shared ones, the first one to begin with.
    const off = !!status?.settings.library.off
    const host = off ? (shared?.find(l => l.host.id === source) ?? shared?.[0]) : source === "local" ? undefined : shared?.find(l => l.host.id === source)
    const files = host ? host.files : localFiles
    const scan = useScan()
    const scanning = useStore(scanStore, s => s.running)
    const scanState = useStore(scanStore)
    const { playLocal } = usePlay()
    const navigate = useNavigate()
    const libraryMenu = useLibraryCardMenu()

    const [filter, setFilter] = usePersisted<StatusFilter>("aniko-local-filter", "ALL")
    const [sort, setSort] = usePersisted<SortKey>("aniko-local-sort", "added")
    const [view, setView] = usePersisted<View>("aniko-local-view", "grid")
    const [q, setQ] = useState("")

    const groups = useMemo(() => {
        const items = new Map<number, CollectionItem>()
        for (const l of coll?.lists ?? []) for (const it of l.items) items.set(it.media.id, it)
        for (const it of coll?.localOnly ?? []) items.set(it.media.id, it)
        return buildGroups([...items.values()], files ?? [])
    }, [coll, files])

    // Each filter's counts are of what the other one shows (Paused under
    // Movies: the paused movies).
    const [type, setType] = usePersisted<TypeFilter>("aniko-local-type", "ALL")
    const counts = useMemo(() => {
        const of = type !== "ALL" && TYPES.some(t => t.value === type) && groups.some(g => typeOf(g) === type) ? groups.filter(g => typeOf(g) === type) : groups
        const c: Record<string, number> = { ALL: of.length }
        for (const g of of) c[statusOf(g)] = (c[statusOf(g)] ?? 0) + 1
        return c
    }, [groups, type])
    // Tabs without anime are hidden, so a remembered filter may have no tab
    // any more: fall back to All.
    const activeFilter: StatusFilter = filter !== "ALL" && STATUS_TABS.some(t => t.value === filter) && counts[filter] > 0 ? filter : "ALL"
    const typeCounts = useMemo(() => {
        const of = activeFilter === "ALL" ? groups : groups.filter(g => statusOf(g) === activeFilter)
        const c: Record<string, number> = { ALL: of.length }
        for (const g of of) c[typeOf(g)] = (c[typeOf(g)] ?? 0) + 1
        return c
    }, [groups, activeFilter])
    // The same for a remembered type with no anime any more.
    const activeType: TypeFilter = type !== "ALL" && TYPES.some(t => t.value === type) && typeCounts[type] > 0 ? type : "ALL"

    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase()
        const out = groups.filter(g => {
            if (activeFilter !== "ALL" && statusOf(g) !== activeFilter) return false
            if (activeType !== "ALL" && typeOf(g) !== activeType) return false
            if (!needle) return true
            const m = g.item.media
            return [m.title.userPreferred, m.title.romaji, m.title.english, m.title.native, ...(m.synonyms ?? [])].some(t => t?.toLowerCase().includes(needle))
        })
        out.sort((a, b) => {
            switch (sort) {
                case "title":
                    return title(a.item.media).localeCompare(title(b.item.media))
                case "unwatched":
                    return b.unwatched - a.unwatched || b.latest - a.latest
                case "episodes":
                    return b.episodes.length - a.episodes.length
                case "size":
                    return b.size - a.size
                default:
                    return b.latest - a.latest
            }
        })
        return out
    }, [groups, activeFilter, activeType, sort, q])

    // Newest files on disk, one card per anime and day (a batch of 12
    // episodes shows up as "Episodes 1–12", not twelve cards).
    const recent = useMemo(() => {
        const media = new Map(groups.map(g => [g.item.media.id, g]))
        const batches = new Map<string, { group: Group; files: LocalFile[]; latest: number }>()
        const sorted = (files ?? []).filter(f => !f.ignored && f.mediaId && f.kind === "main" && media.has(f.mediaId)).sort((a, b) => b.modTime - a.modTime)
        for (const f of sorted) {
            const key = `${f.mediaId}:${new Date(f.modTime * 1000).toDateString()}`
            const b = batches.get(key)
            if (b) b.files.push(f)
            else if (batches.size < 16) batches.set(key, { group: media.get(f.mediaId)!, files: [f], latest: f.modTime })
        }
        return [...batches.values()].map(b => {
            b.files.sort((x, y) => x.episode - y.episode)
            const le = b.group.item.listEntry
            const watchedUpTo = le?.status === "COMPLETED" ? Infinity : (le?.progress ?? 0)
            return { ...b, play: b.files.find(f => f.episode > watchedUpTo) ?? b.files[0], allWatched: b.files.every(f => f.episode <= watchedUpTo) }
        })
    }, [files, groups])

    const totals = useMemo(
        () => ({
            episodes: groups.reduce((n, g) => n + g.episodes.length, 0),
            size: groups.reduce((n, g) => n + g.size, 0),
        }),
        [groups],
    )

    const loading = collLoading || filesLoading
    const libraryDir = off ? undefined : status?.settings.library.dir
    const trusted = status?.client !== "lan"
    const openFolder = (path?: string) => path && api.post("/api/open", { path }).catch(e => toast.error(e.message))
    // Files from this computer to a server (one that takes this device's
    // downloads: mediaserver, say).
    const uploads = useUploadTargets(trusted && !tv)
    const [uploading, setUploading] = useState(false)
    const canUpload = !!uploads.data?.length
    const uploadButton = canUpload && (
        <IconButton label="Upload" variant="subtle" className="rounded-xl" onClick={() => setUploading(true)}>
            <Upload className="size-4" />
        </IconButton>
    )
    // The one line under the title: whose library it is, and how much is in it.
    const summary = [
        host ? `Shared by ${host.host.name}${host.host.online ? "" : ", not answering"}` : "",
        !loading && groups.length > 0 ? `${groups.length} anime · ${totals.episodes} ${totals.episodes === 1 ? "episode" : "episodes"} · ${formatBytes(totals.size)}` : "",
    ]
        .filter(Boolean)
        .join(" · ")
    // Kinds of anime in what's shown: the choice is only offered with more than one.
    const types = TYPES.filter(t => t.value !== "ALL" && typeCounts[t.value])

    return (
        <div className="min-h-full pb-24">
            {canUpload && <UploadDialog open={uploading} onOpenChange={setUploading} target={host?.host.id} />}
            <header className="flex flex-col gap-5 px-6 pt-8 md:px-8 xl:px-10">
                <div className="flex items-center justify-between gap-4">
                    <h1 className="min-w-0 truncate text-[1.75rem] font-semibold tracking-tight">Local library</h1>
                    {/* The library's tools are in the sidebar: not repeated here. */}
                    <div className="flex shrink-0 items-center gap-2">
                        {uploadButton}
                        {!host && !off && trusted && libraryDir && (
                            <IconButton label="Open library folder" variant="subtle" className="rounded-xl" onClick={() => openFolder(libraryDir)}>
                                <FolderOpen className="size-4" />
                            </IconButton>
                        )}
                        {!host && !off && (
                            <Tooltip content="Scan for new files">
                                <Button variant="primary" className="rounded-xl" loading={scanning || scan.isPending} icon={<FolderSync className="size-4" />} onClick={() => scan.mutate(false)}>
                                    {scanning ? "Scanning…" : "Scan"}
                                </Button>
                            </Tooltip>
                        )}
                    </div>
                </div>
                {(summary || !!coll?.incomplete || (!host && !!coll?.unmatchedCount)) && (
                    <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                        {summary && <p className="tabular-nums">{summary}</p>}
                        {!!coll?.incomplete && (
                            <p className="flex items-center gap-2">
                                <RefreshCw className="size-3.5 shrink-0 animate-spin" />
                                {coll.incomplete} still being looked up
                            </p>
                        )}
                        {!host && !!coll?.unmatchedCount && (
                            <Link to="/library?tab=unmatched" className="flex items-center gap-1.5 text-amber-200 transition-colors hover:text-amber-100">
                                <FolderSearch className="size-4" />
                                {coll.unmatchedCount} unmatched {coll.unmatchedCount === 1 ? "file" : "files"}
                            </Link>
                        )}
                    </div>
                )}
                {!!shared?.length && (!off || shared.length > 1) && (
                    <Tabs
                        className="self-start"
                        value={host ? host.host.id : "local"}
                        onChange={setSource}
                        tabs={[
                            ...(off ? [] : [{ value: "local", label: "This computer", icon: <HardDrive className="size-4" /> }]),
                            ...shared.map(l => ({ value: l.host.id, label: l.host.name, icon: <Share2 className="size-4" /> })),
                        ]}
                    />
                )}
            </header>

            <div className="flex flex-col gap-8 px-6 pt-8 md:px-8 xl:px-10">
                {error && <EmptyState title="Couldn't load your library">{(error as Error).message}</EmptyState>}

                {scanning && groups.length === 0 && (
                    <div className="card mx-auto w-full max-w-xl p-6 rise-in">
                        <div className="flex items-center gap-3">
                            <FolderSync className="size-5 animate-pulse text-brand-strong" />
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold">Scanning your library…</p>
                                <p className="truncate text-sm text-muted">{scanState.message || "Looking for video files…"}</p>
                            </div>
                        </div>
                        <Progress value={scanState.total > 0 ? scanState.done / scanState.total : 0} className={cn("mt-4 h-1.5", scanState.total === 0 && "animate-pulse")} />
                        <p className="mt-3 text-xs text-subtle">
                            A big first scan can take a few minutes.
                        </p>
                    </div>
                )}

                {host && !loading && groups.length === 0 && (
                    <EmptyState icon={<Share2 className="size-6" />} title="Nothing to show yet">
                        {host.host.name} shares {host.files.length} {host.files.length === 1 ? "file" : "files"}. Still looking them up on AniList.
                    </EmptyState>
                )}

                {!host && off && !loading && (
                    <EmptyState
                        icon={<Share2 className="size-6" />}
                        title="This computer's library is off"
                        action={
                            <Button variant="primary" onClick={() => navigate("/settings?tab=devices")}>
                                Other devices
                            </Button>
                        }
                    >
                        No other device is sharing one right now.
                    </EmptyState>
                )}

                {!host && !off && !loading && !scanning && groups.length === 0 && !error && (
                    <EmptyState
                        icon={<HardDrive className="size-6" />}
                        title={libraryDir ? "No downloaded anime yet" : "Choose your library folder"}
                        action={
                            libraryDir ? (
                                <Button loading={scanning} icon={<FolderSync className="size-4" />} onClick={() => scan.mutate(false)}>
                                    Scan now
                                </Button>
                            ) : (
                                <Button variant="primary" onClick={() => navigate("/settings?tab=library")}>
                                    Open settings
                                </Button>
                            )
                        }
                    >
                        {libraryDir ? (
                            <>
                                Download episodes, or copy video files to <span className="font-mono text-fg/80">{libraryDir}</span>.
                            </>
                        ) : (
                            "Pick the folder your anime is in."
                        )}
                    </EmptyState>
                )}

                {recent.length > 0 && !q && (
                    <section className="rise-in" data-tv-autofocus>
                        <h2 className="mb-4 text-xl font-semibold tracking-tight">Recently added</h2>
                        <Carousel itemClassName="w-[300px]">
                            {recent.map(({ group, files: batch, latest, play, allWatched }) => {
                                const m = group.item.media
                                const eps = m.format === "MOVIE" ? "Movie" : batch.length > 1 ? `Episodes ${episodeRanges(batch.map(f => f.episode))}` : `Episode ${batch[0].episode}`
                                return (
                                    <EpisodeCard
                                        key={`${m.id}:${latest}`}
                                        image={banner(m) || cover(m)}
                                        number={play.episode}
                                        title={title(m)}
                                        subtitle={`${eps} · added ${relativeTime(latest)}`}
                                        hasFile
                                        watched={allWatched}
                                        onClick={() => playLocal(play.path, m.id, play.episode)}
                                        actions={
                                            <IconButton label="Open anime page" variant="ghost" size="xs" className="bg-black/70 text-white hover:bg-black/85 hover:text-white" onClick={e => (e.stopPropagation(), navigate(entryUrl(m)))}>
                                                <Info className="size-3.5" />
                                            </IconButton>
                                        }
                                    />
                                )
                            })}
                        </Carousel>
                    </section>
                )}

                {(loading || groups.length > 0) && (
                    <section>
                        {/* One row: the list they're on, a title filter, and the rest (kind, order, view) in one menu. */}
                        <div className="mb-6 flex flex-wrap items-center gap-3">
                            <Tabs value={activeFilter} onChange={setFilter} tabs={STATUS_TABS.filter(t => t.value === "ALL" || counts[t.value])} />
                            <div className="flex min-w-0 flex-1 items-center gap-2 sm:ml-auto sm:flex-none">
                                <div className="min-w-0 flex-1 sm:w-60 sm:flex-none">
                                    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by title…" aria-label="Filter by title" icon={<Search className="size-4" />} className="rounded-xl" />
                                </div>
                                <Dropdown>
                                    <DropdownTrigger asChild>
                                        <IconButton label="Type, sort and view" variant="subtle" className={cn("rounded-xl", activeType !== "ALL" && (classic ? "text-brand-strong" : "border-b border-fg text-fg"))}>
                                            <SlidersHorizontal className="size-4" />
                                        </IconButton>
                                    </DropdownTrigger>
                                    <DropdownContent>
                                        {/* Only with more than one kind there. */}
                                        {types.length > 1 && (
                                            <>
                                                <DropdownLabel>Type</DropdownLabel>
                                                {TYPES.filter(t => t.value === "ALL" || typeCounts[t.value]).map(t => (
                                                    <DropdownItem key={t.value} icon={tick(activeType === t.value)} onSelect={() => setType(t.value)}>
                                                        {t.label}
                                                        <span className="ml-auto pl-4 text-xs text-subtle tabular-nums">{typeCounts[t.value] ?? 0}</span>
                                                    </DropdownItem>
                                                ))}
                                                <DropdownSeparator />
                                            </>
                                        )}
                                        <DropdownLabel>Sort by</DropdownLabel>
                                        {SORTS.map(o => (
                                            <DropdownItem key={o.value} icon={tick(sort === o.value)} onSelect={() => setSort(o.value)}>
                                                {o.label}
                                            </DropdownItem>
                                        ))}
                                        <DropdownSeparator />
                                        <DropdownLabel>View</DropdownLabel>
                                        <DropdownItem icon={<LayoutGrid />} onSelect={() => setView("grid")}>
                                            Grid
                                            {view === "grid" && <Check className="ml-auto size-4 text-muted" />}
                                        </DropdownItem>
                                        <DropdownItem icon={<ListIcon />} onSelect={() => setView("list")}>
                                            List
                                            {view !== "grid" && <Check className="ml-auto size-4 text-muted" />}
                                        </DropdownItem>
                                    </DropdownContent>
                                </Dropdown>
                            </div>
                        </div>

                        {loading ? (
                            <MediaGrid>
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <MediaCardSkeleton key={i} />
                                ))}
                            </MediaGrid>
                        ) : shown.length === 0 ? (
                            <EmptyState icon={<Search className="size-6" />} title="Nothing matches">
                                Try another filter or search.
                            </EmptyState>
                        ) : view === "grid" ? (
                            <MediaGrid size={status?.settings.ui.cardSize} start>
                                {shown.map(g => (
                                    <MediaCard
                                        key={g.item.media.id}
                                        media={g.item.media}
                                        listEntry={g.item.listEntry}
                                        localCount={g.files.length}
                                        downloaded={g.episodes}
                                        menu={libraryMenu.menu(g.item.media)}
                                    />
                                ))}
                            </MediaGrid>
                        ) : (
                            // This look: rows on hairlines, not a box each.
                            <div className={cn("flex flex-col", classic ? "gap-3" : "border-t border-line")}>
                                {shown.map(g => (
                                    <LibraryRow key={g.item.media.id} group={g} trusted={trusted && !host} onOpen={openFolder} onPlay={f => playLocal(f.path, f.mediaId, f.episode)} />
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </div>
            {libraryMenu.dialog}
        </div>
    )
}

function LibraryRow({ group: g, trusted, onOpen, onPlay }: { group: Group; trusted: boolean; onOpen: (path: string) => void; onPlay: (f: LocalFile) => void }) {
    const [open, setOpen] = useState(false)
    const m = g.item.media
    const le = g.item.listEntry
    const total = totalEpisodes(m)
    const isMovie = m.format === "MOVIE"
    const extras = g.files.length - g.files.filter(f => f.kind === "main").length
    const marker = useEpisodeMarker(m, le)
    const classic = useClassic()

    return (
        <div className={classic ? "card overflow-hidden" : "border-b border-line"}>
            {/* On a phone the actions go under the text. */}
            <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-3", classic ? "p-4" : "py-4")}>
                <Link to={entryUrl(m)} className="shrink-0">
                    <img src={cover(m, "thumb")} alt="" loading="lazy" className="h-24 w-16 rounded-xl object-cover ring-1 ring-white/10" style={{ backgroundColor: m.coverImage?.color || undefined }} />
                </Link>
                <div className="min-w-0 flex-1">
                    <Link to={entryUrl(m)} className="line-clamp-1 text-[15px] font-semibold hover:underline">
                        {title(m)}
                    </Link>
                    <p className="mt-1 text-[13px] text-muted">
                        {[formatLabel(m.format), m.seasonYear, le ? (LIST_STATUS[le.status] ?? le.status) : "Not on your list", le && total > 0 && !isMovie ? `watched ${le.progress}/${total}` : ""].filter(Boolean).join(" · ")}
                    </p>
                    {/* What's on disk, as one line of words. */}
                    <p className="mt-1.5 text-[13px] text-subtle">
                        <span className="text-fg/85">
                            {isMovie ? "Movie" : `Ep ${episodeRanges(g.episodes)}`}
                            {!isMovie && total > 0 && ` (${g.episodes.length}/${total})`}
                        </span>
                        {g.unwatched > 0 && <span className="text-brand-strong"> · {g.unwatched} unwatched</span>}
                        {[extras > 0 ? `+${extras} extras` : "", ...g.resolutions.slice(0, 2), ...g.releaseGroups.slice(0, 2), formatBytes(g.size), `added ${relativeTime(g.latest)}`]
                            .filter(Boolean)
                            .map(x => ` · ${x}`)
                            .join("")}
                    </p>
                </div>
                <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                    {g.next && (
                        <Button size="sm" className="rounded-xl" icon={<Play className="size-4 fill-current" />} onClick={() => onPlay(g.next!)}>
                            {isMovie ? "Play" : `Ep ${g.next.episode}`}
                        </Button>
                    )}
                    {trusted && g.dir && (
                        <IconButton label="Open folder" size="sm" className="rounded-xl" onClick={() => onOpen(g.dir)}>
                            <FolderOpen className="size-4" />
                        </IconButton>
                    )}
                    <IconButton label={open ? "Hide files" : "Show files"} size="sm" className="rounded-xl" onClick={() => setOpen(!open)}>
                        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
                    </IconButton>
                </div>
            </div>
            {open && (
                <div className={classic ? "bg-black/20 py-1" : "pb-2"}>
                    {g.files.map(f => {
                        const watched = le?.status === "COMPLETED" || (f.kind === "main" && (le?.progress ?? 0) >= f.episode)
                        return (
                            <div key={f.path} className={cn("group/file flex w-full items-center gap-3 py-2 text-sm transition hover:bg-white/[0.04]", classic ? "px-4" : "px-2")}>
                                <button onClick={() => onPlay(f)} title={f.path} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                                    <span className={cn("grid size-7 shrink-0 place-items-center text-muted transition", classic ? "rounded-full bg-white/[0.06] group-hover/file:bg-brand group-hover/file:text-white" : "group-hover/file:text-fg")}>
                                        <Play className="ml-0.5 size-3 fill-current" />
                                    </span>
                                    <span className={cn("w-16 shrink-0 font-semibold tabular-nums", watched && "text-subtle")}>
                                        {f.kind === "main" ? (isMovie ? "Movie" : `Ep ${f.episode}`) : f.kind === "nc" ? "NC" : "Special"}
                                    </span>
                                    <span className={cn("min-w-0 flex-1 truncate", watched ? "text-subtle" : "text-fg/85")}>{f.name}</span>
                                </button>
                                {f.parsed?.resolution && <span className="hidden shrink-0 text-xs text-subtle sm:inline">{f.parsed.resolution}</span>}
                                <span className="w-20 shrink-0 text-right text-xs text-subtle tabular-nums">{formatBytes(f.size)}</span>
                                {f.kind === "main" && (
                                    <Tooltip content={watched ? "Mark as unwatched" : "Mark as watched"}>
                                        <button
                                            aria-label={watched ? "Mark as unwatched" : "Mark as watched"}
                                            disabled={marker.pending}
                                            onClick={() => marker.mark(f.episode, !watched)}
                                            className={cn(
                                                "grid size-7 shrink-0 place-items-center rounded-full transition disabled:opacity-50",
                                                watched ? (classic ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" : "text-emerald-300 hover:bg-white/[0.08]") : "text-subtle hover:bg-white/[0.08] hover:text-fg",
                                            )}
                                        >
                                            {watched ? <CheckCheck className="size-3.5" /> : <Check className="size-3.5" />}
                                        </button>
                                    </Tooltip>
                                )}
                            </div>
                        )
                    })}
                    {g.dir && <p className={cn("truncate py-2 font-mono text-[11px] text-subtle", classic ? "px-4" : "px-2")}>{g.dir}</p>}
                </div>
            )}
        </div>
    )
}
