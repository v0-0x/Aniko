import { ArrowDownUp, Check, ListChecks, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { MediaCard, MediaCardSkeleton, MediaGrid } from "@/components/MediaCard"
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownTrigger, EmptyState, ErrorState, IconButton, Input, Tabs } from "@/components/ui"
import { useRawList } from "@/lib/queries"
import { LIST_STATUS, LIST_STATUS_MANGA, title } from "@/lib/utils"

const SORTS = [
    { value: "updated", label: "Last updated" },
    { value: "title", label: "Title" },
    { value: "score", label: "Score" },
    { value: "progress", label: "Progress" },
]

export default function ListsPage() {
    const [type, setType] = useState<"ANIME" | "MANGA">("ANIME")
    const { data, isLoading, error, refetch, isFetching } = useRawList(type)
    // A link can open a list (?status=COMPLETED, the profile's See all).
    const [params] = useSearchParams()
    const [status, setStatus] = useState(() => {
        const s = params.get("status") ?? ""
        return s in LIST_STATUS ? s : "CURRENT"
    })
    const [q, setQ] = useState("")
    const [sort, setSort] = useState("updated")
    const labels = type === "MANGA" ? LIST_STATUS_MANGA : LIST_STATUS

    const byStatus = useMemo(() => {
        const out: Record<string, any[]> = {}
        for (const l of data?.lists ?? []) {
            if (l.isCustomList) continue
            out[l.status] = [...(out[l.status] ?? []), ...l.entries]
        }
        return out
    }, [data])

    const entries = useMemo(() => {
        let list = (byStatus[status] ?? []).slice()
        if (q.trim()) list = list.filter(e => title(e.media).toLowerCase().includes(q.toLowerCase()) || (e.media.title.english ?? "").toLowerCase().includes(q.toLowerCase()))
        list.sort((a, b) => {
            switch (sort) {
                case "title":
                    return title(a.media).localeCompare(title(b.media))
                case "score":
                    return (b.score || 0) - (a.score || 0)
                case "progress":
                    return (b.progress || 0) - (a.progress || 0)
                default:
                    return (b.updatedAt || 0) - (a.updatedAt || 0)
            }
        })
        return list
    }, [byStatus, status, q, sort])

    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-[1.75rem] font-semibold tracking-tight">My lists</h1>
                <Tabs value={type} onChange={setType} tabs={[{ value: "ANIME", label: "Anime" }, { value: "MANGA", label: "Manga" }]} />
            </div>
            {/* One row: which list, a title filter, and the order in a menu. */}
            <div className="mb-8 flex flex-wrap items-center gap-3">
                <Tabs value={status} onChange={setStatus} tabs={Object.entries(labels).map(([k, v]) => ({ value: k, label: v, count: byStatus[k]?.length ?? 0 }))} />
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:ml-auto sm:flex-none">
                    {/* Input's className only sizes the inner <input> (its own wrapper is w-full): size it from outside. */}
                    <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
                        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter…" aria-label="Filter by title" icon={<Search className="size-4" />} className="rounded-xl" />
                    </div>
                    <Dropdown>
                        <DropdownTrigger asChild>
                            <IconButton label={`Sort: ${SORTS.find(o => o.value === sort)?.label ?? "Last updated"}`} variant="subtle" className="rounded-xl">
                                <ArrowDownUp className="size-4" />
                            </IconButton>
                        </DropdownTrigger>
                        <DropdownContent>
                            <DropdownLabel>Sort by</DropdownLabel>
                            {SORTS.map(o => (
                                <DropdownItem key={o.value} icon={sort === o.value ? <Check /> : <span className="block size-4" />} onSelect={() => setSort(o.value)}>
                                    {o.label}
                                </DropdownItem>
                            ))}
                        </DropdownContent>
                    </Dropdown>
                </div>
            </div>
            {isLoading ? (
                <MediaGrid>
                    {Array.from({ length: 12 }).map((_, i) => (
                        <MediaCardSkeleton key={i} />
                    ))}
                </MediaGrid>
            ) : error && !data ? (
                <ErrorState title="Couldn't load your list" error={error} retrying={isFetching} onRetry={() => refetch()} />
            ) : entries.length === 0 ? (
                <EmptyState icon={<ListChecks className="size-6" />} title="Nothing here yet">
                    Add {type === "ANIME" ? "anime" : "manga"} to your list from their page.
                </EmptyState>
            ) : (
                <MediaGrid start>
                    {entries.map(e => (
                        <MediaCard key={e.mediaId} media={e.media} listEntry={e} />
                    ))}
                </MediaGrid>
            )}
        </div>
    )
}
