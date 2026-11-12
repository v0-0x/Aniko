import { CircleCheck, Download, FolderSync, Info, Magnet, RefreshCw } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Cleanup } from "@/components/library/Cleanup"
import { LibraryFolders } from "@/components/library/LibraryFolders"
import { MissingDownloadDialog, useAniCliDownloads, useDownloading } from "@/components/library/MissingDownload"
import { AllFiles, Ignored, Unmatched } from "@/components/library/LibraryTools"
import { Badge, ContextArea, DropdownItem, EmptyState, IconButton, Tabs, Tooltip } from "@/components/ui"
import { useCollection, useScan } from "@/lib/queries"
import { scanStore, useStore } from "@/lib/store"
import { useClassic } from "@/lib/themes"
import { formatRanges, type Missing, missingEpisodes } from "@/lib/missing"
import type { CollectionItem, CollectionView } from "@/lib/types"
import { cn, cover, title } from "@/lib/utils"

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
            <div className="mb-8 flex items-center justify-between gap-4">
                <h1 className="text-[1.75rem] font-semibold tracking-tight">Library tools</h1>
                <div className="flex shrink-0 gap-1">
                    <IconButton label="Scan for new files" icon={<FolderSync className="size-4" />} loading={scanning} onClick={() => scan.mutate(false)} />
                    <IconButton label="Re-match everything" icon={<RefreshCw className="size-4" />} onClick={() => scan.mutate(true)} disabled={scanning} />
                </div>
            </div>
            <Tabs
                variant="underline"
                className="mb-6"
                value={tab}
                onChange={t => setParams({ tab: t }, { replace: true })}
                tabs={[
                    { value: "folders", label: "Folders & matches" },
                    { value: "unmatched", label: counted("Unmatched", coll?.unmatchedCount ?? 0) },
                    { value: "missing", label: counted("Missing episodes", withMissing(coll).length) },
                    { value: "cleanup", label: "Clean up" },
                    { value: "files", label: "All files" },
                    { value: "ignored", label: counted("Ignored", coll?.ignoredCount ?? 0) },
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

// A tab's name with its count as a plain muted number (as on an anime's page).
function counted(label: string, count: number) {
    return (
        <>
            {label}
            <span className="font-normal text-subtle tabular-nums">{count}</span>
        </>
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
    const classic = useClassic()
    const { data: coll, isLoading } = useCollection()
    if (isLoading) return <div className="card h-40 shimmer" />
    const rows = withMissing(coll)
    if (!rows.length)
        return (
            <EmptyState icon={<CircleCheck className="size-6" />} title="Nothing missing">
                No gaps, and no newer episodes to get.
            </EmptyState>
        )
    return (
        // This look: rows on hairlines, not a box each.
        <div className={cn("flex flex-col", classic ? "gap-2" : "border-t border-line")}>
            {rows.map(({ item, missing }) => (
                <MissingRow key={item.media.id} item={item} missing={missing} />
            ))}
        </div>
    )
}

// An anime with episodes missing: download them with ani-cli (sub or dub),
// or find torrents for the first.
function MissingRow({ item, missing }: { item: CollectionItem; missing: Missing }) {
    const classic = useClassic()
    const [open, setOpen] = useState(false)
    const aniCli = useAniCliDownloads()
    const downloading = useDownloading(item.media.id)
    const first = missing.gaps[0] ?? missing.newer[0]
    const busy = [...missing.gaps, ...missing.newer].filter(n => downloading.has(n)).length
    const navigate = useNavigate()
    // A right-click on the row: what its buttons do.
    const menu = (
        <>
            {aniCli.loaded && aniCli.enabled && (
                <DropdownItem icon={<Download />} disabled={!aniCli.installed} onSelect={() => setOpen(true)}>
                    Download
                </DropdownItem>
            )}
            <DropdownItem icon={<Magnet />} onSelect={() => navigate(`/entry?id=${item.media.id}&tab=torrents&episode=${first}`)}>
                Find torrents
            </DropdownItem>
            <DropdownItem icon={<Info />} onSelect={() => navigate(`/entry?id=${item.media.id}`)}>
                Anime page
            </DropdownItem>
        </>
    )
    return (
        // The dialog stays outside the row: a right-click in it is its own.
        <>
        <ContextArea menu={menu} className={cn("flex items-center gap-4 fade-in", classic ? "card p-3" : "border-b border-line py-3")}>
            <img src={cover(item.media, "thumb")} alt="" className="h-16 w-11 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
                <Link to={`/entry?id=${item.media.id}`} className="block truncate font-medium hover:underline">
                    {title(item.media)}
                </Link>
                {missing.gaps.length > 0 && (
                    <p className="mt-0.5 text-sm text-amber-200/85">
                        Missing {missing.gaps.length === 1 ? "episode" : `${missing.gaps.length} episodes`}: {formatRanges(missing.gaps)}
                    </p>
                )}
                {missing.newer.length > 0 && <p className="mt-0.5 text-sm text-muted">Aired since your last one: {formatRanges(missing.newer)}</p>}
                {busy > 0 && (
                    <Link to="/downloads" className="focus-ring mt-1.5 inline-flex rounded-full">
                        <Badge tone="blue">Downloading {busy}</Badge>
                    </Link>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                {aniCli.loaded &&
                    aniCli.enabled &&
                    (aniCli.installed ? (
                        <IconButton label="Download" onClick={() => setOpen(true)}>
                            <Download className="size-4" />
                        </IconButton>
                    ) : (
                        <Tooltip content="ani-cli isn't installed. See Settings › Programs.">
                            <span>
                                <IconButton aria-label="Download" disabled>
                                    <Download className="size-4" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    ))}
                <Link to={`/entry?id=${item.media.id}&tab=torrents&episode=${first}`}>
                    <IconButton label="Find torrents">
                        <Magnet className="size-4" />
                    </IconButton>
                </Link>
            </div>
        </ContextArea>
            {open && <MissingDownloadDialog media={item.media} missing={missing} open={open} onOpenChange={setOpen} />}
        </>
    )
}
