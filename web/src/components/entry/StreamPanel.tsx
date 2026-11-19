import { useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CheckCheck, Download, ListEnd, ListPlus, MonitorPlay, MoreHorizontal, Play, RefreshCw, Search, Terminal, Wand2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "@/lib/toast"
import { api, qs } from "@/lib/api"
import { usePlay } from "@/lib/play"
import { installHint, installSource } from "@/lib/platform"
import { canInstallPrograms, useInstallPrograms } from "@/lib/programs"
import { useEpisodeMarker, useFiller, useLanguageMode, useOnlineProviders, useStatus, useStreamEpisodes, useStreamModes } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import { fillerFact } from "@/lib/filler"
import type { PlaylistItem } from "@/lib/playlist"
import { AddToPlaylistDialog } from "../PlaylistDialog"
import type { EntryView } from "@/lib/types"
import { cn, cover, formatDuration, readLocal, title, writeLocal } from "@/lib/utils"
import { EpisodeCard, WatchedToggle } from "../EpisodeCard"
import { Button, Dialog, Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger, EmptyState, Field, IconButton, Input, Select, Skeleton, Tooltip } from "../ui"

export function StreamPanel({ entry }: { entry: EntryView }) {
    const classic = useClassic()
    const { data: status } = useStatus()
    const settings = status?.settings
    const { data: providers } = useOnlineProviders()
    const media = entry.media
    const [provider, setProvider] = useState<string>(() => readLocal(`aniko-provider-${media.id}`) || settings?.onlineStream.defaultProvider || "ani-cli")
    // Sub/dub is remembered per anime on the server (also used by "continue
    // watching", the next-episode button and local files).
    const language = useLanguageMode(media.id)
    const { data: filler } = useFiller(media.id)
    const wantDub = language.mode ? language.mode === "dub" : settings?.aniCli.defaultMode === "dub" || !!settings?.onlineStream.preferDub
    const setDub = (d: boolean) => language.set(d ? "dub" : "sub")
    const prov = providers?.find(p => p.id === provider)
    const supportsDub = prov?.supportsDub ?? true
    // Only the versions the provider has: asked once the episodes of the
    // chosen one are in (the server then only looks for the other).
    const [modesFor, setModesFor] = useState("")
    const { data: modes, error: modesError } = useStreamModes(provider, media.id, supportsDub && modesFor === provider)
    const hasSub = !supportsDub || !modes || modes.sub
    const hasDub = supportsDub && (!modes || modes.dub)
    const dub = hasDub && (wantDub || !hasSub)
    const modesKnown = !supportsDub || !!modes || !!modesError
    const [matchOpen, setMatchOpen] = useState(false)
    const [dlOpen, setDlOpen] = useState(false)
    // Episodes on their way to a playlist (its dialog open): played from this provider, sub or dub as now.
    const [toPlaylist, setToPlaylist] = useState<PlaylistItem[] | null>(null)
    const { playStream, streamPlayer, remote } = usePlay()
    const marker = useEpisodeMarker(media, entry.listEntry)
    const qc = useQueryClient()

    useEffect(() => writeLocal(`aniko-provider-${media.id}`, provider), [provider, media.id])

    // Wait for the remembered choice, or the first request would list (and
    // remember) the default mode instead. The only version there is isn't a
    // choice to remember.
    const { data, isLoading, error, refetch, isFetching } = useStreamEpisodes(provider, media.id, dub, language.loaded, dub !== wantDub)
    useEffect(() => {
        if (language.loaded && !isLoading) setModesFor(provider)
    }, [language.loaded, isLoading, provider])
    const progress = entry.listEntry?.progress ?? 0

    const episodes = useMemo(() => {
        const meta = new Map(entry.episodes.map(e => [e.number, e]))
        return (data?.episodes ?? []).map(e => {
            const m = meta.get(Math.floor(e.number))
            return {
                number: e.number,
                title: m?.title || e.title || "",
                image: m?.image || media.bannerImage || media.coverImage?.extraLarge,
                runtime: m?.runtime,
                airDate: m?.airDate,
                watched: e.number <= progress,
                resumeAt: m?.resumeAt ?? 0,
                duration: m?.history?.duration ?? 0,
            }
        })
    }, [data, entry.episodes, media, progress])

    const refresh = async () => {
        await api.get(`/api/onlinestream/episodes${qs({ provider, mediaId: media.id, dub, refresh: 1, only: dub !== wantDub ? 1 : undefined })}`).catch(e => toast.error(e.message))
        qc.invalidateQueries({ queryKey: ["os-episodes", provider, media.id, dub] })
        if (supportsDub)
            api.get<{ sub: boolean; dub: boolean }>(`/api/onlinestream/modes${qs({ provider, mediaId: media.id, refresh: 1 })}`)
                .then(m => qc.setQueryData(["os-modes", provider, media.id], m))
                .catch(() => {})
    }

    const providerOptions = (providers ?? [{ id: "ani-cli", name: "ani-cli", builtin: true } as any]).map(p => ({ value: p.id, label: p.builtin ? "ani-cli (built-in)" : p.name }))
    const aniMissing = provider === "ani-cli" && status && !status.features.aniCli
    const otherPlayer = streamPlayer() === "mpv" ? "in-app player" : "mpv"
    // What's matched and where it plays: a muted line in the row (and in its menu).
    const notes = [
        data?.mapping && `Matched ${data.mapping.title}`,
        !remote && `Plays in ${streamPlayer() === "mpv" ? "mpv" : "the in-app player"}`,
        !remote && provider === "ani-cli" && status?.features.aniCliHost && `ani-cli on ${status.features.aniCliHost}`,
    ].filter((n): n is string => !!n)
    const download = (n: number) => api.post("/api/onlinestream/download", { provider, mediaId: media.id, episodes: [n], dub }).catch(err => toast.error(err.message))

    // A command's name in a sentence.
    const code = classic ? "rounded bg-black/40 px-1.5 py-0.5" : "font-mono text-[0.92em] text-fg"
    const streamItem = (ep: (typeof episodes)[number]): PlaylistItem => ({ mediaId: media.id, episode: ep.number, title: title(media), image: ep.image || cover(media), play: { kind: "stream", provider, dub } })
    const lastEp = episodes.reduce((m, e) => Math.max(m, e.number), 0)
    return (
        <div className="flex flex-col gap-6">
            {/* The source and the version in one row; the rest in its menu. */}
            <div className="flex flex-wrap items-center gap-2">
                <Select value={provider} onChange={setProvider} options={providerOptions} className="min-w-0 flex-1 basis-36 sm:w-56 sm:flex-none sm:basis-auto" />
                {hasSub && hasDub ? (
                    <div className={classic ? "flex shrink-0 rounded-lg bg-white/[0.04] p-0.5" : "flex shrink-0"}>
                        {(["sub", "dub"] as const).map(m => (
                            <button
                                key={m}
                                onClick={() => setDub(m === "dub")}
                                aria-pressed={(m === "dub") === dub}
                                className={cn(
                                    "focus-ring transition-colors",
                                    classic ? "h-8 rounded-md px-3.5 text-[13px] font-medium uppercase" : "word label h-9 px-3 text-[10.5px]",
                                    (m === "dub") === dub ? (classic ? "bg-white/[0.1] text-fg" : "text-fg") : "text-muted hover:text-fg",
                                )}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                ) : (
                    <Tooltip content={`${prov?.name ?? provider} only has it ${dub ? "dubbed" : "with subtitles"}`}>
                        <span className={classic ? "flex shrink-0 rounded-lg bg-white/[0.04] p-0.5" : "flex shrink-0"}>
                            <span data-on className={classic ? "grid h-8 place-items-center rounded-md bg-white/[0.1] px-3.5 text-[13px] font-medium uppercase text-fg" : "word label grid h-9 place-items-center px-3 text-[10.5px] text-fg"}>
                                {dub ? "dub" : "sub"}
                            </span>
                        </span>
                    </Tooltip>
                )}
                <p className="order-last min-w-0 basis-full truncate text-xs text-subtle sm:order-none sm:flex-1 sm:basis-0" title={notes.join(" · ")}>
                    {data?.mapping && data.mapping.score < 0.8 && <span className="text-amber-300">Low match · </span>}
                    {notes.join(" · ")}
                </p>
                <IconButton label="Download episodes" variant="subtle" disabled={!episodes.length} onClick={() => setDlOpen(true)}>
                    <Download className="size-4" />
                </IconButton>
                <Dropdown>
                    <DropdownTrigger asChild>
                        <IconButton variant="subtle" aria-label="More">
                            {isFetching ? <RefreshCw className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                        </IconButton>
                    </DropdownTrigger>
                    <DropdownContent>
                        {notes.map(n => (
                            <DropdownLabel key={n}>
                                <span className="block max-w-72 truncate">{n}</span>
                            </DropdownLabel>
                        ))}
                        {notes.length > 0 && <DropdownSeparator />}
                        <DropdownItem icon={<RefreshCw />} onSelect={refresh}>
                            Refresh episode list
                        </DropdownItem>
                        <DropdownItem icon={<Wand2 />} onSelect={() => setMatchOpen(true)}>
                            {data?.mapping ? "Change match" : "Find manually"}
                        </DropdownItem>
                        <DropdownItem icon={<Download />} disabled={!episodes.length} onSelect={() => setDlOpen(true)}>
                            Download episodes
                        </DropdownItem>
                    </DropdownContent>
                </Dropdown>
            </div>

            {aniMissing && (
                <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 border px-4 py-3", classic ? "rounded-xl border-amber-500/25 bg-amber-500/10" : "rounded-sm border-amber-400/45")}>
                    <Terminal className="size-5 shrink-0 text-amber-300" />
                    <div className="min-w-0 flex-1 basis-48 text-sm">
                        <p className="font-medium text-amber-200">{status?.platform === "android" ? "ani-cli doesn’t run on Android" : "ani-cli isn’t installed"}</p>
                        {status?.platform === "android" ? (
                            <p className="mt-0.5 text-muted">
                                Use a computer’s: Settings › Other devices › <b>Share my library</b>. Or pick another provider.
                            </p>
                        ) : canInstallPrograms(status) ? (
                            <p className="mt-0.5 text-muted">Install it, or pick another provider.</p>
                        ) : (
                            <p className="mt-0.5 break-words text-muted">
                                {installSource(status?.platform, "ani-cli")} <code className={code}>{installHint(status?.platform, "ani-cli")}</code> (needs{" "}
                                <code className={code}>mpv</code>, <code className={code}>yt-dlp</code> or <code className={code}>ffmpeg</code>). Or pick another provider.
                            </p>
                        )}
                    </div>
                    {canInstallPrograms(status) && <InstallAniCli running={!!status?.setupRunning} />}
                </div>
            )}

            {(isLoading || (!error && data && episodes.length === 0 && !modesKnown)) && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-x-5 gap-y-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-video" />
                    ))}
                </div>
            )}
            {error && !aniMissing && (
                <EmptyState icon={<AlertTriangle className="size-6" />} title="Couldn't load episodes" action={<Button onClick={() => refetch()}>Try again</Button>}>
                    {(error as Error).message}
                </EmptyState>
            )}
            {!isLoading && !error && data && episodes.length === 0 && modesKnown && (
                <EmptyState icon={<Search className="size-6" />} title="No match found" action={<Button variant="primary" onClick={() => setMatchOpen(true)}>Search manually</Button>}>
                    Nothing on {prov?.name ?? provider}
                    {dub ? " in dub" : ""}.
                </EmptyState>
            )}

            <AddToPlaylistDialog items={toPlaylist} onClose={() => setToPlaylist(null)} />
            {episodes.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-x-5 gap-y-6">
                    {episodes.map(ep => (
                        <EpisodeCard
                            key={ep.number}
                            image={ep.image}
                            number={ep.number}
                            title={ep.title || undefined}
                            tag={fillerFact(ep.number, filler)}
                            facts={[!!ep.runtime && `${ep.runtime}m`, ep.airDate, dub ? "Dub" : "Sub", ep.resumeAt > 0 && `at ${formatDuration(ep.resumeAt)}`]}
                            watched={ep.watched}
                            resumeAt={ep.resumeAt}
                            progress={ep.duration ? ep.resumeAt / ep.duration : 0}
                            blur={settings?.ui.blurUnwatched}
                            onClick={() => playStream(provider, media.id, ep.number, dub)}
                            actions={
                                <div className="flex gap-1">
                                    <WatchedToggle watched={ep.watched} disabled={marker.pending} onToggle={() => marker.mark(ep.number, !ep.watched)} />
                                    <Tooltip content="Download">
                                        <button
                                            aria-label={`Episode ${ep.number}: download to the library`}
                                            className="grid size-7 place-items-center rounded-md bg-black/70 text-white transition-colors hover:bg-black/85"
                                            onClick={e => {
                                                e.stopPropagation()
                                                download(ep.number)
                                            }}
                                        >
                                            <Download className="size-4" />
                                        </button>
                                    </Tooltip>
                                </div>
                            }
                            menu={
                                <>
                                    <DropdownItem icon={<Play />} onSelect={() => playStream(provider, media.id, ep.number, dub)}>
                                        {ep.resumeAt > 0 ? "Resume" : "Play"}
                                    </DropdownItem>
                                    {!remote && (
                                        <DropdownItem icon={<MonitorPlay />} onSelect={() => playStream(provider, media.id, ep.number, dub, { player: streamPlayer() === "mpv" ? "builtin" : "mpv" })}>
                                            Play in {otherPlayer}
                                        </DropdownItem>
                                    )}
                                    <DropdownItem icon={<ListPlus />} onSelect={() => setToPlaylist([streamItem(ep)])}>
                                        Add to playlist…
                                    </DropdownItem>
                                    {ep.number < lastEp && (
                                        <DropdownItem icon={<ListEnd />} onSelect={() => setToPlaylist(episodes.filter(e => e.number >= ep.number).sort((a, b) => a.number - b.number).map(streamItem))}>
                                            Add the rest of the season…
                                        </DropdownItem>
                                    )}
                                    <DropdownItem icon={<Download />} onSelect={() => download(ep.number)}>
                                        Download
                                    </DropdownItem>
                                    <DropdownItem icon={<CheckCheck />} onSelect={() => marker.mark(ep.number, !ep.watched)}>
                                        {ep.watched ? "Mark as unwatched" : "Mark as watched"}
                                    </DropdownItem>
                                </>
                            }
                        />
                    ))}
                </div>
            )}

            <ManualMatchDialog
                open={matchOpen}
                onOpenChange={setMatchOpen}
                provider={provider}
                mediaId={media.id}
                dub={dub}
                canDub={supportsDub}
                onPicked={setDub}
                defaultQuery={media.title.english || media.title.romaji || ""}
            />
            <DownloadDialog
                open={dlOpen}
                onOpenChange={setDlOpen}
                provider={provider}
                mediaId={media.id}
                dub={dub}
                episodes={episodes.map(e => e.number)}
                from={Math.max(progress + 1, episodes[0]?.number ?? 1)}
            />
        </div>
    )
}

