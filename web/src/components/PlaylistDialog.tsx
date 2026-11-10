import { useQueryClient } from "@tanstack/react-query"
import { ListPlus, ListVideo } from "lucide-react"
import { useEffect, useState } from "react"
import { keepPlaylist, playlists, usePlaylists, type Playlist, type PlaylistItem } from "@/lib/playlist"
import { toast } from "@/lib/toast"
import { Button, Dialog, Input } from "./ui"

const count = (n: number) => `${n} episode${n === 1 ? "" : "s"}`

// Adds episodes to a playlist: one of yours, or a new one. Every choice is
// a button (a TV's remote goes down the list).
export function AddToPlaylistDialog({ items, onClose }: { items: PlaylistItem[] | null; onClose: () => void }) {
    const qc = useQueryClient()
    const { data: lists, isLoading } = usePlaylists()
    const [name, setName] = useState("")
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        if (items) setName("")
    }, [items])
    const what = items?.length === 1 ? `Episode ${items[0].episode}` : count(items?.length ?? 0)

    const run = async (fn: () => Promise<Playlist>) => {
        setBusy(true)
        try {
            const p = await fn()
            keepPlaylist(qc, p)
            toast.success(`Added ${what} to ${p.name}`)
            onClose()
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setBusy(false)
        }
    }
    const create = () => name.trim() && items && run(() => playlists.create(name.trim(), items))

    return (
        <Dialog open={!!items} onOpenChange={o => !o && onClose()} title="Add to playlist" description={what} className="w-[min(92vw,420px)]">
            <div className="flex flex-col gap-1">
                {isLoading && <p className="py-2 text-sm text-muted">Loading…</p>}
                {(lists ?? []).map(p => (
                    <button
                        key={p.id}
                        disabled={busy}
                        onClick={() => items && run(() => playlists.add(p.id, items))}
                        className="focus-ring flex h-11 items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-white/[0.06] disabled:opacity-50"
                    >
                        <ListVideo className="size-4 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                        <span className="shrink-0 text-xs text-subtle tabular-nums">{count(p.items.length)}</span>
                    </button>
                ))}
            </div>
            <form
                className="mt-3 flex gap-2"
                onSubmit={e => {
                    e.preventDefault()
                    create()
                }}
            >
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="New playlist" maxLength={100} aria-label="New playlist name" />
                <Button type="submit" variant="primary" icon={<ListPlus className="size-4" />} disabled={!name.trim()} loading={busy}>
                    Create
                </Button>
            </form>
        </Dialog>
    )
}
