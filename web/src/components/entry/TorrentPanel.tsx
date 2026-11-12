import { useQuery } from "@tanstack/react-query"
import { ArrowDownToLine, Copy, ExternalLink, Magnet, MonitorPlay, MoreHorizontal, Play, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "@/lib/toast"
import { api } from "@/lib/api"
import { usePlay } from "@/lib/play"
import { useStatus, useTorrentSearch } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import { tv } from "@/lib/tv"
import type { EntryView, TorrentResult } from "@/lib/types"
import { cn, copyText, relativeTime } from "@/lib/utils"
import { Button, Dropdown, DropdownContent, DropdownItem, DropdownTrigger, EmptyState, ErrorState, IconButton, Input, Select, Switch } from "../ui"

// episode: the one to look for first (a missing one), else the next to watch.
export function TorrentPanel({ entry, episode: wanted }: { entry: EntryView; episode?: number }) {
    const classic = useClassic()
    const { data: status } = useStatus()
    const settings = status?.settings
    const media = entry.media
    const { data: providers } = useQuery({ queryKey: ["torrent-providers"], queryFn: () => api.get<{ id: string; name: string; extension: boolean }[]>("/api/torrents/providers") })
    const [provider, setProvider] = useState(settings?.torrent.defaultProvider || "nyaa")
    const [episode, setEpisode] = useState<number>(wanted ?? entry.nextEpisode?.number ?? 1)
    const [batch, setBatch] = useState(!wanted && media.status === "FINISHED" && (entry.listEntry?.progress ?? 0) === 0 && media.format !== "MOVIE")
    const [resolution, setResolution] = useState(settings?.torrent.preferredResolution || "1080")
    const [query, setQuery] = useState("")
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [sending, setSending] = useState(false)
    const search = useTorrentSearch()
    const { streamTorrent, remote } = usePlay()
    // A TV has no torrent client: the computer its downloads go to streams
    // a torrent for it (Settings › Other devices, "Let it download here").
    const viaHost = !!settings?.sharing?.downloadTo
    // A result played as it downloads: the episode it holds, or of a batch
    // the one looked for (the first for a movie).
    const stream = (r: TorrentResult, player?: "mpv" | "builtin") =>
        streamTorrent(media.id, r.episodeNumber > 0 ? r.episodeNumber : media.format === "MOVIE" ? 1 : episode, r, { player })

    const run = () => {
        setSelected(new Set())
        search.mutate({ provider, mediaId: media.id, query: query.trim() || undefined, episode: batch ? 0 : episode, batch, resolution: resolution === "any" ? "" : resolution })
    }
    useEffect(() => {
        run()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const results = search.data ?? []
    const providerName = (id: string) => providers?.find(p => p.id === id)?.name ?? id
    const key = (r: TorrentResult) => r.infoHash || r.link || r.name
    const chosen = useMemo(() => results.filter(r => selected.has(key(r))), [results, selected])

    const download = async (items: TorrentResult[]) => {
        setSending(true)
        try {
            await api.post("/api/torrents/download", { provider, mediaId: media.id, results: items })
            setSelected(new Set())
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {/* The source and the filters in one row. */}
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    className="min-w-0 flex-1 basis-36 sm:w-44 sm:flex-none sm:basis-auto"
                    value={provider}
                    onChange={setProvider}
                    options={[
                        { value: "all", label: `All providers${providers ? ` (${providers.length})` : ""}` },
                        ...(providers ?? []).map(p => ({ value: p.id, label: p.name + (p.extension ? " (extension)" : "") })),
                    ]}
                />
                <div className="w-24 shrink-0">
                    <Input type="number" min={1} aria-label="Episode" title="Episode" value={episode} disabled={batch} onChange={e => setEpisode(Number(e.target.value))} icon={<span className="text-xs">Ep</span>} />
                </div>
                <Select
                    className="w-24 shrink-0"
                    value={resolution}
                    onChange={setResolution}
                    options={[
                        { value: "any", label: "Any" },
                        { value: "2160", label: "2160p" },
                        { value: "1080", label: "1080p" },
                        { value: "720", label: "720p" },
                        { value: "480", label: "480p" },
                    ]}
                />
                <label className="flex h-9 shrink-0 items-center gap-2 px-1 text-sm text-muted">
                    <Switch checked={batch} onChange={setBatch} label="Batch" />
                    Batch
                </label>
                <div className="min-w-0 flex-1 basis-40">
                    <Input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} aria-label="Custom query" placeholder="Custom query" icon={<Search className="size-4" />} />
                </div>
                <Button variant="primary" loading={search.isPending} onClick={run} icon={<Search className="size-4" />}>
                    Search
                </Button>
            </div>

            {chosen.length > 0 && (
                <div
                    className={cn(
                        "sticky top-3 z-20 flex items-center justify-between gap-3 border py-2 pr-2 pl-4 rise-in",
                        classic ? "rounded-xl border-white/10 bg-surface-2/95 shadow-lg shadow-black/40 backdrop-blur" : "rounded-sm border-line bg-bg",
                    )}
                >
                    <span className={classic ? "text-sm tabular-nums" : "label"}>{chosen.length} selected</span>
                    <Button variant="primary" size="sm" loading={sending} icon={<ArrowDownToLine className="size-4" />} onClick={() => download(chosen)}>
                        Send to {settings?.torrent.defaultClient === "transmission" ? "Transmission" : "qBittorrent"}
                    </Button>
                </div>
            )}

            {search.isPending && <div className="card h-40 shimmer" />}
            {search.isError && <ErrorState title="Couldn't search for torrents" error={search.error} onRetry={run} />}
            {!search.isPending && results.length === 0 && search.isSuccess && (
                <EmptyState icon={<Magnet className="size-6" />} title="No torrents found" />
            )}

            {results.length > 0 && (
                <div className={classic ? "flex flex-col gap-2" : "flex flex-col divide-y divide-line border-y border-line"}>
                    {results.map(r => {
                        const k = key(r)
                        const isSel = selected.has(k)
                        const canStream = !!(r.infoHash || r.magnetLink) && (tv ? viaHost : true)
                        // What it is, on one line.
                        const facts = [
                            provider === "all" && r.provider && providerName(r.provider),
                            r.releaseGroup,
                            r.resolution,
                            r.isBatch ? "Batch" : r.episodeNumber > 0 && `Ep ${r.episodeNumber}`,
                            r.dub && "Dual audio",
                            r.trusted && "Trusted",
                            r.confirmed && "Confirmed",
                            r.remake && "Remake",
                            r.formattedSize,
                            r.date && relativeTime(new Date(r.date).getTime() / 1000),
                        ].filter(Boolean)
                        return (
                            <div key={k} className={cn("flex items-center gap-3 p-3 transition-colors", classic && "card", isSel && (classic ? "bg-brand-soft" : "shadow-[inset_2px_0_0_0_var(--text)]"))}>
                                <input
                                    type="checkbox"
                                    aria-label={`Select ${r.name}`}
                                    checked={isSel}
                                    onChange={() =>
                                        setSelected(s => {
                                            const n = new Set(s)
                                            n.has(k) ? n.delete(k) : n.add(k)
                                            return n
                                        })
                                    }
                                    className="focus-ring size-4 shrink-0 rounded accent-[var(--brand)]"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium" title={r.name}>
                                        {r.name}
                                    </p>
                                    <p className="mt-0.5 truncate text-xs text-muted tabular-nums">
                                        <span className={cn("font-medium", r.seeders > 20 ? "text-emerald-300" : r.seeders > 0 ? "text-amber-300" : "text-rose-300")}>{r.seeders}</span>
                                        <span className="text-subtle">/{r.leechers} seeding</span>
                                        {facts.length > 0 && ` · ${facts.join(" · ")}`}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <Button size="sm" variant={tv ? "white" : "subtle"} onClick={() => download([r])} loading={sending && chosen.length === 0}>
                                        Download
                                    </Button>
                                    {(canStream || r.link || r.magnetLink) && (
                                        <Dropdown>
                                            <DropdownTrigger asChild>
                                                <IconButton size="sm" aria-label={`More for ${r.name}`}>
                                                    <MoreHorizontal className="size-4" />
                                                </IconButton>
                                            </DropdownTrigger>
                                            <DropdownContent>
                                                {canStream && (
                                                    <DropdownItem icon={<Play />} onSelect={() => stream(r, "builtin")}>
                                                        Stream
                                                    </DropdownItem>
                                                )}
                                                {canStream && !tv && !remote && (
                                                    <DropdownItem icon={<MonitorPlay />} onSelect={() => stream(r, "mpv")}>
                                                        Stream in mpv
                                                    </DropdownItem>
                                                )}
                                                {r.link && (
                                                    <DropdownItem icon={<ExternalLink />} onSelect={() => window.open(r.link, "_blank", "noopener,noreferrer")}>
                                                        Open page
                                                    </DropdownItem>
                                                )}
                                                {r.magnetLink && (
                                                    <DropdownItem
                                                        icon={<Copy />}
                                                        onSelect={async () => {
                                                            if (await copyText(r.magnetLink)) toast.success("Magnet link copied")
                                                            else toast.error("Couldn't copy the magnet link: the browser blocked the clipboard")
                                                        }}
                                                    >
                                                        Copy magnet
                                                    </DropdownItem>
                                                )}
                                            </DropdownContent>
                                        </Dropdown>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
