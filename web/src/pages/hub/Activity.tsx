import { CircleCheck, Download, Import, KeyRound, Palette, Play, Activity as ActivityIcon } from "lucide-react"
import { EmptyState } from "@/components/ui"
import type { HubOverview } from "@/lib/types"
import { Panel } from "./parts"

// What happened on the hub lately (its last 200 events): episodes started
// and finished, logins given, settings changed and imported.

const ICONS: Record<string, React.ReactNode> = {
    playing: <Play />,
    finished: <CircleCheck />,
    account: <KeyRound />,
    prefs: <Palette />,
    import: <Import />,
    download: <Download />,
}

export default function Activity({ o }: { o: HubOverview }) {
    const events = o.activity ?? []
    if (events.length === 0)
        return (
            <EmptyState icon={<ActivityIcon />} title="Nothing yet">
                What the devices do through the hub shows here: the episodes they watch, the logins and settings they send it.
            </EmptyState>
        )
    // By day, the latest first.
    const days: { day: string; items: typeof events }[] = []
    for (const e of events) {
        const day = dayName(e.at)
        if (days[days.length - 1]?.day !== day) days.push({ day, items: [] })
        days[days.length - 1].items.push(e)
    }
    const name = (user?: number) => o.accounts.find(a => a.user === user)?.name
    return (
        <div className="flex flex-col gap-5">
            {days.map(d => (
                <Panel key={d.day} title={d.day}>
                    <ul className="divide-y divide-line">
                        {d.items.map((e, i) => (
                            <li key={i} className="flex items-start gap-3 px-4 py-3">
                                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-muted [&>svg]:size-3.5">{ICONS[e.kind] ?? <ActivityIcon />}</span>
                                <div className="min-w-0 flex-1 text-sm">
                                    <p>
                                        {e.device && <span className="font-medium">{e.device} </span>}
                                        <span className="text-muted">{e.text}</span>
                                        {e.title && <span> {e.title}</span>}
                                        {e.episode ? <span className="text-muted"> · Episode {e.episode}</span> : null}
                                    </p>
                                    {name(e.user) && <p className="text-xs text-subtle">{name(e.user)}'s account</p>}
                                </div>
                                <time className="shrink-0 text-xs text-subtle tabular-nums" dateTime={new Date(e.at).toISOString()}>
                                    {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </time>
                            </li>
                        ))}
                    </ul>
                </Panel>
            ))}
        </div>
    )
}

function dayName(ms: number) {
    const d = new Date(ms)
    const today = new Date()
    const yesterday = new Date(Date.now() - 86400_000)
    if (d.toDateString() === today.toDateString()) return "Today"
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
    return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
}
