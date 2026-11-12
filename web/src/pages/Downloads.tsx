import { Download, RotateCcw, Trash2, X } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { toast } from "@/lib/toast"
import { EmptyState, ErrorState, IconButton, Progress } from "@/components/ui"
import { api } from "@/lib/api"
import { useDownloads, useStatus } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import type { DownloadItem } from "@/lib/types"
import { cn, img } from "@/lib/utils"

const RUNNING = ["queued", "resolving", "downloading"]
// A group's rows: in this look on hairlines, not a box each.
const rows = (classic: boolean) => cn("flex flex-col", classic ? "gap-2" : "border-t border-line")

// A group's name: in this look a small capital label (in a span: a heading
// has its own face).
function GroupName({ children }: { children: React.ReactNode }) {
    const classic = useClassic()
    return (
        <h2 className={cn("text-sm font-medium text-muted", classic ? "mb-3" : "mb-1")}>
            <span className={classic ? undefined : "label"}>{children}</span>
        </h2>
    )
}

export default function DownloadsPage() {
    const classic = useClassic()
    const { data, isLoading, error, refetch, isFetching } = useDownloads()
    const { data: status } = useStatus()
    // This device's downloads go to another Aniko (a TV's to its computer):
    // that one's list is shown, as it's where they are.
    const toHost = !!status?.settings.sharing.downloadTo
    const host = useQuery({
        queryKey: ["downloads-host"],
        queryFn: () => api.get<{ host: string; items: DownloadItem[] | null; error?: string }>("/api/downloads/host"),
        enabled: toHost,
        refetchInterval: 3000,
    })
    if (toHost && host.data?.host) return <HostDownloads host={host.data.host} items={host.data.items ?? []} error={host.data.error} refetch={() => host.refetch()} local={data ?? []} />
    const items = data ?? []
    const active = items.filter(i => RUNNING.includes(i.status))
    const done = items.filter(i => !RUNNING.includes(i.status))
    const call = (p: Promise<unknown>) => p.catch((e: Error) => toast.error(e.message))

    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div className="mb-8 flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-[1.75rem] font-semibold tracking-tight">Downloads</h1>
                    <p className="mt-1 truncate text-sm text-muted">Saved to {status?.settings.aniCli.downloadDir || status?.settings.library.dir || "your library"}</p>
                </div>
                {done.length > 0 && (
                    <IconButton label="Clear finished" onClick={() => call(api.post("/api/downloads/clear"))}>
                        <Trash2 className="size-4" />
                    </IconButton>
                )}
            </div>
            {error && !data && <ErrorState title="Couldn't load the downloads" error={error} retrying={isFetching} onRetry={() => refetch()} />}
            {!isLoading && !error && items.length === 0 && (
                <EmptyState icon={<Download className="size-6" />} title="No downloads yet">
                    Download an episode from an anime's Watch online tab.
                </EmptyState>
            )}
            {active.length > 0 && (
                <section className="mb-8">
                    <GroupName>In progress</GroupName>
                    <div className={rows(classic)}>
                        {active.map(i => (
                            <Row key={i.id} item={i} onCancel={() => call(api.post(`/api/downloads/${i.id}/cancel`))} />
                        ))}
                    </div>
                </section>
            )}
            {done.length > 0 && (
                <section>
                    <GroupName>History</GroupName>
                    <div className={rows(classic)}>
                        {done.map(i => (
                            <Row key={i.id} item={i} onRetry={() => call(api.post(`/api/downloads/${i.id}/retry`))} onRemove={() => call(api.del(`/api/downloads/${i.id}`))} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

function HostDownloads({ host, items, error, refetch, local }: { host: string; items: DownloadItem[]; error?: string; refetch: () => void; local: DownloadItem[] }) {
    const classic = useClassic()
    const call = (p: Promise<unknown>) => p.then(refetch, (e: Error) => toast.error(e.message))
    const active = items.filter(i => RUNNING.includes(i.status))
    const done = items.filter(i => !RUNNING.includes(i.status)).slice(0, 50)
    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div className="mb-8">
                <h1 className="text-[1.75rem] font-semibold tracking-tight">Downloads</h1>
                <p className="mt-1 truncate text-sm text-muted">Saved on {host}</p>
            </div>
            {error && <p className={cn("mb-8 text-sm text-rose-200", classic ? "rounded-xl bg-rose-500/10 p-4" : "border-l border-rose-400 pl-3")}>{error}</p>}
            {!error && items.length === 0 && (
                <EmptyState icon={<Download className="size-6" />} title={`Nothing downloading on ${host}`}>
                    Download an episode from an anime's Watch online tab.
                </EmptyState>
            )}
            {active.length > 0 && (
                <section className="mb-8">
                    <GroupName>In progress</GroupName>
                    <div className={rows(classic)}>
                        {active.map(i => (
                            <Row key={i.id} item={i} onCancel={() => call(api.post(`/api/downloads/host/${encodeURIComponent(i.id)}/cancel`))} />
                        ))}
                    </div>
                </section>
            )}
            {done.length > 0 && (
                <section className="mb-8">
                    <GroupName>History</GroupName>
                    <div className={rows(classic)}>
                        {done.map(i => (
                            <Row key={i.id} item={i} onRetry={() => call(api.post(`/api/downloads/host/${encodeURIComponent(i.id)}/retry`))} />
                        ))}
                    </div>
                </section>
            )}
            {local.length > 0 && (
                <section>
                    <GroupName>On this device</GroupName>
                    <div className={rows(classic)}>
                        {local.map(i => (
                            <Row
                                key={i.id}
                                item={i}
                                onCancel={RUNNING.includes(i.status) ? () => call(api.post(`/api/downloads/${i.id}/cancel`)) : undefined}
                                onRemove={RUNNING.includes(i.status) ? undefined : () => call(api.del(`/api/downloads/${i.id}`))}
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

function Row({ item, onCancel, onRetry, onRemove }: { item: DownloadItem; onCancel?: () => void; onRetry?: () => void; onRemove?: () => void }) {
    const statusLabel = { queued: "Queued", resolving: "Resolving stream", downloading: "Downloading", completed: "Completed", failed: "Failed", canceled: "Canceled" }[item.status]
    // Its length isn't known: how much is downloaded, instead of a percentage.
    const soFar = item.done && !item.progress
    const running = item.status === "downloading" || item.status === "resolving"
    // What it is and how it's going, on one line.
    const facts = [
        `Episode ${item.episode}`,
        item.mode.toUpperCase(),
        item.source === "anicli" ? "ani-cli" : item.provider,
        item.status === "downloading" ? (soFar ? `${item.done} downloaded` : `${Math.floor(item.progress * 100)}%`) : statusLabel,
        item.status === "downloading" && item.speed,
        item.status === "downloading" && item.eta && `ETA ${item.eta}`,
    ].filter(Boolean)
    const classic = useClassic()
    return (
        <div className={cn("flex items-center gap-4 fade-in", classic ? "card p-3" : "border-b border-line py-3")}>
            <Link to={`/entry?id=${item.mediaId}`} className="focus-ring shrink-0 rounded-lg">
                {item.image ? <img src={img(item.image)} alt="" className="h-16 w-11 rounded-lg object-cover" /> : <div className="h-16 w-11 rounded-lg bg-surface-3" />}
            </Link>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.animeTitle}</p>
                <p className={cn("mt-0.5 truncate text-sm text-muted tabular-nums", item.status === "failed" && "text-rose-300", item.status === "completed" && "text-emerald-300/90")}>{facts.join(" · ")}</p>
                {item.error && (
                    <p className="mt-0.5 truncate text-xs text-rose-300" title={item.error}>
                        {item.error}
                    </p>
                )}
                {item.status === "completed" && item.output && (
                    <p className="mt-0.5 truncate text-xs text-subtle" title={item.output}>
                        {item.output}
                    </p>
                )}
                {running && !soFar && <Progress value={item.progress} className={cn("mt-2", item.status === "resolving" && "opacity-50")} />}
            </div>
            <div className="flex shrink-0 gap-1">
                {onCancel && (
                    <IconButton label="Cancel" onClick={onCancel}>
                        <X className="size-4" />
                    </IconButton>
                )}
                {onRetry && (item.status === "failed" || item.status === "canceled") && (
                    <IconButton label="Retry" onClick={onRetry}>
                        <RotateCcw className="size-4" />
                    </IconButton>
                )}
                {onRemove && (
                    <IconButton label="Remove from list" onClick={onRemove}>
                        <Trash2 className="size-4" />
                    </IconButton>
                )}
            </div>
        </div>
    )
}
