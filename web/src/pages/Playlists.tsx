import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ChevronDown, ChevronUp, Info, ListVideo, Pencil, Play, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Button, ContextArea, Dialog, DropdownItem, DropdownSeparator, ErrorState, IconButton, Input } from "@/components/ui"
import { keepPlaylist, playlists, playPlaylist, usePlaylists, type Playlist } from "@/lib/playlist"
import { useClassic } from "@/lib/themes"
import { toast } from "@/lib/toast"
import { cn, img } from "@/lib/utils"

const count = (n: number) => `${n} episode${n === 1 ? "" : "s"}`

// Your playlists (lib/playlist), and one opened (?id=): its episodes in
// order, each moved with buttons (a TV's remote), not dragged.
export default function PlaylistsPage() {
    const classic = useClassic()
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const id = params.get("id")
    const { data, isLoading, error, refetch, isFetching } = usePlaylists()
    const open = id ? data?.find(p => p.id === id) : undefined
    if (open) return <PlaylistView key={open.id} p={open} />
    const lists = data ?? []
    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div className="mb-8">
                <h1 className="text-[1.75rem] font-semibold tracking-tight">Playlists</h1>
            </div>
            {error && !data && <ErrorState title="Couldn't load the playlists" error={error} retrying={isFetching} onRetry={() => refetch()} />}
            {!isLoading && !error && lists.length === 0 && <p className="text-sm text-muted">No playlists yet: add episodes from an episode's ⋯ menu.</p>}
            {/* This look: rows on hairlines, not a box each. */}
            <div className={cn("flex flex-col", classic ? "gap-2" : lists.length > 0 && "border-t border-line")}>
                {lists.map(p => (
                    <ContextArea
                        key={p.id}
                        // A right-click on the row: what it and its button do.
                        menu={
                            <>
                                {p.items.length > 0 && (
                                    <DropdownItem icon={<Play />} onSelect={() => playPlaylist(p)}>
                                        Play all
                                    </DropdownItem>
                                )}
                                <DropdownItem icon={<ListVideo />} onSelect={() => navigate(`/playlists?id=${p.id}`)}>
                                    Open
                                </DropdownItem>
                            </>
                        }
                        className={cn("flex items-center gap-3 fade-in sm:gap-4", classic ? "card p-3" : "border-b border-line py-3")}
                    >
                        <Link to={`/playlists?id=${p.id}`} className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg sm:gap-4">
                            {p.items[0]?.image ? <img src={img(p.items[0].image)} alt="" className="h-16 w-11 shrink-0 rounded-lg object-cover" /> : <div className="grid h-16 w-11 shrink-0 place-items-center rounded-lg bg-surface-3 text-subtle"><ListVideo className="size-4" /></div>}
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{p.name}</p>
                                <p className="mt-0.5 truncate text-sm text-muted tabular-nums">{count(p.items.length)}</p>
                            </div>
                        </Link>
                        {p.items.length > 0 && (
                            <IconButton label="Play all" onClick={() => playPlaylist(p)}>
                                <Play className="size-4" />
                            </IconButton>
                        )}
                    </ContextArea>
                ))}
            </div>
        </div>
    )
}

