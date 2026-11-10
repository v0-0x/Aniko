import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MoreVertical, Pencil, Play, Plus, Rss, Trash2 } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "@/lib/toast"
import { MediaPicker } from "@/components/MediaPicker"
import { Button, Dialog, Dropdown, DropdownContent, DropdownItem, DropdownTrigger, EmptyState, Field, IconButton, Input, Select, Switch } from "@/components/ui"
import { api } from "@/lib/api"
import { useAutoRules, useSaveSettings, useStatus } from "@/lib/queries"
import type { AutoRule, Media } from "@/lib/types"
import { cn, cover, relativeTime, title } from "@/lib/utils"

export default function AutoDownloaderPage() {
    const { data: rules, isLoading } = useAutoRules()
    const { data: status } = useStatus()
    const save = useSaveSettings()
    const { data: items } = useQuery({ queryKey: ["auto-items"], queryFn: () => api.get<{ key: string; title: string; createdAt: number }[]>("/api/autodownloader/items") })
    const [editing, setEditing] = useState<AutoRule | null>(null)
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
                <p className="mb-8 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-200">
                    No torrent client yet. <Link to="/settings?tab=torrents" className="underline">Set one up</Link> first.
                </p>
            )}
            {!isLoading && (rules ?? []).length === 0 && (
                <EmptyState icon={<Rss className="size-6" />} title="No rules yet">
                    A rule sends an airing anime's new episodes to your torrent client.
                </EmptyState>
            )}
            <div className="grid gap-2 lg:grid-cols-2">
                {(rules ?? []).map(r => (
                    <RuleCard key={r.id} rule={r} onEdit={() => setEditing(r)} />
                ))}
            </div>
            {(items ?? []).length > 0 && (
                <section className="mt-8">
                    <h2 className="mb-3 text-sm font-medium text-muted">Recently grabbed</h2>
                    <div className="card py-1.5">
                        {items!.slice(0, 30).map(i => (
                            <div key={i.key} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                                <span className="truncate">{i.title}</span>
                                <span className="shrink-0 text-muted">{relativeTime(i.createdAt)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
            {editing && <RuleDialog rule={editing} onClose={() => setEditing(null)} />}
        </div>
    )
}

function RuleCard({ rule, onEdit }: { rule: AutoRule; onEdit: () => void }) {
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
    return (
        <div className="card flex items-center gap-4 p-3 fade-in">
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
    const [r, setR] = useState<AutoRule>(rule)
    const [pick, setPick] = useState(false)
    const [mediaTitle, setMediaTitle] = useState(rule.title)
    const [busy, setBusy] = useState(false)
    const qc = useQueryClient()
    const { data: providers } = useQuery({ queryKey: ["torrent-providers"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/torrents/providers") })
    const list = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean)
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
                    <Button className="justify-start" onClick={() => setPick(true)}>
                        {mediaTitle || "Choose an anime…"}
                    </Button>
                </Field>
                <Field label="Comparison title" help="The title used in torrent names.">
                    <Input value={r.title} onChange={e => setR({ ...r, title: e.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Release groups" help="Comma separated, e.g. SubsPlease, Erai-raws">
                        <Input defaultValue={r.releaseGroups.join(", ")} onChange={e => setR({ ...r, releaseGroups: list(e.target.value) })} />
                    </Field>
                    <Field label="Resolutions" help="e.g. 1080, 720">
                        <Input defaultValue={r.resolutions.join(", ")} onChange={e => setR({ ...r, resolutions: list(e.target.value) })} />
                    </Field>
                    <Field label="Must contain" help="Extra words, comma separated">
                        <Input defaultValue={r.additionalTerms.join(", ")} onChange={e => setR({ ...r, additionalTerms: list(e.target.value) })} />
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
