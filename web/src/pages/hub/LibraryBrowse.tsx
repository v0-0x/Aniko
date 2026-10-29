import { useQuery } from "@tanstack/react-query"
import { Film, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge, Dialog, EmptyState, Input, Select } from "@/components/ui"
import { api } from "@/lib/api"
import { usePersisted } from "@/lib/hooks"
import { useCollection, useLibraryFiles } from "@/lib/queries"
import type { EntryView, EpisodeView, Media } from "@/lib/types"
import { cleanDescription, cover, formatBytes, formatLabel, img, title } from "@/lib/utils"
import { Panel } from "./parts"

// Everything in the hub's library, with its artwork and details: the hub
// downloads them for every anime it has and keeps them (app/prefetch.go),
// so this is its own copy, also without the internet.

type Item = { media: Media; episodes: number; files: number; size: number; added: number }

const SORTS = [
    { value: "added", label: "Recently added" },
    { value: "title", label: "Title" },
    { value: "episodes", label: "Most episodes" },
    { value: "size", label: "Largest" },
]

// Shown at first: a big library is drawn as it's scrolled to.
const PAGE = 120

export function LibraryBrowse() {
    const { data: coll, isLoading } = useCollection()
    const { data: files } = useLibraryFiles()
    const [q, setQ] = useState("")
    const [sort, setSort] = usePersisted("kumo-hub-library-sort", "added")
    const [shown, setShown] = useState(PAGE)
    const [open, setOpen] = useState<Media | null>(null)

    const items = useMemo(() => {
        const media = new Map<number, Media>()
        for (const l of coll?.lists ?? []) for (const it of l.items) if (it.downloaded?.length) media.set(it.media.id, it.media)
        for (const it of coll?.localOnly ?? []) media.set(it.media.id, it.media)
        const stats = new Map<number, { eps: Set<number>; files: number; size: number; added: number }>()
        for (const f of files ?? []) {
            if (f.ignored || f.mediaId <= 0) continue
            const s = stats.get(f.mediaId) ?? { eps: new Set<number>(), files: 0, size: 0, added: 0 }
            if (f.kind === "main") s.eps.add(f.episode)
            s.files++
            s.size += f.size
            s.added = Math.max(s.added, f.modTime)
            stats.set(f.mediaId, s)
        }
        const out: Item[] = []
        for (const [id, m] of media) {
            const s = stats.get(id)
            out.push({ media: m, episodes: s?.eps.size ?? 0, files: s?.files ?? 0, size: s?.size ?? 0, added: s?.added ?? 0 })
        }
        return out
    }, [coll, files])

    const list = useMemo(() => {
        const needle = q.trim().toLowerCase()
        const out = needle
            ? items.filter(({ media: m }) => [m.title.english, m.title.romaji, m.title.native, m.title.userPreferred, ...(m.synonyms ?? [])].some(t => t?.toLowerCase().includes(needle)))
            : items.slice()
        out.sort((a, b) => {
            switch (sort) {
                case "title":
                    return title(a.media).localeCompare(title(b.media))
                case "episodes":
                    return b.episodes - a.episodes || title(a.media).localeCompare(title(b.media))
                case "size":
                    return b.size - a.size
                default:
                    return b.added - a.added
            }
        })
        return out
    }, [items, q, sort])

    return (
        <Panel
            title={`Anime${items.length ? ` · ${items.length}` : ""}`}
            action={
                <div className="flex w-full items-center gap-2 sm:w-auto">
                    <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
                        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Find an anime…" icon={<Search className="size-4" />} />
                    </div>
                    <Select className="w-44 shrink-0" value={sort} onChange={setSort} options={SORTS} />
                </div>
            }
        >
            {isLoading ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-4 p-4">
                    {Array.from({ length: 12 }, (_, i) => (
                        <div key={i} className="aspect-[2/3] rounded-lg shimmer" />
                    ))}
                </div>
            ) : list.length === 0 ? (
                <div className="p-4">
                    <EmptyState icon={<Film className="size-6" />} title={q ? "Nothing matches" : "No anime yet"}>
                        {q ? "Try another title." : "Add a folder: once it's scanned, its anime show here with their artwork."}
                    </EmptyState>
                </div>
            ) : (
                <>
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-4 gap-y-5 p-4">
                        {list.slice(0, shown).map(it => (
                            <li key={it.media.id}>
                                <button onClick={() => setOpen(it.media)} className="focus-ring group w-full rounded-lg text-left">
                                    <div className="aspect-[2/3] overflow-hidden rounded-lg bg-surface-3">
                                        <img src={cover(it.media)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug">{title(it.media)}</p>
                                    <p className="mt-0.5 text-xs text-muted">
                                        {it.episodes > 0 ? `${it.episodes} ${it.episodes === 1 ? "episode" : "episodes"}` : `${it.files} ${it.files === 1 ? "file" : "files"}`} · {formatBytes(it.size)}
                                    </p>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {list.length > shown && (
                        <div className="border-t border-line p-3 text-center">
                            <button onClick={() => setShown(n => n + PAGE)} className="focus-ring rounded-md px-3 py-1.5 text-sm text-muted hover:text-fg">
                                Show more ({list.length - shown} left)
                            </button>
                        </div>
                    )}
                </>
            )}
            {open && <AnimeDetails media={open} onClose={() => setOpen(null)} />}
        </Panel>
    )
}

// An anime as the hub has it: its details, and the episodes on its disks.
function AnimeDetails({ media, onClose }: { media: Media; onClose: () => void }) {
    const { data, isLoading } = useQuery({ queryKey: ["entry", media.id], queryFn: () => api.get<EntryView>(`/api/anime/${media.id}`) })
    const m = data?.media ?? media
    const eps = [...(data?.episodes ?? []), ...(data?.specials ?? []), ...(data?.others ?? [])].filter(e => e.hasFile && e.file && !e.file.host)
    const facts = [formatLabel(m.format), m.seasonYear, m.episodes ? `${m.episodes} episodes` : "", m.averageScore ? `${m.averageScore}%` : ""].filter(Boolean).join(" · ")
    const bannerUrl = img(data?.images?.banner || m.bannerImage || "")
    return (
        <Dialog open onOpenChange={v => !v && onClose()} title={title(m)} description={facts} className="w-[min(94vw,760px)]">
            <div className="-mt-1 flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
                {bannerUrl && <img src={bannerUrl} alt="" className="h-36 w-full rounded-lg object-cover" />}
                <div className="flex gap-4">
                    <img src={cover(m, "poster")} alt="" className="h-48 w-32 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0">
                        {(m.genres?.length ?? 0) > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                                {m.genres!.map(g => (
                                    <Badge key={g}>{g}</Badge>
                                ))}
                            </div>
                        )}
                        <p className="line-clamp-[8] whitespace-pre-line text-[13px] leading-relaxed text-muted">{cleanDescription(m.description) || (isLoading ? "…" : "No description.")}</p>
                    </div>
                </div>
                <div>
                    <p className="mb-2 text-sm font-medium">On the hub · {eps.length}</p>
                    {isLoading ? (
                        <div className="h-24 rounded-lg shimmer" />
                    ) : (
                        <ul className="flex flex-col divide-y divide-line">
                            {eps.map(e => (
                                <Episode key={e.file!.path} e={e} />
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </Dialog>
    )
}

function Episode({ e }: { e: EpisodeView }) {
    const label = e.kind === "special" ? "Special" : e.kind === "nc" ? "OP / ED" : `Episode ${e.number}`
    return (
        <li className="flex items-center gap-3 py-2">
            {e.image ? (
                <img src={img(e.image)} alt="" loading="lazy" className="aspect-video w-28 shrink-0 rounded object-cover" />
            ) : (
                <div className="aspect-video w-28 shrink-0 rounded bg-surface-3" />
            )}
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                    <span className="font-medium">{label}</span>
                    {e.title && e.title !== label && <span className="text-muted"> · {e.title}</span>}
                </p>
                <p className="truncate text-xs text-subtle" title={e.file!.path}>
                    {e.file!.name} · {formatBytes(e.file!.size)}
                </p>
            </div>
        </li>
    )
}
