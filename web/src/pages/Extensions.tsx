import { useQueryClient } from "@tanstack/react-query"
import {
    AlertTriangle,
    ArrowUpCircle,
    BookOpen,
    CheckCircle2,
    Download,
    ExternalLink,
    FileText,
    Globe,
    Link2,
    Magnet,
    MoreVertical,
    Puzzle,
    RefreshCw,
    Search,
    Settings2,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    Trash2,
    Tv,
    TriangleAlert,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "@/lib/toast"
import { Badge, Button, Dialog, Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger, EmptyState, Field, IconButton, Input, Popover, Select, Switch, Tabs } from "@/components/ui"
import { api } from "@/lib/api"
import { useExtensions, useMarketplace, useStatus } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import type { ExtensionInfo, LogLineT, MarketEntry } from "./extensionTypes"
import { cn } from "@/lib/utils"

const TYPES: Record<string, { label: string; icon: React.ReactNode }> = {
    plugin: { label: "Plugin", icon: <Puzzle className="size-3.5" /> },
    "onlinestream-provider": { label: "Online streaming", icon: <Tv className="size-3.5" /> },
    "anime-torrent-provider": { label: "Torrent", icon: <Magnet className="size-3.5" /> },
    "manga-provider": { label: "Manga", icon: <BookOpen className="size-3.5" /> },
    "custom-source": { label: "Custom source", icon: <Globe className="size-3.5" /> },
}

const openLink = (url: string) => window.open(url, "_blank", "noopener,noreferrer")

// The extensions, in columns: in this look rows on hairlines, not a box each.
const grid = (classic: boolean) => cn("grid lg:grid-cols-2 2xl:grid-cols-3", classic ? "gap-2" : "gap-x-8 border-t border-line")
const row = (classic: boolean) => cn("flex items-center gap-3 fade-in", classic ? "card p-3" : "border-b border-line py-3")

export default function ExtensionsPage() {
    const classic = useClassic()
    const [params, setParams] = useSearchParams()
    const tab = params.get("tab") === "marketplace" ? "marketplace" : "installed"
    const { data: installed } = useExtensions()
    const [manualOpen, setManualOpen] = useState(false)
    const [checking, setChecking] = useState(false)
    const [updates, setUpdates] = useState<Record<string, string>>({})
    // From another device on the network: what's installed is shown, but only
    // the computer Aniko runs on installs and sets up extensions (the server
    // refuses the rest).
    const { data: status } = useStatus()
    const lan = status?.client === "lan"
    const check = async () => {
        setChecking(true)
        try {
            const u = await api.get<{ id: string; latestVersion: string }[]>("/api/extensions/updates")
            setUpdates(Object.fromEntries(u.map(x => [x.id, x.latestVersion])))
            toast.success(u.length ? `${u.length} update(s) available` : "Everything is up to date")
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setChecking(false)
        }
    }
    return (
        <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <h1 className="text-[1.75rem] font-semibold tracking-tight">Extensions</h1>
                <div className="flex min-w-0 items-center gap-1">
                    <Tabs
                        className="mr-1"
                        value={tab}
                        onChange={t => setParams({ tab: t }, { replace: true })}
                        tabs={[
                            { value: "installed", label: "Installed", count: installed?.length ?? 0 },
                            { value: "marketplace", label: "Marketplace" },
                        ]}
                    />
                    {!lan && tab === "installed" && (installed?.length ?? 0) > 0 && (
                        <IconButton label="Check for updates" icon={<RefreshCw className="size-4" />} loading={checking} onClick={check} />
                    )}
                    {!lan && (
                        <IconButton label="Install from URL" onClick={() => setManualOpen(true)}>
                            <Link2 className="size-4" />
                        </IconButton>
                    )}
                </div>
            </div>
            {lan && <p className={cn("mb-6 text-sm text-muted", classic ? "rounded-xl bg-white/[0.04] px-3 py-2" : "border-l border-line-strong pl-3")}>View only. Set up extensions on the computer Aniko runs on.</p>}
            <fieldset disabled={lan} className="m-0 min-w-0 border-0 p-0">
                {tab === "installed" ? <Installed updates={updates} /> : <Marketplace />}
            </fieldset>
            <InstallUrlDialog open={manualOpen} onOpenChange={setManualOpen} />
        </div>
    )
}

function ExtIcon({ src, className }: { src?: string; className?: string }) {
    const [err, setErr] = useState(false)
    if (!src || err)
        return (
            <span className={cn("grid shrink-0 place-items-center rounded-lg bg-white/[0.06] text-muted", className)}>
                <Puzzle className="size-5" />
            </span>
        )
    return <img src={src} alt="" onError={() => setErr(true)} className={cn("shrink-0 rounded-lg bg-white/5 object-cover", className)} />
}

// ---------------------------------------------------------------------------

function Installed({ updates }: { updates: Record<string, string> }) {
    const classic = useClassic()
    const { data, isLoading } = useExtensions()
    const qc = useQueryClient()
    if (isLoading) return <div className="card h-[4.5rem] shimmer" />
    if (!data?.length)
        return (
            <EmptyState
                icon={<Puzzle className="size-6" />}
                title="No extensions installed"
                action={
                    <Link to="/extensions?tab=marketplace" replace>
                        <Button variant="primary">Browse the marketplace</Button>
                    </Link>
                }
            />
        )
    // A type Aniko doesn't know still gets its rows.
    const groups = [...Object.keys(TYPES), ...new Set(data.map(e => e.manifest.type).filter(t => !TYPES[t]))]
        .map(t => ({ type: t, items: data.filter(e => e.manifest.type === t) }))
        .filter(g => g.items.length)
    return (
        <div className="flex flex-col gap-8">
            {groups.map(g => (
                <section key={g.type}>
                    <h2 className={cn("flex items-center gap-2 text-sm font-medium text-muted", classic ? "mb-3" : "mb-1")}>
                        {/* This look: a small capital label (in a span: a heading has its own face). */}
                        {TYPES[g.type]?.icon} <span className={classic ? undefined : "label"}>{TYPES[g.type]?.label ?? g.type}</span>
                    </h2>
                    <div className={grid(classic)}>
                        {g.items.map(e => (
                            <InstalledRow key={e.manifest.id} ext={e} update={updates[e.manifest.id]} onChange={() => qc.invalidateQueries({ queryKey: ["extensions"] })} />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    )
}

function InstalledRow({ ext, update, onChange }: { ext: ExtensionInfo; update?: string; onChange: () => void }) {
    const classic = useClassic()
    const m = ext.manifest
    const [cfgOpen, setCfgOpen] = useState(false)
    const [logsOpen, setLogsOpen] = useState(false)
    const [grantOpen, setGrantOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const call = async (p: Promise<unknown>, ok?: string) => {
        setBusy(true)
        try {
            await p
            if (ok) toast.success(ok)
            onChange()
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setBusy(false)
        }
    }
    const isPlugin = m.type === "plugin"
    const needsGrant = isPlugin && !ext.granted
    const on = ext.enabled && !needsGrant
    const facts = [`v${m.version}`, m.author, m.language === "typescript" ? "TS" : "JS", m.lang?.toUpperCase(), ext.running && "Running", update && `${update} available`].filter(Boolean)
    const notes = !ext.supported || !!ext.error || !!ext.configError || needsGrant
    return (
        <div className={row(classic)}>
            <ExtIcon src={m.icon} className={cn("size-11 transition-opacity", !on && "opacity-60")} />
            <div className="min-w-0 flex-1">
                <p className={cn("truncate font-medium transition-opacity", !on && "opacity-60")}>{m.name}</p>
                <p className="mt-0.5 truncate text-sm text-muted">{facts.join(" · ")}</p>
                {m.description && (
                    <p className="mt-0.5 truncate text-xs text-subtle" title={m.description}>
                        {m.description}
                    </p>
                )}
                {notes && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                        {!ext.supported && <Badge tone="amber">Not supported by Aniko yet</Badge>}
                        {needsGrant && <span className="text-amber-300">Permissions needed</span>}
                        {ext.configError && <span className="text-amber-300">Needs configuration</span>}
                        {ext.error && <span className="line-clamp-3 min-w-0 break-words text-rose-300">{ext.error}</span>}
                    </div>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <Switch
                    label={`${m.name} enabled`}
                    checked={on}
                    disabled={busy}
                    onChange={v => (v && needsGrant ? setGrantOpen(true) : call(api.post(`/api/extensions/${m.id}/enable`, { enabled: v })))}
                />
                <Dropdown>
                    <DropdownTrigger asChild>
                        <IconButton aria-label="More">
                            <MoreVertical className="size-4" />
                        </IconButton>
                    </DropdownTrigger>
                    <DropdownContent>
                        {update && (
                            <DropdownItem icon={<ArrowUpCircle />} disabled={busy} onSelect={() => call(api.post(`/api/extensions/${m.id}/update`), `Updated to ${update}`)}>
                                Update to {update}
                            </DropdownItem>
                        )}
                        {needsGrant && (
                            <DropdownItem icon={<ShieldCheck />} onSelect={() => setGrantOpen(true)}>
                                Review permissions
                            </DropdownItem>
                        )}
                        {(m.userConfig?.fields?.length ?? 0) > 0 && (
                            <DropdownItem icon={<Settings2 />} onSelect={() => setCfgOpen(true)}>
                                Configure
                            </DropdownItem>
                        )}
                        <DropdownItem icon={<FileText />} onSelect={() => setLogsOpen(true)}>
                            Logs
                        </DropdownItem>
                        {m.website && (
                            <DropdownItem icon={<ExternalLink />} onSelect={() => openLink(m.website)}>
                                Website
                            </DropdownItem>
                        )}
                        <DropdownSeparator />
                        <DropdownItem danger icon={<Trash2 />} disabled={busy} onSelect={() => confirm(`Uninstall ${m.name}?`) && call(api.del(`/api/extensions/${m.id}`), "Uninstalled")}>
                            Uninstall
                        </DropdownItem>
                    </DropdownContent>
                </Dropdown>
            </div>
            <ConfigDialog open={cfgOpen} onOpenChange={setCfgOpen} ext={ext} onSaved={onChange} />
            <LogsDialog open={logsOpen} onOpenChange={setLogsOpen} id={m.id} />
            <GrantDialog open={grantOpen} onOpenChange={setGrantOpen} ext={ext} onDone={onChange} />
        </div>
    )
}

function ConfigDialog({ open, onOpenChange, ext, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; ext: ExtensionInfo; onSaved: () => void }) {
    const fields = ext.manifest.userConfig?.fields ?? []
    const [values, setValues] = useState<Record<string, string>>({})
    useEffect(() => {
        if (open) setValues(Object.fromEntries(fields.map(f => [f.name, ext.userConfig.values?.[f.name] ?? f.default ?? ""])))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])
    const save = async () => {
        try {
            await api.post(`/api/extensions/${ext.manifest.id}/config`, { values })
            toast.success("Saved")
            onSaved()
            onOpenChange(false)
        } catch (e: any) {
            toast.error(e.message)
        }
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange} title={`Configure ${ext.manifest.name}`} footer={<Button variant="primary" onClick={save}>Save</Button>}>
            <div className="flex flex-col gap-4">
                {fields.map(f => (
                    <Field key={f.name} label={f.label || f.name} help={f.description}>
                        {f.type === "switch" ? (
                            <Switch checked={values[f.name] === "true"} onChange={v => setValues(s => ({ ...s, [f.name]: v ? "true" : "false" }))} />
                        ) : f.type === "select" ? (
                            <Select value={values[f.name] ?? ""} onChange={v => setValues(s => ({ ...s, [f.name]: v }))} options={(f.options ?? []).map(o => ({ value: o.value, label: o.label }))} />
                        ) : (
                            <Input value={values[f.name] ?? ""} onChange={e => setValues(s => ({ ...s, [f.name]: e.target.value }))} />
                        )}
                    </Field>
                ))}
            </div>
        </Dialog>
    )
}

function LogsDialog({ open, onOpenChange, id }: { open: boolean; onOpenChange: (v: boolean) => void; id: string }) {
    const classic = useClassic()
    const [lines, setLines] = useState<LogLineT[]>([])
    useEffect(() => {
        if (open) api.get<LogLineT[] | null>(`/api/extensions/${id}/logs`).then(l => setLines(l ?? [])).catch(e => toast.error(e.message))
    }, [open, id])
    return (
        <Dialog open={open} onOpenChange={onOpenChange} title="Extension logs" className="w-[min(94vw,820px)]">
            {lines.length === 0 ? (
                <p className="py-8 text-center text-sm text-subtle">No output yet.</p>
            ) : (
                <pre className={cn("max-h-[60vh] overflow-auto text-xs leading-relaxed", classic ? "rounded-xl bg-black/40 p-4" : "border-y border-line py-3")}>
                    {lines.map((l, i) => (
                        <div key={i} className={cn(l.level === "error" ? "text-rose-300" : l.level === "warn" ? "text-amber-300" : "text-fg/80")}>
                            <span className="text-subtle">{new Date(l.time * 1000).toLocaleTimeString()} </span>
                            {l.message}
                        </div>
                    ))}
                </pre>
            )}
        </Dialog>
    )
}

function GrantDialog({ open, onOpenChange, ext, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; ext: ExtensionInfo; onDone: () => void }) {
    const classic = useClassic()
    const perms = ext.manifest.plugin?.permissions
    const grant = async () => {
        try {
            await api.post(`/api/extensions/${ext.manifest.id}/grant`)
            toast.success(`${ext.manifest.name} enabled`)
            onDone()
            onOpenChange(false)
        } catch (e: any) {
            toast.error(e.message)
        }
    }
    const scopes = perms?.scopes ?? []
    const domains = perms?.allow?.networkAccess?.allowedDomains ?? []
    const unsafe = perms?.allow?.unsafeFlags ?? []
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={`Allow ${ext.manifest.name}?`}
            description="Check what this plugin asks for before enabling it."
            footer={
                <>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button variant="primary" icon={<ShieldCheck className="size-4" />} onClick={grant}>
                        Grant & enable
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5 text-sm">
                <div>
                    <p className={classic ? "mb-2 font-semibold" : "label mb-2 text-muted"}>Requested access</p>
                    <div className="flex flex-wrap gap-1.5">
                        {scopes.length ? scopes.map(s => <Badge key={s} tone={s.includes("token") || s === "system" ? "amber" : "gray"}>{s}</Badge>) : <span className="text-muted">Nothing special</span>}
                    </div>
                </div>
                {domains.length > 0 && (
                    <div>
                        <p className={classic ? "mb-2 font-semibold" : "label mb-2 text-muted"}>Network</p>
                        <p className="text-muted">{domains.join(", ")}</p>
                        {perms?.allow.networkAccess.reasoning && <p className="mt-1 text-xs text-subtle">“{perms.allow.networkAccess.reasoning}”</p>}
                    </div>
                )}
                {unsafe.length > 0 && (
                    <div className={cn("text-amber-200", classic ? "rounded-xl border border-amber-500/25 bg-amber-500/10 p-3" : "border-l border-amber-400 pl-3")}>
                        <p className="flex items-center gap-2 font-semibold">
                            <ShieldAlert className="size-4" /> Page modification
                        </p>
                        <p className="mt-1 text-xs">Aniko doesn’t let plugins modify its pages. Those features won’t work.</p>
                    </div>
                )}
                <p className="text-xs text-subtle">
                    Plugins can't reach your files, terminal or local network. {scopes.includes("anilist-token") && "This plugin can read your AniList token and act as you on AniList."}
                </p>
            </div>
        </Dialog>
    )
}

// ---------------------------------------------------------------------------

function Marketplace() {
    const classic = useClassic()
    const { data: status } = useStatus()
    const [url, setUrl] = useState("")
    const effectiveUrl = url || status?.settings.extensions.marketplaceUrl || ""
    const { data, isLoading, error, refetch, isFetching } = useMarketplace(effectiveUrl)
    const [type, setType] = useState("all")
    const [q, setQ] = useState("")
    const [sort, setSort] = useState("stars")
    const [hideBroken, setHideBroken] = useState(true)
    const [reloading, setReloading] = useState(false)
    const qc = useQueryClient()
    const reload = async () => {
        setReloading(true)
        try {
            await api.get(`/api/extensions/marketplace?refresh=1&url=${encodeURIComponent(effectiveUrl)}`)
            qc.invalidateQueries({ queryKey: ["marketplace"] })
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setReloading(false)
        }
    }

    const entries = useMemo(() => {
        let list = (data ?? []).filter(e => (type === "all" || e.type === type) && (!hideBroken || (!e.brokenTag && !e.deprecatedTag)))
        if (q.trim()) {
            const s = q.toLowerCase()
            list = list.filter(e => e.name.toLowerCase().includes(s) || e.description?.toLowerCase().includes(s) || e.author?.toLowerCase().includes(s))
        }
        return [...list].sort((a, b) => (sort === "stars" ? (b.stars ?? 0) - (a.stars ?? 0) : sort === "new" ? (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") : a.name.localeCompare(b.name)))
    }, [data, type, q, sort, hideBroken])

    const counts = useMemo(() => {
        const c: Record<string, number> = {}
        for (const e of data ?? []) c[e.type] = (c[e.type] ?? 0) + 1
        return c
    }, [data])

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 basis-full sm:max-w-80 sm:flex-1 sm:basis-0">
                    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" aria-label="Search extensions" icon={<Search className="size-4" />} />
                </div>
                <Select
                    className="min-w-0 flex-1 sm:w-52 sm:flex-none"
                    value={type}
                    onChange={setType}
                    options={[{ value: "all", label: `All types (${data?.length ?? 0})` }, ...Object.entries(TYPES).map(([k, v]) => ({ value: k, label: `${v.label} (${counts[k] ?? 0})` }))]}
                />
                <Popover
                    side="bottom"
                    align="end"
                    className="w-[min(22rem,calc(100vw-1.5rem))]"
                    trigger={
                        <IconButton aria-label="Sort and source" className={classic ? "rounded-xl border border-white/10 bg-white/[0.045]" : undefined}>
                            <SlidersHorizontal className="size-4" />
                        </IconButton>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <Field label="Sort">
                            <Select
                                value={sort}
                                onChange={setSort}
                                options={[
                                    { value: "stars", label: "Most starred" },
                                    { value: "new", label: "Recently updated" },
                                    { value: "name", label: "Name" },
                                ]}
                            />
                        </Field>
                        <div className="flex items-center justify-between gap-3 text-sm">
                            Hide broken
                            <Switch label="Hide broken" checked={hideBroken} onChange={setHideBroken} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[13px] font-medium text-fg/90">Source</span>
                            <div className="flex gap-2">
                                <Input
                                    aria-label="Marketplace URL"
                                    defaultValue={effectiveUrl}
                                    onKeyDown={e => e.key === "Enter" && setUrl((e.target as HTMLInputElement).value)}
                                    onBlur={e => setUrl(e.target.value)}
                                    icon={<Globe className="size-4" />}
                                />
                                <IconButton variant="subtle" label="Reload" disabled={reloading} onClick={reload}>
                                    <RefreshCw className={cn("size-4", (reloading || isFetching) && "animate-spin")} />
                                </IconButton>
                            </div>
                        </div>
                    </div>
                </Popover>
            </div>
            {isLoading && (
                <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="card h-[4.5rem] shimmer" />
                    ))}
                </div>
            )}
            {error && (
                <EmptyState icon={<AlertTriangle className="size-6" />} title="Couldn't load the marketplace" action={<Button onClick={() => refetch()}>Retry</Button>}>
                    {(error as Error).message}
                </EmptyState>
            )}
            {!isLoading && !error && entries.length === 0 && <EmptyState icon={<Search className="size-6" />} title="Nothing found" />}
            <div className={cn(grid(classic), !classic && entries.length === 0 && "border-t-0")}>
                {entries.map(e => (
                    <MarketRow key={e.id} e={e} />
                ))}
            </div>
        </div>
    )
}

function MarketRow({ e }: { e: MarketEntry }) {
    const classic = useClassic()
    const [busy, setBusy] = useState(false)
    const [grant, setGrant] = useState<ExtensionInfo | null>(null)
    const qc = useQueryClient()
    const install = async () => {
        setBusy(true)
        try {
            const info = await api.post<ExtensionInfo>("/api/extensions/install", { manifestURI: e.manifestURI })
            qc.invalidateQueries({ queryKey: ["marketplace"] })
            qc.invalidateQueries({ queryKey: ["extensions"] })
            if (info.manifest.type === "plugin") setGrant(info)
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setBusy(false)
        }
    }
    const facts = [
        TYPES[e.type]?.label,
        `v${e.version}`,
        e.author,
        e.lang?.toUpperCase(),
        e.stars > 0 && `★ ${e.stars}`,
        e.official && "Official",
        e.workingTag && "Working",
        e.brokenTag && "Broken",
        e.deprecatedTag && "Deprecated",
    ].filter(Boolean)
    const needs = (e.unsupported?.length ?? 0) > 0
    return (
        <div className={row(classic)}>
            <ExtIcon src={e.icon} className={cn("size-11", e.brokenTag && "opacity-60")} />
            <div className="min-w-0 flex-1">
                <p className={cn("truncate font-medium", e.brokenTag && "opacity-60")}>{e.name}</p>
                <p className={cn("mt-0.5 truncate text-sm text-muted", e.brokenTag && "text-rose-300/80", e.deprecatedTag && !e.brokenTag && "text-amber-300/80")}>{facts.join(" · ")}</p>
                {e.description && (
                    <p className="mt-0.5 truncate text-xs text-subtle" title={e.description}>
                        {e.description}
                    </p>
                )}
                {(!e.supported || needs) && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {!e.supported && <Badge tone="amber">Not supported</Badge>}
                        {needs && (
                            <span className="min-w-0" title={`Aniko doesn't support ${e.unsupported!.join(", ")}. Parts of this plugin won't work.`}>
                                <Badge tone="amber" className="max-w-full">
                                    <TriangleAlert className="size-3 shrink-0" /> <span className="truncate">Needs {e.unsupported!.join(", ")}</span>
                                </Badge>
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                {e.installed ? (
                    e.hasUpdate ? (
                        <Button size="sm" icon={<ArrowUpCircle className="size-4" />} loading={busy} onClick={install} aria-label={`Update to ${e.version}`} title={`Update to ${e.version}`}>
                            <span className="max-sm:sr-only">Update</span>
                        </Button>
                    ) : (
                        <span className={cn("flex items-center gap-1.5 px-1 text-emerald-300", classic ? "text-xs font-medium" : "label text-[10px]")}>
                            <CheckCircle2 className="size-4" /> <span className="max-sm:sr-only">Installed</span>
                        </span>
                    )
                ) : (
                    <Button size="sm" icon={<Download className="size-4" />} loading={busy} onClick={install} disabled={!e.manifestURI} aria-label="Install">
                        <span className="max-sm:sr-only">Install</span>
                    </Button>
                )}
                {(e.website || e.permalink) && (
                    <Dropdown>
                        <DropdownTrigger asChild>
                            <IconButton aria-label="More">
                                <MoreVertical className="size-4" />
                            </IconButton>
                        </DropdownTrigger>
                        <DropdownContent>
                            {e.website && (
                                <DropdownItem icon={<ExternalLink />} onSelect={() => openLink(e.website)}>
                                    Website
                                </DropdownItem>
                            )}
                            {e.permalink && (
                                <DropdownItem icon={<ShieldCheck />} onSelect={() => openLink(e.permalink)}>
                                    VirusTotal scan{e.flags ? ` · ${e.flags}` : ""}
                                </DropdownItem>
                            )}
                        </DropdownContent>
                    </Dropdown>
                )}
            </div>
            {grant && <GrantDialog open onOpenChange={v => !v && setGrant(null)} ext={grant} onDone={() => qc.invalidateQueries({ queryKey: ["extensions"] })} />}
        </div>
    )
}

function InstallUrlDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const [url, setUrl] = useState("")
    const [busy, setBusy] = useState(false)
    const qc = useQueryClient()
    const go = async () => {
        setBusy(true)
        try {
            await api.post("/api/extensions/install", { manifestURI: url })
            qc.invalidateQueries({ queryKey: ["extensions"] })
            setUrl("")
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
            title="Install from URL"
            description="Paste an extension's manifest URL."
            footer={
                <Button variant="primary" loading={busy} disabled={!url.trim()} onClick={go}>
                    Install
                </Button>
            }
        >
            <Input autoFocus value={url} onChange={e => setUrl(e.target.value)} placeholder="https://raw.githubusercontent.com/…/manifest.json" icon={<Link2 className="size-4" />} />
        </Dialog>
    )
}
