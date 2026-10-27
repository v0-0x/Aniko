import { useQueryClient } from "@tanstack/react-query"
import { CircleCheck, EyeOff, FileVideo, FolderSync, Link2, Link2Off, Lock, Magnet, RefreshCw, Search, Undo2, Wand2 } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "@/lib/toast"
import { Cleanup } from "@/components/library/Cleanup"
import { LibraryFolders } from "@/components/library/LibraryFolders"
import { MediaPicker } from "@/components/MediaPicker"
import { Badge, Button, EmptyState, IconButton, Input, Select, Tabs } from "@/components/ui"
import { api } from "@/lib/api"
import { useCollection, useLibraryFiles, useScan, useUnmatched } from "@/lib/queries"
import { scanStore, useStore } from "@/lib/store"
import { formatRanges, missingEpisodes } from "@/lib/missing"
import type { CollectionItem, CollectionView, LocalFile } from "@/lib/types"
import { cn, cover, formatBytes, title } from "@/lib/utils"

type Tab = "folders" | "unmatched" | "missing" | "cleanup" | "files" | "ignored"
const TABS: string[] = ["folders", "unmatched", "missing", "cleanup", "files", "ignored"]

export default function LibraryPage() {
    const [params, setParams] = useSearchParams()
    const raw = params.get("tab") ?? ""
    // Unknown tabs (old links, typos) open the first one instead of nothing.
    const tab = (TABS.includes(raw) ? raw : "folders") as Tab
    const { data: coll } = useCollection()
    const scan = useScan()
    const scanning = useStore(scanStore, s => s.running)
    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-[1.75rem] font-semibold tracking-tight">Library tools</h1>
                    <p className="mt-1 text-muted">Fix matches and episode numbers, find missing episodes, and make room.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button icon={<FolderSync className="size-4" />} loading={scanning} onClick={() => scan.mutate(false)}>
                        Scan for new files
                    </Button>
                    <Button icon={<RefreshCw className="size-4" />} onClick={() => scan.mutate(true)} disabled={scanning}>
                        Re-match everything
                    </Button>
                </div>
            </div>
            <Tabs
                className="mb-8"
                value={tab}
                onChange={t => setParams({ tab: t }, { replace: true })}
                tabs={[
                    { value: "folders", label: "Folders & matches" },
                    { value: "unmatched", label: "Unmatched", count: coll?.unmatchedCount ?? 0 },
                    { value: "missing", label: "Missing episodes", count: withMissing(coll).length },
                    { value: "cleanup", label: "Clean up" },
                    { value: "files", label: "All files" },
                    { value: "ignored", label: "Ignored", count: coll?.ignoredCount ?? 0 },
                ]}
            />
            {tab === "folders" && <LibraryFolders />}
            {tab === "unmatched" && <Unmatched />}
            {tab === "missing" && <MissingEpisodes />}
            {tab === "cleanup" && <Cleanup />}
            {tab === "files" && <AllFiles />}
            {tab === "ignored" && <Ignored />}
        </div>
    )
}

