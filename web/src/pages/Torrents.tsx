import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, FolderOpen, Magnet, MoreVertical, Pause, Play, Plus, Power, Settings2, Trash2 } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "@/lib/toast"
import { Button, Dialog, Dropdown, DropdownContent, DropdownItem, DropdownTrigger, EmptyState, ErrorState, IconButton, Input, Progress, Tabs } from "@/components/ui"
import { api } from "@/lib/api"
import { useStatus, useTorrentList } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import type { Torrent } from "@/lib/types"
import { cn, formatBytes, formatSpeed, timeUntil } from "@/lib/utils"

export default function TorrentsPage() {
    const classic = useClassic()
    const { data: status } = useStatus()
    const navigate = useNavigate()
    const { data: clientStatus, refetch: refetchStatus } = useQuery({
        queryKey: ["torrent-client-status"],
        queryFn: () => api.get<{ client: string; connected: boolean; version: string; error?: string; needsAuth?: boolean; host?: string }>("/api/torrent-client/status"),
        refetchInterval: 15000,
    })
    // When downloads go to another Aniko (a TV's to its computer), these are
    // its torrents, in its client.
    const host = clientStatus?.host
    const clientName = host ? clientStatus.client : status?.settings.torrent.defaultClient
    const clientLabel = clientName === "qbittorrent" ? "qBittorrent" : "Transmission"
    const on = host ? ` on ${host}` : ""
    // The host didn't answer: no client to speak of.
    const hostDown = !!host && !clientStatus?.client
    const { data: list, isLoading, error: listError, refetch: refetchList, isFetching: listFetching } = useTorrentList(!!clientStatus?.connected)
    const [filter, setFilter] = useState<"all" | "active" | "done">("all")
    const [addOpen, setAddOpen] = useState(false)
    const [starting, setStarting] = useState(false)
    const qc = useQueryClient()

    const act = async (hashes: string[], action: string) => {
        try {
            await api.post("/api/torrent-client/action", { hashes, action })
            qc.invalidateQueries({ queryKey: ["torrents"] })
        } catch (e: any) {
            toast.error(e.message)
        }
    }
    const start = async () => {
        setStarting(true)
        try {
            await api.post("/api/torrent-client/start")
            await refetchStatus()
            toast.success("Torrent client started")
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setStarting(false)
        }
    }

    const torrents = (list ?? []).filter(t => (filter === "all" ? true : filter === "active" ? ["downloading", "stalled", "metadata", "queued", "checking"].includes(t.state) : t.progress >= 1))
    const down = (list ?? []).reduce((a, t) => a + t.downSpeed, 0)
    const up = (list ?? []).reduce((a, t) => a + t.upSpeed, 0)

    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="min-w-0">
                    <h1 className="text-[1.75rem] font-semibold tracking-tight">Torrents</h1>
                    <p className={cn("mt-1 flex items-center gap-x-2 text-sm text-muted tabular-nums", classic && "flex-wrap")}>
                        <span className={cn("size-2 shrink-0 rounded-full", clientStatus?.connected ? "bg-emerald-400" : "bg-rose-400")} />
                        {hostDown
                            ? `${host} doesn't answer`
                            : host && clientName === "none"
                              ? `${host} has no torrent client set up`
                              : clientName === "none" || !clientName
                                ? "No torrent client configured"
                                : clientStatus?.connected
                                  ? `${clientLabel} ${clientStatus.version}${on} · ↓ ${formatSpeed(down)} · ↑ ${formatSpeed(up)}`
                                  : clientStatus?.needsAuth
                                    ? `${clientLabel}${on} is running but needs ${host ? "its" : "your"} login`
                                    : `${clientLabel}${on} is not reachable`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {!clientStatus?.connected && clientName && clientName !== "none" && clientStatus?.needsAuth && !host && (
                        <Button variant="primary" icon={<Settings2 className="size-4" />} onClick={() => navigate("/settings?tab=torrents")}>
                            Fix login
                        </Button>
                    )}
                    {!clientStatus?.connected && clientName && clientName !== "none" && !clientStatus?.needsAuth && (
                        <Button variant="primary" icon={<Power className="size-4" />} loading={starting} onClick={start}>
                            Start client
                        </Button>
                    )}
                    {/* The page's one filled button, when there's a client to add to. */}
                    {clientStatus?.connected ? (
                        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAddOpen(true)} disabled={hostDown || !clientName || clientName === "none"}>
                            Add magnet
                        </Button>
                    ) : (
                        <IconButton label="Add magnet" icon={<Plus className="size-4" />} onClick={() => setAddOpen(true)} disabled={hostDown || !clientName || clientName === "none"} />
                    )}
                </div>
            </div>

            {host && !hostDown && clientName === "none" && (
                <EmptyState icon={<Magnet className="size-6" />} title={`Set up a torrent client on ${host}`}>
                    Choose qBittorrent or Transmission in Aniko's settings on {host}.
                </EmptyState>
            )}
            {!host && (!clientName || clientName === "none") && (
                <EmptyState icon={<Magnet className="size-6" />} title="Connect a torrent client" action={<Link to="/settings?tab=torrents"><Button variant="primary">Open settings</Button></Link>}>
                    Works with qBittorrent and Transmission.
                </EmptyState>
            )}
            {/* Why it can't be reached, and where it's set up. */}
            {(hostDown || (clientName && clientName !== "none")) && !clientStatus?.connected && clientStatus?.error && (
                <EmptyState
                    icon={<AlertTriangle className="size-6" />}
                    title={hostDown ? `${host} doesn't answer` : clientStatus.needsAuth ? `${clientLabel} needs a login` : `Can't reach ${clientLabel}${on}`}
                    action={
                        !host && (
                            <Link to="/settings?tab=torrents">
                                <Button icon={<Settings2 className="size-4" />}>Torrent settings</Button>
                            </Link>
                        )
                    }
                >
                    <span className="break-words">{clientStatus.error}</span>
                </EmptyState>
            )}

            {clientStatus?.connected && (
                <>
                    <Tabs
                        className="mb-6"
                        value={filter}
                        onChange={setFilter}
                        tabs={[
                            { value: "all", label: "All", count: list?.length ?? 0 },
                            { value: "active", label: "Active" },
                            { value: "done", label: "Completed" },
                        ]}
                    />
                    {isLoading && <div className="card h-40 shimmer" />}
                    {!isLoading && listError && !list && <ErrorState title="Couldn't read the torrent list" error={listError} retrying={listFetching} onRetry={() => refetchList()} />}
                    {!isLoading && !(listError && !list) && torrents.length === 0 && <EmptyState icon={<Magnet className="size-6" />} title="No torrents" />}
                    {/* This look: rows on hairlines, not a box each. */}
                    <div className={cn("flex flex-col", classic ? "gap-2" : torrents.length > 0 && "border-t border-line")}>
                        {torrents.map(t => (
                            <TorrentRow key={t.hash} t={t} onAction={a => act([t.hash], a)} canOpen={status?.client !== "lan" && !host} />
                        ))}
                    </div>
                </>
            )}
            <AddMagnetDialog open={addOpen} onOpenChange={setAddOpen} host={host} />
        </div>
    )
}