function ManualMatchDialog({
    open,
    onOpenChange,
    provider,
    mediaId,
    dub: pageDub,
    canDub,
    onPicked,
    defaultQuery,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
    provider: string
    mediaId: number
    dub: boolean
    canDub: boolean
    onPicked: (dub: boolean) => void
    defaultQuery: string
}) {
    const classic = useClassic()
    const [q, setQ] = useState(defaultQuery)
    const [results, setResults] = useState<{ id: string; title: string; subOrDub?: string; query?: string; index?: number; episodes?: number }[]>([])
    const [busy, setBusy] = useState(false)
    // Either version, also the one the page doesn't offer (not found).
    const [dub, setDubMode] = useState(pageDub)
    const qc = useQueryClient()
    useEffect(() => setQ(defaultQuery), [defaultQuery])
    useEffect(() => {
        if (open) setDubMode(pageDub)
    }, [open, pageDub])
    const search = async () => {
        setBusy(true)
        try {
            setResults(await api.get(`/api/onlinestream/search${qs({ provider, q, dub })}`))
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setBusy(false)
        }
    }
    const pick = async (r: (typeof results)[number]) => {
        try {
            await api.post("/api/onlinestream/mapping", { provider, mediaId, dub, id: r.id, title: r.title, query: r.query, index: r.index })
            toast.success(`Now using “${r.title}”`)
            qc.invalidateQueries({ queryKey: ["os-episodes", provider, mediaId, dub] })
            qc.invalidateQueries({ queryKey: ["os-modes", provider, mediaId] })
            onPicked(dub)
            onOpenChange(false)
        } catch (e: any) {
            toast.error(e.message)
        }
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange} title="Pick the right anime">
            <div className="flex gap-2">
                <Input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Search…" icon={<Search className="size-4" />} />
                {canDub && (
                    <div className={classic ? "flex shrink-0 rounded-lg bg-white/[0.04] p-0.5" : "flex shrink-0"}>
                        {(["sub", "dub"] as const).map(m => (
                            <button
                                key={m}
                                onClick={() => {
                                    setDubMode(m === "dub")
                                    setResults([])
                                }}
                                aria-pressed={(m === "dub") === dub}
                                className={cn(
                                    "focus-ring transition-colors",
                                    classic ? "h-8 rounded-md px-3 text-xs font-medium uppercase" : "word label h-9 px-3 text-[10.5px]",
                                    (m === "dub") === dub ? (classic ? "bg-white/[0.1] text-fg" : "text-fg") : "text-muted hover:text-fg",
                                )}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                )}
                <Button variant="primary" loading={busy} onClick={search}>
                    Search
                </Button>
            </div>
            <div className="mt-4 flex flex-col gap-1">
                {results.map(r => (
                    <button key={r.id} onClick={() => pick(r)} className="focus-ring flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.06]">
                        <span className="min-w-0 truncate font-medium">{r.title}</span>
                        <span className="shrink-0 text-xs text-muted tabular-nums">{[r.episodes ? `${r.episodes} eps` : "", r.subOrDub].filter(Boolean).join(" · ")}</span>
                    </button>
                ))}
                {!busy && results.length === 0 && <p className="py-6 text-center text-sm text-subtle">Search to see results</p>}
            </div>
        </Dialog>
    )
}

function DownloadDialog({ open, onOpenChange, provider, mediaId, dub, episodes, from }: { open: boolean; onOpenChange: (v: boolean) => void; provider: string; mediaId: number; dub: boolean; episodes: number[]; from: number }) {
    const last = episodes[episodes.length - 1] ?? 1
    const [start, setStart] = useState(from)
    const [end, setEnd] = useState(last)
    const [quality, setQuality] = useState("best")
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        setStart(Math.min(from, last))
        setEnd(last)
    }, [from, last])
    const go = async () => {
        setBusy(true)
        try {
            const eps = episodes.filter(e => e >= start && e <= end)
            await api.post("/api/onlinestream/download", { provider, mediaId, episodes: eps, dub, quality })
            onOpenChange(false)
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setBusy(false)
        }
    }
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title="Download episodes"
            description={`Saved to your library folder (${dub ? "dub" : "sub"}).`}
            footer={
                <>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button variant="primary" loading={busy} icon={<Download className="size-4" />} onClick={go}>
                        Download {episodes.filter(e => e >= start && e <= end).length} episodes
                    </Button>
                </>
            }
        >
            <div className="grid grid-cols-2 gap-4">
                <Field label="From episode">
                    <Input type="number" value={start} min={episodes[0]} max={last} onChange={e => setStart(Number(e.target.value))} />
                </Field>
                <Field label="To episode">
                    <Input type="number" value={end} min={start} max={last} onChange={e => setEnd(Number(e.target.value))} />
                </Field>
                <Field label="Quality" className="col-span-2">
                    <Select
                        value={quality}
                        onChange={setQuality}
                        options={[
                            { value: "best", label: "Best available" },
                            { value: "1080", label: "1080p" },
                            { value: "720", label: "720p" },
                            { value: "480", label: "480p" },
                            { value: "worst", label: "Smallest" },
                        ]}
                    />
                </Field>
            </div>
        </Dialog>
    )
}

// Windows and macOS: Aniko's setup installs ani-cli (on Windows with Git,
// whose bash runs it).
function InstallAniCli({ running }: { running: boolean }) {
    const { data: status } = useStatus()
    const install = useInstallPrograms(status)
    return (
        <Button variant="primary" size="sm" className="ml-auto" icon={<Download className="size-4" />} loading={install.isPending} disabled={running} onClick={() => install.mutate()}>
            {running ? "Installing…" : "Install"}
        </Button>
    )
}
