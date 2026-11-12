import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FlaskConical, MoreVertical, Pencil, Play, Plus, Rss, Trash2 } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "@/lib/toast"
import { MediaPicker } from "@/components/MediaPicker"
import { Badge, Button, Dialog, Dropdown, DropdownContent, DropdownItem, DropdownTrigger, EmptyState, Field, IconButton, Input, Select, Spinner, Switch } from "@/components/ui"
import { api } from "@/lib/api"
import { useAutoRules, useSaveSettings, useStatus } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import type { AutoRule, Media } from "@/lib/types"
import { cn, cover, formatBytes, relativeTime, title } from "@/lib/utils"

export default function AutoDownloaderPage() {
    const classic = useClassic()
    const { data: rules, isLoading } = useAutoRules()
    const { data: status } = useStatus()
    const save = useSaveSettings()
    const { data: items } = useQuery({ queryKey: ["auto-items"], queryFn: () => api.get<{ key: string; title: string; createdAt: number }[]>("/api/autodownloader/items") })
    const [editing, setEditing] = useState<AutoRule | null>(null)
    const [testing, setTesting] = useState<{ rule: AutoRule; name: string } | null>(null)
    const [running, setRunning] = useState(false)
    const qc = useQueryClient()
    const settings = status?.settings
    const newRule = () =>
        setEditing({ enabled: true, mediaId: 0, title: "", releaseGroups: [], resolutions: [settings?.torrent.preferredResolution || "1080"], additionalTerms: [], episodeType: "recent", minSeeders: 1, provider: "nyaa" })

    const run = async () => {
        setRunning(true)
        try {
            const r = await api.post<{ added: number }>("/api/autodownloader/run")
            toast.success(r.added ? `Added ${r.added} new torrent(s)` : "Nothing new right now")
            qc.invalidateQueries({ queryKey: ["auto-items"] })
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setRunning(false)
        }
    }

    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <h1 className="text-[1.75rem] font-semibold tracking-tight">Auto downloader</h1>
                <div className="flex items-center gap-2">
                    {settings && (
                        <label className="mr-1 flex items-center gap-2.5 text-sm text-muted">
                            Enabled
                            <Switch checked={settings.torrent.autoDownloader} onChange={v => save.mutate({ ...settings, torrent: { ...settings.torrent, autoDownloader: v } })} />
                        </label>
                    )}
                    <IconButton label="Check now" icon={<Play className="size-4" />} loading={running} onClick={run} />
                    <Button variant="primary" icon={<Plus className="size-4" />} onClick={newRule}>
                        New rule
                    </Button>
                </div>
            </div>
            {settings?.torrent.defaultClient === "none" && (
                <p className={cn("mb-8 text-sm text-amber-200", classic ? "rounded-xl bg-amber-500/10 p-4" : "border-l border-amber-400 pl-3")}>
                    No torrent client yet. <Link to="/settings?tab=torrents" className="underline">Set one up</Link> first.
                </p>
            )}
            {!isLoading && (rules ?? []).length === 0 && (
                <EmptyState icon={<Rss className="size-6" />} title="No rules yet">
                    A rule sends an airing anime's new episodes to your torrent client.
                </EmptyState>
            )}
            {/* This look: rows on hairlines, not a box each. */}
            <div className={cn("grid lg:grid-cols-2", classic ? "gap-2" : cn("grid-cols-1 gap-x-8", (rules ?? []).length > 0 && "border-t border-line"))}>
                {(rules ?? []).map(r => (
                    <RuleCard key={r.id} rule={r} onEdit={() => setEditing(r)} onTest={name => setTesting({ rule: r, name })} />
                ))}
            </div>
            {(items ?? []).length > 0 && (
                <section className="mt-8">
                    <h2 className={cn("text-sm font-medium text-muted", classic ? "mb-3" : "mb-1")}>
                        {/* This look: a small capital label (in a span: a heading has its own face). */}
                        <span className={classic ? undefined : "label"}>Recently grabbed</span>
                    </h2>
                    <div className={classic ? "card py-1.5" : "divide-y divide-line border-y border-line"}>
                        {items!.slice(0, 30).map(i => (
                            <div key={i.key} className={cn("flex items-center justify-between gap-4 py-2 text-sm", classic && "px-4")}>
                                <span className="truncate">{i.title}</span>
                                <span className="shrink-0 text-muted">{relativeTime(i.createdAt)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
            {editing && <RuleDialog rule={editing} onClose={() => setEditing(null)} />}
            {testing && <TestDialog rule={testing.rule} name={testing.name} onClose={() => setTesting(null)} />}
        </div>
    )
}

function RuleCard({ rule, onEdit, onTest }: { rule: AutoRule; onEdit: () => void; onTest: (name: string) => void }) {
    const classic = useClassic()
    const qc = useQueryClient()
    const { data: media } = useQuery({ queryKey: ["entry-lite", rule.mediaId], queryFn: () => api.get<{ media: Media }>(`/api/anime/${rule.mediaId}`), staleTime: 3600_000 })
    const toggle = async (enabled: boolean) => {
        try {
            await api.post("/api/autodownloader/rules", { ...rule, enabled })
            qc.invalidateQueries({ queryKey: ["auto-rules"] })
        } catch (e: any) {
            toast.error(e.message)
        }
    }
    const del = async () => {
        if (!confirm(`Delete the rule for ${media?.media ? title(media.media) : rule.title}?`)) return
        try {
            await api.del(`/api/autodownloader/rules/${rule.id}`)
            qc.invalidateQueries({ queryKey: ["auto-rules"] })
        } catch (e: any) {
            toast.error(e.message)
        }
    }
    const name = media?.media ? title(media.media) : rule.title
    const facts = [...rule.releaseGroups, ...rule.resolutions.map(r => `${r}p`), rule.episodeType === "all" ? "All episodes" : "New episodes"]
    if (rule.delayMinutes) facts.push(`Waits ${rule.delayMinutes} min`)
    return (
        <div className={cn("flex items-center gap-4 fade-in", classic ? "card p-3" : "border-b border-line py-3")}>
            {media?.media && <img src={cover(media.media, "thumb")} alt="" className="h-16 w-11 shrink-0 rounded-lg object-cover" />}
            <div className={cn("min-w-0 flex-1 transition-opacity", !rule.enabled && "opacity-60")}>
                <p className="truncate font-medium">{name}</p>
                <p className="mt-0.5 truncate text-sm text-muted">{facts.join(" · ")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <Switch checked={rule.enabled} onChange={toggle} label={`Rule for ${name} enabled`} />
                <Dropdown>
                    <DropdownTrigger asChild>
                        <IconButton aria-label="More">
                            <MoreVertical className="size-4" />
                        </IconButton>
                    </DropdownTrigger>
                    <DropdownContent>
                        <DropdownItem icon={<Pencil />} onSelect={onEdit}>
                            Edit
                        </DropdownItem>
                        <DropdownItem icon={<FlaskConical />} onSelect={() => onTest(name)}>
                            Test
                        </DropdownItem>
                        <DropdownItem danger icon={<Trash2 />} onSelect={del}>
                            Delete
                        </DropdownItem>
                    </DropdownContent>
                </Dropdown>
            </div>
        </div>
    )
}

function RuleDialog({ rule, onClose }: { rule: AutoRule; onClose: () => void }) {
    const classic = useClassic()
    const [r, setR] = useState<AutoRule>(rule)
    const [pick, setPick] = useState(false)
    const [mediaTitle, setMediaTitle] = useState(rule.title)
    const [busy, setBusy] = useState(false)
    const qc = useQueryClient()
    const { data: providers } = useQuery({ queryKey: ["torrent-providers"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/torrents/providers") })
    const list = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean)
    const num = (s: string) => Math.max(0, Math.floor(Number(s)) || 0)
    const save = async () => {
        if (!r.mediaId) return toast.error("Pick an anime first")
        setBusy(true)
        try {
            await api.post("/api/autodownloader/rules", r)
            qc.invalidateQueries({ queryKey: ["auto-rules"] })
            toast.success("Rule saved")
            onClose()
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setBusy(false)
        }
    }
    return (
        <Dialog
            open
            onOpenChange={v => !v && onClose()}
            title={rule.id ? "Edit rule" : "New rule"}
            className="w-[min(94vw,620px)]"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" loading={busy} onClick={save}>
                        Save rule
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <Field label="Anime">
                    <Button className={cn("justify-start", !classic && "-ml-3.5 self-start")} onClick={() => setPick(true)}>
                        {mediaTitle || "Choose an anime…"}
                    </Button>
                </Field>
                <Field label="Comparison title" help="The title used in torrent names.">
                    <Input value={r.title} onChange={e => setR({ ...r, title: e.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Release groups" help="Preferred first, e.g. SubsPlease, Erai-raws">
                        <Input defaultValue={r.releaseGroups.join(", ")} onChange={e => setR({ ...r, releaseGroups: list(e.target.value) })} />
                    </Field>
                    <Field label="Resolutions" help="Preferred first, e.g. 1080, 720">
                        <Input defaultValue={r.resolutions.join(", ")} onChange={e => setR({ ...r, resolutions: list(e.target.value) })} />
                    </Field>
                    <Field label="Must contain" help="Extra words, comma separated">
                        <Input defaultValue={r.additionalTerms.join(", ")} onChange={e => setR({ ...r, additionalTerms: list(e.target.value) })} />
                    </Field>
                    <Field label="Must not contain" help="Comma separated">
                        <Input defaultValue={(r.excludeTerms ?? []).join(", ")} onChange={e => setR({ ...r, excludeTerms: list(e.target.value) })} />
                    </Field>
                    <Field label="Size (MB)">
                        <div className="flex gap-2">
                            <Input type="number" min={0} placeholder="Min" aria-label="Minimum size (MB)" value={r.minSizeMb || ""} onChange={e => setR({ ...r, minSizeMb: num(e.target.value) })} />
                            <Input type="number" min={0} placeholder="Max" aria-label="Maximum size (MB)" value={r.maxSizeMb || ""} onChange={e => setR({ ...r, maxSizeMb: num(e.target.value) })} />
                        </div>
                    </Field>
                    <Field label="Wait before grabbing" help="Minutes, for a preferred release">
                        <Input type="number" min={0} placeholder="0" value={r.delayMinutes || ""} onChange={e => setR({ ...r, delayMinutes: num(e.target.value) })} />
                    </Field>
                    <Field label="Minimum seeders">
                        <Input type="number" min={0} value={r.minSeeders} onChange={e => setR({ ...r, minSeeders: Number(e.target.value) })} />
                    </Field>
                    <Field label="Episodes">
                        <Select
                            value={r.episodeType}
                            onChange={v => setR({ ...r, episodeType: v as AutoRule["episodeType"] })}
                            options={[
                                { value: "recent", label: "Only episodes after my progress" },
                                { value: "all", label: "Every missing episode" },
                            ]}
                        />
                    </Field>
                    <Field label="Provider">
                        <Select value={r.provider || "nyaa"} onChange={v => setR({ ...r, provider: v })} options={(providers ?? []).map(p => ({ value: p.id, label: p.name }))} />
                    </Field>
                </div>
            </div>
            <MediaPicker
                open={pick}
                onOpenChange={setPick}
                onPick={m => {
                    setR(x => ({ ...x, mediaId: m.id, title: x.title || m.title.romaji || title(m) }))
                    setMediaTitle(title(m))
                }}
            />
        </Dialog>
    )
}

// What a rule's run would do now (POST /api/autodownloader/rules/{id}/test).
type Candidate = { episode: number; name: string; group: string; resolution: string; seeders: number; size: number; grab: boolean; reason?: string }

function TestDialog({ rule, name, onClose }: { rule: AutoRule; name: string; onClose: () => void }) {
    const { data, error, isFetching, refetch } = useQuery({
        queryKey: ["auto-test", rule.id],
        queryFn: () => api.post<Candidate[]>(`/api/autodownloader/rules/${rule.id}/test`),
        gcTime: 0,
        retry: false,
    })
    const grabs = (data ?? []).filter(c => c.grab).length
    return (
        <Dialog
            open
            onOpenChange={v => !v && onClose()}
            title={`Test: ${name}`}
            description={data && (grabs ? `Would grab ${grabs}` : "Nothing to grab")}
            className="w-[min(94vw,620px)]"
            footer={
                <>
                    <Button variant="ghost" loading={isFetching} onClick={() => refetch()}>
                        Again
                    </Button>
                    <Button variant="primary" onClick={onClose}>
                        Close
                    </Button>
                </>
            }
        >
            {isFetching && !data ? (
                <div className="grid place-items-center py-10">
                    <Spinner />
                </div>
            ) : error ? (
                <p className="text-sm text-rose-300">{(error as Error).message}</p>
            ) : (data ?? []).length === 0 ? (
                <p className="text-sm text-muted">No results</p>
            ) : (
                <ul className="-mx-2 flex flex-col">
                    {data!.map((c, i) => (
                        <li key={i} tabIndex={0} className={cn("focus-ring flex items-start gap-3 rounded-lg px-2 py-2", !c.grab && "opacity-70")}>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm [overflow-wrap:anywhere]">{c.name}</p>
                                <p className="mt-0.5 text-xs text-muted">
                                    {[c.episode > 0 && `Ep ${c.episode}`, c.group, c.resolution, `${c.seeders} seeders`, c.size > 0 && formatBytes(c.size)].filter(Boolean).join(" · ")}
                                </p>
                            </div>
                            <Badge tone={c.grab ? "green" : "gray"} className="mt-0.5 shrink-0">
                                {c.grab ? "Grab" : c.reason}
                            </Badge>
                        </li>
                    ))}
                </ul>
            )}
        </Dialog>
    )
}
