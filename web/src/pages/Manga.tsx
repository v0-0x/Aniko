import { useQuery } from "@tanstack/react-query"
import { BookOpen, Puzzle, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ListCardMenu } from "@/components/ListCardMenu"
import { DownloadedGrid } from "@/components/MangaDownloads"
import { MediaCard, MediaCardSkeleton, MediaGrid } from "@/components/MediaCard"
import { Button, EmptyState, ErrorState, Tabs } from "@/components/ui"
import { api } from "@/lib/api"
import { useClassic } from "@/lib/themes"
import type { ListEntry } from "@/lib/types"
import { LIST_STATUS_MANGA } from "@/lib/utils"

export default function MangaPage() {
    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ["manga", "collection"],
        queryFn: () => api.get<{ lists: { status: string; isCustomList: boolean; entries: ListEntry[] }[] | null }>("/api/manga/collection"),
    })
    const { data: providers } = useQuery({ queryKey: ["manga-providers"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/manga/providers") })
    const [status, setStatus] = useState("CURRENT")
    const classic = useClassic()
    const byStatus = useMemo(() => {
        const out: Record<string, ListEntry[]> = {}
        for (const l of data?.lists ?? []) if (!l.isCustomList) out[l.status] = [...(out[l.status] ?? []), ...l.entries]
        return out
    }, [data])
    const entries = byStatus[status] ?? []

    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div className="mb-8 flex items-center justify-between gap-4">
                <h1 className="text-[1.75rem] font-semibold tracking-tight">Manga</h1>
                <Link to="/search?type=MANGA">
                    <Button icon={<Search className="size-4" />}>Find manga</Button>
                </Link>
            </div>
            {providers && providers.length === 0 && (
                <div className={classic ? "card mb-8 flex items-center gap-3 p-3 pl-4" : "mb-8 flex items-center gap-3 border-y border-line py-2"}>
                    <Puzzle className="size-4 shrink-0 text-muted" />
                    <p className="min-w-0 flex-1 text-sm text-muted">No manga provider installed</p>
                    <Link to="/extensions?tab=marketplace">
                        <Button size="sm" variant="primary">
                            Marketplace
                        </Button>
                    </Link>
                </div>
            )}
            <Tabs
                className="mb-8"
                value={status}
                onChange={setStatus}
                tabs={[...Object.entries(LIST_STATUS_MANGA).map(([k, v]) => ({ value: k, label: v, count: byStatus[k]?.length ?? 0 })), { value: "DOWNLOADED", label: "Downloaded" }]}
            />
            {status === "DOWNLOADED" ? (
                <DownloadedGrid />
            ) : isLoading ? (
                <MediaGrid>
                    {Array.from({ length: 12 }).map((_, i) => (
                        <MediaCardSkeleton key={i} />
                    ))}
                </MediaGrid>
            ) : error && !data ? (
                <ErrorState title="Couldn't load your manga list" error={error} retrying={isFetching} onRetry={() => refetch()} />
            ) : entries.length === 0 ? (
                <EmptyState
                    icon={<BookOpen className="size-6" />}
                    title="Nothing here"
                    action={
                        <Link to="/search?type=MANGA">
                            <Button icon={<Search className="size-4" />}>Find manga</Button>
                        </Link>
                    }
                >
                    Add manga to your list from its page.
                </EmptyState>
            ) : (
                <MediaGrid start>
                    {entries.map(e => (
                        <MediaCard
                            key={e.mediaId}
                            media={e.media}
                            listEntry={e}
                            // The menu tells the list status from the media's entry.
                            menu={<ListCardMenu media={{ ...e.media, mediaListEntry: { id: e.id, status: e.status, progress: e.progress, score: e.score, repeat: e.repeat } }} />}
                        />
                    ))}
                </MediaGrid>
            )}
        </div>
    )
}