function TorrentRow({ t, onAction, canOpen }: { t: Torrent; onAction: (a: string) => void; canOpen: boolean }) {
    const paused = t.state === "paused" || t.state === "completed"
    const facts = [
        `${Math.floor(t.progress * 100)}%`,
        formatBytes(t.size),
        `↓ ${formatSpeed(t.downSpeed)}`,
        `↑ ${formatSpeed(t.upSpeed)}`,
        `${t.seeds} seeds`,
        `${t.peers} peers`,
        t.eta > 0 && t.progress < 1 && `ETA ${timeUntil(t.eta)}`,
        `Ratio ${t.ratio.toFixed(2)}`,
    ].filter(Boolean)
    const classic = useClassic()
    return (
        <div className={cn("flex items-center gap-3 fade-in", classic ? "card p-4" : "border-b border-line py-4")}>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={t.name}>
                    {t.name}
                </p>
                <p className="mt-0.5 text-sm text-muted tabular-nums">
                    <span className={cn("capitalize", t.state === "error" && "text-rose-300", t.state === "stalled" && "text-amber-200")}>{t.state}</span>
                    {" · "}
                    {facts.join(" · ")}
                </p>
                <Progress value={t.progress} className="mt-2.5" barClassName={t.progress >= 1 ? "bg-emerald-400" : undefined} />
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <IconButton label={paused ? "Resume" : "Pause"} onClick={() => onAction(paused ? "resume" : "pause")}>
                    {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                </IconButton>
                <Dropdown>
                    <DropdownTrigger asChild>
                        <IconButton aria-label="More">
                            <MoreVertical className="size-4" />
                        </IconButton>
                    </DropdownTrigger>
                    <DropdownContent>
                        {canOpen && (
                            <DropdownItem icon={<FolderOpen />} onSelect={() => onAction("open")}>
                                Open folder
                            </DropdownItem>
                        )}
                        <DropdownItem icon={<Trash2 />} onSelect={() => onAction("remove")}>
                            Remove torrent (keep files)
                        </DropdownItem>
                        <DropdownItem danger icon={<Trash2 />} onSelect={() => confirm("Remove this torrent and delete its downloaded files?") && onAction("removeData")}>
                            Remove torrent and delete files
                        </DropdownItem>
                    </DropdownContent>
                </Dropdown>
            </div>
        </div>
    )
}

function AddMagnetDialog({ open, onOpenChange, host }: { open: boolean; onOpenChange: (v: boolean) => void; host?: string }) {
    const [magnet, setMagnet] = useState("")
    const [busy, setBusy] = useState(false)
    const add = async () => {
        setBusy(true)
        try {
            await api.post("/api/torrent-client/add", { magnet })
            toast.success(host ? `Sent to ${host}'s torrent client` : "Added to the torrent client")
            setMagnet("")
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
            title="Add a torrent"
            description={`Paste a magnet link or .torrent URL. Saves to ${host ? `${host}'s` : "your"} library folder.`}
            footer={
                <Button variant="primary" loading={busy} disabled={!magnet.trim()} onClick={add}>
                    Add
                </Button>
            }
        >
            <Input autoFocus value={magnet} onChange={e => setMagnet(e.target.value)} placeholder="magnet:?xt=urn:btih:…" icon={<Magnet className="size-4" />} />
        </Dialog>
    )
}
