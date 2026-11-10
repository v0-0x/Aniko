import { useQuery } from "@tanstack/react-query"
import { ArrowDownToLine, Cpu, HardDrive, LibraryBig, MemoryStick, MonitorPlay, Server as ServerIcon, Thermometer } from "lucide-react"
import { Link } from "react-router-dom"
import { Badge, EmptyState, Spinner } from "@/components/ui"
import { api } from "@/lib/api"
import type { HubSystem, SharingPeer } from "@/lib/types"
import { cn } from "@/lib/utils"
import { bytes, Meter, OnlineDot, span, StatTile } from "./hub/parts"

// Your server (mediaserver's anime side) from the app: whether it's on, how
// the computer is, how full its drives are and how much it's doing. Who is
// on it and what they watch stays on its dashboard, behind its password.

type ServerState = {
    name: string
    version: string
    system: HubSystem
    encoder: string
    streams: number
    converting: number
    downloads: number
    files: number
    anime: number
    size: number
    scanning: boolean
}
type ServerView = { host: SharingPeer; state: ServerState | null; needs?: string }

const count = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`

export default function ServerPage() {
    const { data, isLoading } = useQuery({ queryKey: ["servers"], queryFn: () => api.get<ServerView[]>("/api/servers"), refetchInterval: 5000 })
    return (
        <div className="flex flex-col gap-8 px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div>
                <h1 className="text-[1.75rem] font-semibold tracking-tight">Server</h1>
                <p className="mt-1 text-sm text-muted">The server this device uses.</p>
            </div>
            {isLoading ? (
                <Spinner className="mx-auto mt-10" />
            ) : !data?.length ? (
                <EmptyState icon={<ServerIcon />} title="No server yet">
                    Add a mediaserver in{" "}
                    <Link to="/settings?tab=devices" className="text-fg underline">
                        Settings › Devices & network
                    </Link>
                    .
                </EmptyState>
            ) : (
                data.map(s => <ServerCard key={s.host.id} server={s} />)
            )}
        </div>
    )
}

function ServerCard({ server: { host, state: st, needs } }: { server: ServerView }) {
    const sys = st?.system
    const temp = !sys?.temp ? "" : sys.throttled ? "Slowed down: too hot or underpowered" : sys.temp >= 75 ? "Hot" : "Fine"
    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <OnlineDot online={host.online} />
                <h2 className="text-xl font-semibold tracking-tight">{st?.name || host.name}</h2>
                <Badge tone={host.online ? "green" : "gray"}>{host.online ? "Online" : "Off or away"}</Badge>
                {st && <span className="text-sm text-muted">mediaserver {st.version}</span>}
                {sys && (
                    <span className="text-sm text-subtle">
                        {sys.model || sys.hostname} · on for {span(sys.uptime)}
                    </span>
                )}
            </div>
            {!host.online && <p className="text-sm text-muted">It didn't answer.</p>}
            {host.online && !st && <p className="text-sm text-muted">{needs}</p>}
            {st && sys && (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatTile label="Doing now" icon={<MonitorPlay />} value={st.streams ? count(st.streams, "stream") : "Idle"} sub={st.converting ? `${st.converting} converted as ${st.converting === 1 ? "it plays" : "they play"}` : st.streams ? "sent as they are" : "nothing is playing from it"} />
                        <StatTile label="Downloading" icon={<ArrowDownToLine />} value={st.downloads ? count(st.downloads, "episode") : "Nothing"} sub={st.scanning ? "and scanning its library" : "onto the server"} />
                        <StatTile label="CPU" icon={<Cpu />} value={`${Math.round(sys.cpu)}%`} sub={`${count(sys.cores, "core")} · load ${sys.load.toFixed(2)}`}>
                            <Meter value={sys.cpu} max={100} label="CPU in use" className="mt-auto mb-1" />
                        </StatTile>
                        <StatTile label="Memory" icon={<MemoryStick />} value={bytes(sys.memUsed)} sub={`of ${bytes(sys.memTotal)}`}>
                            <Meter value={sys.memUsed} max={sys.memTotal} label="Memory in use" className="mt-auto mb-1" />
                        </StatTile>
                        <StatTile label="Temperature" icon={<Thermometer />} value={sys.temp ? `${Math.round(sys.temp)}°C` : "—"} sub={<span className={cn(sys.throttled && "text-amber-300")}>{temp || "Not known on this computer"}</span>} />
                        <StatTile label="Library" icon={<LibraryBig />} value={count(st.anime, "anime", "anime")} sub={`${count(st.files, "episode")} · ${bytes(st.size)}`} />
                        <StatTile label="Converts with" icon={<Cpu />} value={st.encoder || "Nothing"} sub={st.encoder ? "for files a device can't play" : "ffmpeg isn't installed"} />
                    </div>
                    {!!sys.disks?.length && (
                        <div className="rounded-xl border border-line bg-surface-1 p-4">
                            <p className="mb-3 flex items-center gap-2 text-sm font-medium [&>svg]:size-4 [&>svg]:text-muted">
                                <HardDrive /> Storage
                            </p>
                            <div className="flex flex-col gap-4">
                                {sys.disks!.map(d => (
                                    <div key={d.path}>
                                        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                                            <span className="truncate text-muted" title={d.path}>
                                                {d.path}
                                            </span>
                                            <span className="shrink-0 tabular-nums">
                                                {bytes(d.free)} free <span className="text-subtle">of {bytes(d.total)}</span>
                                            </span>
                                        </div>
                                        <Meter value={d.total - d.free} max={d.total} label={`Space used on ${d.path}`} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    )
}
