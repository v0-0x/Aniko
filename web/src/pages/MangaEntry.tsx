import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BookOpen, Download, MoreHorizontal, RefreshCw, Search, Wand2 } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "@/lib/toast"
import { ListStatusButton, ProgressEditor, ScoreEditor } from "@/components/entry/ListEditor"
import { ChapterDownload, DownloadDialog, DownloadsPanel, LocalChapters, mangaDownloadActive, useChapterDownload, useMangaDownloads, useMangaLocal, useSharedManga } from "@/components/MangaDownloads"
import { PluginSlot } from "@/components/plugins/PluginSlot"
import { Badge, Button, ContextArea, Dialog, Dropdown, DropdownContent, DropdownItem, DropdownTrigger, EmptyState, ErrorState, IconButton, Input, Select, Skeleton } from "@/components/ui"
import { api, qs } from "@/lib/api"
import { useMangaChapters, useStatus } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import type { LocalMangaChapter, MangaChapter, MangaPosition, Media } from "@/lib/types"
import { tv } from "@/lib/tv"
import { banner, cleanDescription, cn, cover, formatLabel, otherTitle, scoreColor, statusLabel, title } from "@/lib/utils"

export default function MangaEntryPage() {
    const [params] = useSearchParams()
    const id = Number(params.get("id"))
    const { data: status } = useStatus()
    const classic = useClassic()
    const { data: media, isLoading, error: mediaError, refetch: refetchMedia, isFetching: mediaFetching } = useQuery({ queryKey: ["manga", "media", id], queryFn: () => api.get<Media>(`/api/manga/${id}`), enabled: id > 0 })
    const { data: providers } = useQuery({ queryKey: ["manga-providers"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/manga/providers") })
    const [provider, setProvider] = useState<string>(() => localStorage.getItem(`aniko-manga-provider-${id}`) || status?.settings.manga.defaultProvider || "")
    const effective = provider || providers?.[0]?.id || ""
    const { data: ch, isLoading: chLoading, error, refetch, isFetching } = useMangaChapters(id, effective)
    const { data: position } = useQuery({
        queryKey: ["manga", "position", id],
        queryFn: () => api.get<MangaPosition | null>(`/api/manga/${id}/position`),
        enabled: id > 0,
    })
    const [matchOpen, setMatchOpen] = useState(false)
    const [downloadOpen, setDownloadOpen] = useState(false)
    const [expanded, setExpanded] = useState(false)
    // Downloaded chapters (read from here, also offline), and those on
    // their way.
    const { data: local } = useMangaLocal(id)
    // And on the Anikos and servers this one uses.
    const { data: onServers } = useSharedManga(id)
    const { data: downloads } = useMangaDownloads()
    const download = useChapterDownload(id, effective)
    const navigate = useNavigate()
    const qc = useQueryClient()

    if (!(id > 0))
        return (
            <div className="p-10">
                <EmptyState
                    icon={<BookOpen className="size-6" />}
                    title="No manga selected"
                    action={
                        <Link to="/manga">
                            <Button>Go to Manga</Button>
                        </Link>
                    }
                >
                    This link has no manga.
                </EmptyState>
            </div>
        )
    if (mediaError && !media)
        return (
            <div className="p-10">
                <ErrorState title="Couldn't load this manga" error={mediaError} retrying={mediaFetching} onRetry={() => refetchMedia()} />
            </div>
        )
    if (isLoading || !media) return <Skeleton className="m-10 h-96" />
    const progress = media.mediaListEntry?.progress ?? 0
    const chapters = ch?.chapters ?? []
    // Where reading stopped (the reader saves it): that chapter at that page,
    // or the next chapter once it was read to the end. Continue goes there
    // unless the list's progress is further.
    // (A downloaded chapter read here is saved as the "local" provider's: by
    // its number.)
    const stoppedAt = !position
        ? -1
        : position.provider === effective
          ? chapters.findIndex(c => c.id === position.chapterId)
          : position.provider === "local"
            ? chapters.findIndex(c => c.chapter === position.chapter)
            : -1
    const finished = !!position && position.pages > 0 && position.page >= position.pages - 1
    const stopped = stoppedAt < 0 ? undefined : chapters[finished ? stoppedAt + 1 : stoppedAt]
    const resume = stopped && parseFloat(stopped.chapter) > progress ? stopped : undefined
    const resumePage = resume && !finished ? position!.page : 0
    const next = resume ?? chapters.find(c => parseFloat(c.chapter) > progress) ?? chapters[0]
    const localChapters = local?.chapters ?? []
    const localByNumber = new Map(localChapters.map(c => [c.chapter, c]))
    const jobByNumber = new Map((downloads ?? []).filter(j => j.mediaId === id && j.state !== "done").map(j => [j.chapter, j]))
    const readLocal = (c: LocalMangaChapter, page?: number) => navigate(`/manga/read${qs({ id, provider: "local", chapter: c.file, page: page ? String(page) : undefined })}`)
    // A downloaded chapter reads from here.
    const read = (c: MangaChapter, page?: number) => {
        const l = localByNumber.get(c.chapter)
        if (l) return readLocal(l, page)
        navigate(`/manga/read${qs({ id, provider: effective, chapter: c.id, page: page ? String(page) : undefined })}`)
    }
    const desc = cleanDescription(media.description)
    const score = media.meanScore ?? media.averageScore
    const refresh = () =>
        api
            .get(`/api/manga/${id}/chapters${qs({ provider: effective, refresh: 1 })}`)
            .then(() => qc.invalidateQueries({ queryKey: ["manga", "chapters", id] }))
            .catch(e => toast.error(e.message))
    // What's downloaded and what the provider matched, on one line.
    const facts = [localChapters.length > 0 && `${localChapters.length} downloaded`, ch?.mapping && `Matched ${ch.mapping.title}`].filter(Boolean)
    const deleteLocal = (c: LocalMangaChapter) =>
        api
            .del(`/api/manga-library/${id}${qs({ file: c.file })}`)
            .then(() => qc.invalidateQueries({ queryKey: ["manga-library"] }))
            .catch(e => toast.error(e.message))

    return (
        <div className="min-h-full pb-24">
            <div className="relative">
                <div className="absolute inset-x-0 top-0 h-[460px] overflow-hidden">
                    {banner(media) && <img src={banner(media)} alt="" className="size-full object-cover opacity-80 fade-in [mask-image:linear-gradient(to_bottom,#000_80%,transparent)]" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/75 to-bg/10" />
                    <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/30 to-transparent" />
                </div>
                {/* What the manga is and what to do with it, on one glass panel over its art (as the anime's page). */}
                <div className="relative z-10 px-6 pt-28 pb-8 md:px-8 xl:px-10">
                    <div className={cn("flex flex-col gap-6 rounded-3xl border border-white/10 bg-black/35 p-5 shadow-[0_24px_60px_-28px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.08)] md:flex-row md:p-6", !tv && "backdrop-blur-2xl")}>
                        <div className="w-32 shrink-0 md:w-44">
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
                                    media.chapters ? <span>{media.chapters} chapters</span> : null,
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
                                            <Link to={`/search?type=MANGA&genre=${encodeURIComponent(g)}`} className="transition-colors hover:text-white">
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
                                    <Button variant="white" size="lg" icon={<BookOpen className="size-4" />} onClick={() => read(next, resumePage)} data-tv-autofocus>
                                        {progress || resume ? "Continue" : "Start"} · Ch {next.chapter}
                                        {resumePage > 0 && ` · p. ${resumePage + 1}`}
                                    </Button>
                                )}
                                <ListStatusButton media={media} entry={media.mediaListEntry} />
                                {media.mediaListEntry && <ProgressEditor media={media} entry={media.mediaListEntry} />}
                                <ScoreEditor media={media} entry={media.mediaListEntry} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex flex-col gap-6 px-6 md:px-8 xl:px-10">
                {/* One row: the provider, Download, the rest in a menu, then what's there. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                        <Select
                            className="min-w-0 flex-1 sm:w-60 sm:flex-none"
                            value={effective}
                            onChange={v => {
                                setProvider(v)
                                localStorage.setItem(`aniko-manga-provider-${id}`, v)
                            }}
                            options={(providers ?? []).map(p => ({ value: p.id, label: p.name }))}
                        />
                        <Button variant="subtle" icon={<Download className="size-4" />} onClick={() => setDownloadOpen(true)} disabled={chapters.length === 0}>
                            Download
                        </Button>
                        <Dropdown>
                            <DropdownTrigger asChild>
                                <IconButton label="More" variant="subtle">
                                    {isFetching ? <RefreshCw className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                                </IconButton>
                            </DropdownTrigger>
                            <DropdownContent align="end">
                                <DropdownItem icon={<RefreshCw />} onSelect={refresh}>
                                    Refresh chapters
                                </DropdownItem>
                                <DropdownItem icon={<Wand2 />} onSelect={() => setMatchOpen(true)} disabled={!effective}>
                                    Change match
                                </DropdownItem>
                            </DropdownContent>
                        </Dropdown>
                    </div>
                    {facts.length > 0 && <p className="min-w-0 truncate text-sm text-muted">{facts.join(" · ")}</p>}
                </div>
                <DownloadsPanel mediaId={id} />
                {!effective && localChapters.length === 0 && !(onServers ?? []).length && (
                    <EmptyState title="No manga provider installed" action={<Link to="/extensions?tab=marketplace"><Button variant="primary">Marketplace</Button></Link>} />
                )}
                {chLoading && effective && <Skeleton className="h-64" />}
                {error && localChapters.length === 0 && !(onServers ?? []).length && <EmptyState title="Couldn't load chapters" action={<Button onClick={() => refetch()}>Retry</Button>}>{(error as Error).message}</EmptyState>}
                {/* The provider lists nothing (offline, none installed): what's downloaded. */}
                {chapters.length === 0 && !chLoading && localChapters.length > 0 && (
                    <>
                        <p className={classic ? "text-sm text-muted" : "label text-muted"}>Downloaded chapters</p>
                        <LocalChapters chapters={localChapters} progress={progress} read={c => readLocal(c)} onDelete={deleteLocal} />
                    </>
                )}
                {(onServers ?? []).map(o => (
                    <details key={o.host.id} open={chapters.length === 0} className="group">
                        <summary className="mb-2 cursor-pointer list-none text-sm text-muted hover:text-fg">
                            {o.chapters!.length} {o.chapters!.length === 1 ? "chapter" : "chapters"} on {o.host.name}, read from there
                            <span className="ml-1 text-subtle group-open:hidden">· show</span>
                        </summary>
                        <LocalChapters
                            chapters={o.chapters!}
                            progress={progress}
                            read={c => navigate(`/manga/read${qs({ id, provider: `server:${o.host.id}`, chapter: c.file })}`)}
                        />
                    </details>
                ))}
                {chapters.length > 0 && (
                    <div className="card divide-y divide-line">
                        {[...chapters].reverse().map(c => {
                            const done = parseFloat(c.chapter) <= progress
                            // One line of facts; the number is in the title when the chapter has none.
                            const line = [c.title && `Ch ${c.chapter}`, c.scanlator, c.language?.toUpperCase(), c.updatedAt, done && "Read"].filter(Boolean)
                            const job = jobByNumber.get(c.chapter)
                            // A right-click on the row: what its buttons do.
                            const menu = (
                                <>
                                    <DropdownItem icon={<BookOpen />} onSelect={() => read(c)}>
                                        Read
                                    </DropdownItem>
                                    {!localByNumber.has(c.chapter) && !(job && mangaDownloadActive(job)) && (
                                        <DropdownItem icon={<Download />} onSelect={() => download(c, title(media))}>
                                            Download
                                        </DropdownItem>
                                    )}
                                </>
                            )
                            return (
                                <ContextArea key={c.id} menu={menu} className={cn("flex items-center pr-1", done && "opacity-50")}>
                                    <button onClick={() => read(c)} className="focus-ring min-w-0 flex-1 px-4 py-3 text-left transition hover:bg-white/[0.03]">
                                        <p className="truncate font-medium">{c.title || `Chapter ${c.chapter}`}</p>
                                        {line.length > 0 && <p className="mt-0.5 truncate text-xs text-subtle tabular-nums">{line.join(" · ")}</p>}
                                    </button>
                                    <ChapterDownload mediaId={id} title={title(media)} provider={effective} chapter={c} local={localByNumber.get(c.chapter)} job={job} />
                                </ContextArea>
                            )
                        })}
                    </div>
                )}
                <PluginSlot slot="manga-entry-screen-bottom" />
            </div>
            <DownloadDialog
                open={downloadOpen}
                onOpenChange={setDownloadOpen}
                mediaId={id}
                title={title(media)}
                provider={effective}
                chapters={chapters}
                progress={progress}
                local={localChapters}
            />
            <MangaMatchDialog open={matchOpen} onOpenChange={setMatchOpen} provider={effective} mediaId={id} defaultQuery={media.title.english || media.title.romaji || ""} />
        </div>
    )
}

function MangaMatchDialog({ open, onOpenChange, provider, mediaId, defaultQuery }: { open: boolean; onOpenChange: (v: boolean) => void; provider: string; mediaId: number; defaultQuery: string }) {
    const [q, setQ] = useState(defaultQuery)
    const [res, setRes] = useState<{ id: string; title: string; image?: string; year?: number }[]>([])
    const [busy, setBusy] = useState(false)
    const qc = useQueryClient()
    const search = async () => {
        setBusy(true)
        try {
            setRes(await api.get(`/api/manga/search${qs({ provider, q })}`))
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setBusy(false)
        }
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange} title="Pick the right manga">
            <div className="flex gap-2">
                <Input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} icon={<Search className="size-4" />} />
                <Button variant="primary" loading={busy} onClick={search}>
                    Search
                </Button>
            </div>
            <div className="mt-4 flex flex-col gap-1">
                {res.map(r => (
                    <button
                        key={r.id}
                        onClick={async () => {
                            try {
                                await api.post("/api/manga/mapping", { provider, mediaId, id: r.id, title: r.title })
                                qc.invalidateQueries({ queryKey: ["manga", "chapters", mediaId] })
                                onOpenChange(false)
                            } catch (e: any) {
                                toast.error(e.message)
                            }
                        }}
                        className="flex items-center gap-3 rounded-xl p-2 text-left hover:bg-white/[0.06]"
                    >
                        {r.image && <img src={r.image} alt="" className="h-14 w-10 rounded object-cover" referrerPolicy="no-referrer" />}
                        <span className="font-medium">{r.title}</span>
                        {r.year ? <span className="text-sm text-subtle">{r.year}</span> : null}
                    </button>
                ))}
            </div>
        </Dialog>
    )
}