function Unmatched() {
    const { data, isLoading } = useUnmatched()
    const [picking, setPicking] = useState<{ paths: string[]; title: string } | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const qc = useQueryClient()
    const refresh = () => {
        qc.invalidateQueries({ queryKey: ["library"] })
        qc.invalidateQueries({ queryKey: ["collection"] })
    }
    const ignore = async (paths: string[]) => {
        try {
            await api.post("/api/library/ignore", { paths, ignored: true })
            toast.success(`Ignored ${paths.length} file(s)`)
            refresh()
        } catch (e: any) {
            toast.error(e.message)
        }
    }
    const match = async (mediaId: number, paths: string[]) => {
        try {
            await api.post("/api/library/match", { paths, mediaId })
            toast.success(`Matched ${paths.length} file(s)`)
            setSelected(new Set())
            refresh()
        } catch (e: any) {
            toast.error(e.message)
        }
    }
    if (isLoading) return <div className="card h-40 shimmer" />
    if (!data?.length)
        return (
            <EmptyState icon={<Link2 className="size-6" />} title="Everything is matched">
                All video files in your library are linked to an anime.
            </EmptyState>
        )
    return (
        <div className="flex flex-col gap-5">
            {data.map(g => {
                const paths = g.files.map(f => f.path)
                const chosen = paths.filter(p => selected.has(p))
                return (
                    <div key={g.dir} className="card overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white/[0.02] px-5 py-4">
                            <div className="min-w-0">
                                <p className="truncate text-lg font-semibold">{g.title}</p>
                                <p className="truncate text-xs text-subtle">{g.dir}</p>
                            </div>
                            <div className="flex gap-2">
                                <Button size="sm" variant="primary" icon={<Wand2 className="size-4" />} onClick={() => setPicking({ paths: chosen.length ? chosen : paths, title: g.title })}>
                                    Match {chosen.length ? `${chosen.length} selected` : "all"}
                                </Button>
                                <Button size="sm" variant="subtle" icon={<EyeOff className="size-4" />} onClick={() => ignore(chosen.length ? chosen : paths)}>
                                    Ignore
                                </Button>
                            </div>
                        </div>
                        <div className="divide-y divide-line">
                            {g.files.map(f => (
                                <label key={f.path} className="flex cursor-pointer items-center gap-4 px-5 py-2.5 text-sm hover:bg-white/[0.02]">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(f.path)}
                                        onChange={() =>
                                            setSelected(s => {
                                                const n = new Set(s)
                                                n.has(f.path) ? n.delete(f.path) : n.add(f.path)
                                                return n
                                            })
                                        }
                                        className="size-4 accent-[var(--brand)]"
                                    />
                                    <FileVideo className="size-4 shrink-0 text-subtle" />
                                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                                    {f.parsed.episode >= 0 && <Badge>Ep {f.parsed.episode}</Badge>}
                                    {f.parsed.season > 0 && <Badge>S{f.parsed.season}</Badge>}
                                    {f.parsed.releaseGroup && <Badge tone="brand">{f.parsed.releaseGroup}</Badge>}
                                    <span className="w-20 text-right text-xs text-subtle">{formatBytes(f.size)}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )
            })}
            <MediaPicker
                open={!!picking}
                onOpenChange={v => !v && setPicking(null)}
                initialQuery={picking?.title ?? ""}
                heading="Match files"
                description={picking ? `${picking.paths.length} file(s) will be linked to the anime you choose.` : undefined}
                onPick={m => picking && match(m.id, picking.paths)}
            />
        </div>
    )
}

function AllFiles() {
    const { data, isLoading } = useLibraryFiles()
    const { data: coll } = useCollection()
    const [q, setQ] = useState("")
    const [kind, setKind] = useState("all")
    const qc = useQueryClient()
    const titles = useMemo(() => {
        const m = new Map<number, string>()
        for (const l of coll?.lists ?? []) for (const i of l.items) m.set(i.media.id, title(i.media))
        for (const i of coll?.localOnly ?? []) m.set(i.media.id, title(i.media))
        return m
    }, [coll])
    const files = (data ?? []).filter(f => !f.ignored && (kind === "all" || f.kind === kind) && (!q || f.name.toLowerCase().includes(q.toLowerCase()) || (titles.get(f.mediaId) ?? "").toLowerCase().includes(q.toLowerCase())))
    const patch = async (f: LocalFile, body: Record<string, unknown>) => {
        try {
            await api.patch("/api/library/file", { path: f.path, ...body })
            qc.invalidateQueries({ queryKey: ["library"] })
            qc.invalidateQueries({ queryKey: ["entry", f.mediaId] })
        } catch (e: any) {
            toast.error(e.message)
        }
    }
    const unmatch = async (f: LocalFile) => {
        try {
            await api.post("/api/library/unmatch", { paths: [f.path] })
            qc.invalidateQueries({ queryKey: ["library"] })
            qc.invalidateQueries({ queryKey: ["collection"] })
        } catch (e: any) {
            toast.error(e.message)
        }
    }
    if (isLoading) return <div className="card h-40 shimmer" />
    return (
        <div className="flex flex-col gap-4">
            <div className="flex gap-3">
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by file or anime…" icon={<Search className="size-4" />} />
                <Select
                    className="w-44"
                    value={kind}
                    onChange={setKind}
                    options={[
                        { value: "all", label: "All kinds" },
                        { value: "main", label: "Episodes" },
                        { value: "special", label: "Specials" },
                        { value: "nc", label: "OP / ED" },
                    ]}
                />
            </div>
            <p className="text-sm text-subtle">{files.length} files</p>
            <div className="card divide-y divide-line overflow-hidden">
                {files.slice(0, 500).map(f => (
                    <div key={f.path} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-medium" title={f.path}>
                                {f.name}
                            </p>
                            {f.mediaId > 0 ? (
                                <Link to={`/entry?id=${f.mediaId}`} className="text-xs text-brand-strong hover:underline">
                                    {titles.get(f.mediaId) ?? `AniList #${f.mediaId}`}
                                </Link>
                            ) : (
                                <span className="text-xs text-amber-300">Unmatched</span>
                            )}
                        </div>
                        {f.locked && (
                            <span title="Locked: re-scans won't change this file">
                                <Lock className="size-3.5 text-subtle" />
                            </span>
                        )}
                        <select value={f.kind} onChange={e => patch(f, { kind: e.target.value })} className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs">
                            <option value="main">Episode</option>
                            <option value="special">Special</option>
                            <option value="nc">OP/ED</option>
                        </select>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-subtle">Ep</span>
                            <input
                                type="number"
                                defaultValue={f.episode}
                                onBlur={e => Number(e.target.value) !== f.episode && patch(f, { episode: Number(e.target.value) })}
                                className="h-8 w-16 rounded-lg border border-line bg-surface-2 px-2 text-xs"
                            />
                        </div>
                        {f.mediaId > 0 && (
                            <IconButton size="sm" label="Unmatch" onClick={() => unmatch(f)}>
                                <Link2Off className="size-4" />
                            </IconButton>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

// The anime with episodes missing from the library: gaps between those
// there, and ones aired since the last (not for anime dropped or finished
// on the list: those aren't being collected).
function withMissing(coll?: CollectionView) {
    if (!coll) return []
    const items: CollectionItem[] = [...(coll.lists ?? []).flatMap(l => l.items), ...(coll.localOnly ?? [])]
    return items
        .filter(it => (it.downloaded?.length ?? 0) > 0)
        .map(it => {
            const m = missingEpisodes(it.downloaded ?? [], it.media)
            const status = it.listEntry?.status
            // Newer episodes only for those still being watched (or not on the list).
            if (status === "COMPLETED" || status === "DROPPED") m.newer = []
            if (status === "DROPPED") m.gaps = []
            return { item: it, missing: m }
        })
        .filter(x => x.missing.gaps.length > 0 || x.missing.newer.length > 0)
        .sort((a, b) => b.missing.gaps.length - a.missing.gaps.length || title(a.item.media).localeCompare(title(b.item.media)))
}

function MissingEpisodes() {
    const { data: coll, isLoading } = useCollection()
    if (isLoading) return <div className="card h-40 shimmer" />
    const rows = withMissing(coll)
    if (!rows.length)
        return (
            <EmptyState icon={<CircleCheck className="size-6" />} title="Nothing missing">
                Every anime in your library has its episodes from the first one there to the last, and the newest aired.
            </EmptyState>
        )
    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">Episodes between the first and the last one in your library that aren't there, and those aired since (for the anime you're watching).</p>
            <div className="card divide-y divide-line">
                {rows.map(({ item, missing }) => {
                    const first = missing.gaps[0] ?? missing.newer[0]
                    return (
                        <div key={item.media.id} className="flex items-center gap-4 px-4 py-3">
                            <img src={cover(item.media, "thumb")} alt="" className="h-16 w-11 shrink-0 rounded-md object-cover" />
                            <div className="min-w-0 flex-1">
                                <Link to={`/entry?id=${item.media.id}`} className="block truncate font-medium hover:underline">
                                    {title(item.media)}
                                </Link>
                                {missing.gaps.length > 0 && (
                                    <p className="mt-0.5 text-sm text-amber-200/85">
                                        Missing {missing.gaps.length === 1 ? "episode" : `${missing.gaps.length} episodes`}: {formatRanges(missing.gaps)}
                                    </p>
                                )}
                                {missing.newer.length > 0 && (
                                    <p className="mt-0.5 text-sm text-muted">
                                        Aired since your last one: {formatRanges(missing.newer)}
                                    </p>
                                )}
                            </div>
                            <Link to={`/entry?id=${item.media.id}&tab=torrents&episode=${first}`}>
                                <Button size="sm" icon={<Magnet className="size-4" />}>
                                    Find torrents
                                </Button>
                            </Link>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function Ignored() {
    const { data, isLoading } = useLibraryFiles()
    const qc = useQueryClient()
    const files = (data ?? []).filter(f => f.ignored)
    const restore = async (paths: string[]) => {
        try {
            await api.post("/api/library/ignore", { paths, ignored: false })
            toast.success("Restored — run a scan to match them")
            qc.invalidateQueries({ queryKey: ["library"] })
            qc.invalidateQueries({ queryKey: ["collection"] })
        } catch (e: any) {
            toast.error(e.message)
        }
    }
    if (isLoading) return <div className="card h-40 shimmer" />
    if (!files.length)
        return (
            <EmptyState icon={<EyeOff className="size-6" />} title="No ignored files">
                Files you ignore won’t be matched or shown anywhere.
            </EmptyState>
        )
    return (
        <div className="flex flex-col gap-4">
            <div>
                <Button size="sm" icon={<Undo2 className="size-4" />} onClick={() => restore(files.map(f => f.path))}>
                    Restore all
                </Button>
            </div>
            <div className="card divide-y divide-line">
                {files.map(f => (
                    <div key={f.path} className={cn("flex items-center gap-4 px-4 py-2.5 text-sm")}>
                        <FileVideo className="size-4 text-subtle" />
                        <span className="min-w-0 flex-1 truncate" title={f.path}>
                            {f.name}
                        </span>
                        <Button size="xs" variant="ghost" onClick={() => restore([f.path])}>
                            Restore
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    )
}