function PlaylistView({ p }: { p: Playlist }) {
    const classic = useClassic()
    const qc = useQueryClient()
    const navigate = useNavigate()
    const [renaming, setRenaming] = useState(false)
    const [deleting, setDeleting] = useState(false)
    // One change at a time: a remote's held button doesn't send a move
    // for a list that's already moved.
    const busy = useRef(false)
    // Where the remote's focus goes once the list has changed: the same
    // button, on the item's new row.
    const refocus = useRef<{ index: number; act: string } | null>(null)
    const list = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const f = refocus.current
        if (!f) return
        refocus.current = null
        const rows = list.current?.querySelectorAll<HTMLElement>("[data-row]")
        if (!rows?.length) return
        const row = rows[Math.min(f.index, rows.length - 1)]
        row.querySelector<HTMLElement>(`[data-act="${f.act}"]`)?.focus({ preventScroll: false })
    }, [p.items])

    const change = async (fn: () => Promise<Playlist>, focus?: { index: number; act: string }) => {
        if (busy.current) return
        busy.current = true
        try {
            const next = await fn()
            refocus.current = focus ?? null
            keepPlaylist(qc, next)
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            busy.current = false
        }
    }
    const move = (i: number, to: number, act: string) => to >= 0 && to < p.items.length && change(() => playlists.move(p.id, i, to), { index: to, act })

    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <Link to="/playlists" className={cn("focus-ring mb-3 inline-flex items-center gap-1.5 text-muted hover:text-fg", classic ? "rounded text-sm" : "word label -ml-2.5 h-7 px-2.5 transition-colors")}>
                <ArrowLeft className="size-4" /> Playlists
            </Link>
            <div className="mb-6 min-w-0">
                <h1 className="truncate text-[1.75rem] font-semibold tracking-tight">{p.name}</h1>
                <p className="mt-1 text-sm text-muted tabular-nums">{count(p.items.length)}</p>
            </div>
            <div className="mb-6 flex flex-wrap gap-2">
                {p.items.length > 0 && (
                    <Button variant="primary" icon={<Play className="size-4" />} onClick={() => playPlaylist(p)}>
                        Play all
                    </Button>
                )}
                <Button icon={<Pencil className="size-4" />} onClick={() => setRenaming(true)}>
                    Rename
                </Button>
                <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDeleting(true)}>
                    Delete
                </Button>
            </div>
            {p.items.length === 0 && <p className="text-sm text-muted">Empty: add episodes from an episode's ⋯ menu.</p>}
            <div ref={list} className={cn("flex flex-col", classic ? "gap-2" : p.items.length > 0 && "border-t border-line")}>
                {p.items.map((it, i) => {
                    const first = i === 0
                    const last = i === p.items.length - 1
                    // A right-click on the row: what its buttons do.
                    const menu = (
                        <>
                            <DropdownItem icon={<Play />} onSelect={() => playPlaylist(p, i)}>
                                Play from here
                            </DropdownItem>
                            <DropdownItem icon={<Info />} onSelect={() => navigate(`/entry?id=${it.mediaId}`)}>
                                Anime page
                            </DropdownItem>
                            {!first && (
                                <DropdownItem icon={<ChevronUp />} onSelect={() => move(i, i - 1, "up")}>
                                    Move up
                                </DropdownItem>
                            )}
                            {!last && (
                                <DropdownItem icon={<ChevronDown />} onSelect={() => move(i, i + 1, "down")}>
                                    Move down
                                </DropdownItem>
                            )}
                            <DropdownSeparator />
                            <DropdownItem icon={<X />} onSelect={() => change(() => playlists.remove(p.id, i), { index: i, act: "remove" })}>
                                Remove
                            </DropdownItem>
                        </>
                    )
                    return (
                        <ContextArea key={`${i}:${it.mediaId}:${it.episode}`} menu={menu} data-row className={cn("flex items-center gap-3 sm:gap-4", classic ? "card p-3" : "border-b border-line py-3")}>
                            <Link to={`/entry?id=${it.mediaId}`} className="focus-ring shrink-0 rounded-lg max-sm:hidden" tabIndex={-1}>
                                {it.image ? <img src={img(it.image)} alt="" className="h-12 w-20 rounded-lg object-cover" /> : <div className="h-12 w-20 rounded-lg bg-surface-3" />}
                            </Link>
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{it.title}</p>
                                <p className="mt-0.5 truncate text-sm text-muted tabular-nums">
                                    {i + 1}. Episode {it.episode}
                                </p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <IconButton data-act="play" label="Play from here" onClick={() => playPlaylist(p, i)}>
                                    <Play className="size-4" />
                                </IconButton>
                                {/* At the ends they do nothing, but stay: a disabled button would lose the remote's focus. */}
                                <IconButton data-act="up" label="Move up" aria-disabled={first || undefined} className={cn(first && "opacity-40")} onClick={() => move(i, i - 1, "up")}>
                                    <ChevronUp className="size-4" />
                                </IconButton>
                                <IconButton data-act="down" label="Move down" aria-disabled={last || undefined} className={cn(last && "opacity-40")} onClick={() => move(i, i + 1, "down")}>
                                    <ChevronDown className="size-4" />
                                </IconButton>
                                <IconButton data-act="remove" label="Remove" onClick={() => change(() => playlists.remove(p.id, i), { index: i, act: "remove" })}>
                                    <X className="size-4" />
                                </IconButton>
                            </div>
                        </ContextArea>
                    )
                })}
            </div>
            <RenameDialog open={renaming} onClose={() => setRenaming(false)} p={p} />
            <Dialog
                open={deleting}
                onOpenChange={setDeleting}
                title={`Delete ${p.name}?`}
                description="The episodes stay in your library."
                className="w-[min(92vw,420px)]"
                footer={
                    <>
                        <Button onClick={() => setDeleting(false)}>Cancel</Button>
                        <Button
                            variant="danger"
                            onClick={() =>
                                playlists.delete(p.id).then(
                                    () => {
                                        setDeleting(false)
                                        keepPlaylist(qc, null, p.id)
                                        navigate("/playlists", { replace: true })
                                    },
                                    (e: Error) => toast.error(e.message),
                                )
                            }
                        >
                            Delete
                        </Button>
                    </>
                }
            />
        </div>
    )
}

function RenameDialog({ open, onClose, p }: { open: boolean; onClose: () => void; p: Playlist }) {
    const qc = useQueryClient()
    const [name, setName] = useState(p.name)
    useEffect(() => {
        if (open) setName(p.name)
    }, [open, p.name])
    const save = () =>
        name.trim() &&
        playlists.rename(p.id, name.trim()).then(
            next => {
                keepPlaylist(qc, next)
                onClose()
            },
            (e: Error) => toast.error(e.message),
        )
    return (
        <Dialog open={open} onOpenChange={o => !o && onClose()} title="Rename playlist" className="w-[min(92vw,420px)]">
            <form
                className="flex gap-2"
                onSubmit={e => {
                    e.preventDefault()
                    save()
                }}
            >
                <Input value={name} onChange={e => setName(e.target.value)} maxLength={100} aria-label="Name" autoFocus />
                <Button type="submit" variant="primary" disabled={!name.trim()}>
                    Save
                </Button>
            </form>
        </Dialog>
    )
}
