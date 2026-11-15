import { ChevronDown, Search as SearchIcon, X } from "lucide-react"
import { useMemo, useState } from "react"
import { useGenres, useStatus, useTags, type MediaTag, type SearchParams } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import { cn, GENRES } from "@/lib/utils"
import { Input, Select } from "./ui"

// Search's detailed filters, kept in the page's address (so Back, a link or a
// reload brings them back):
//   genre / xgenre, tag / xtag   wanted (all of them) / left out (none of them)
//   format, status, source       any of them
//   country, from, to, score, min, max, list
export const FILTER_KEYS = ["genre", "xgenre", "tag", "xtag", "format", "status", "country", "source", "from", "to", "score", "min", "max", "list"]

const ANIME_FORMATS = ["TV", "MOVIE", "OVA", "ONA", "SPECIAL", "TV_SHORT", "MUSIC"]
const MANGA_FORMATS = ["MANGA", "NOVEL", "ONE_SHOT"]
export const formatsFor = (type: string) => (type === "MANGA" ? MANGA_FORMATS : ANIME_FORMATS)
const FORMAT_LABEL: Record<string, string> = { TV_SHORT: "TV short", ONE_SHOT: "One shot", MOVIE: "Movie", SPECIAL: "Special", MUSIC: "Music", MANGA: "Manga", NOVEL: "Light novel" }

const statusesFor = (type: string) => [
    { value: "RELEASING", label: type === "MANGA" ? "Publishing" : "Airing" },
    { value: "FINISHED", label: "Finished" },
    { value: "NOT_YET_RELEASED", label: "Upcoming" },
    { value: "HIATUS", label: "On hiatus" },
    { value: "CANCELLED", label: "Cancelled" },
]
const COUNTRIES = [
    { value: "JP", label: "Japan" },
    { value: "KR", label: "Korea" },
    { value: "CN", label: "China" },
    { value: "TW", label: "Taiwan" },
]
const sourcesFor = (type: string) =>
    [
        { value: "ORIGINAL", label: "Original" },
        { value: "MANGA", label: "Manga" },
        { value: "LIGHT_NOVEL", label: "Light novel" },
        { value: "WEB_NOVEL", label: "Web novel" },
        { value: "NOVEL", label: "Novel" },
        { value: "VISUAL_NOVEL", label: "Visual novel" },
        { value: "VIDEO_GAME", label: "Video game" },
        { value: "ANIME", label: "Anime" },
        { value: "OTHER", label: "Other" },
    ].filter(s => (type === "MANGA" ? s.value !== "MANGA" : s.value !== "ANIME"))
const SCORES = [50, 60, 70, 75, 80, 85, 90]

// The tags shown before any is looked for: the ones most asked for.
const POPULAR_TAGS = [
    "Isekai", "School", "Shounen", "Seinen", "Shoujo", "Josei", "Female Harem", "Male Harem", "Martial Arts", "Military", "Historical",
    "Time Loop", "Reincarnation", "Super Power", "Magic", "Demons", "Gods", "Vampire", "Dragons", "Mythology", "Urban Fantasy", "Space",
    "Cyberpunk", "Post-Apocalyptic", "Dystopian", "Survival", "Death Game", "Revenge", "Crime", "Detective", "Politics", "Tragedy",
    "Coming of Age", "Found Family", "Iyashikei", "Episodic", "Parody", "Gore", "Anti-Hero", "Female Protagonist", "Villainess",
    "Boys' Love", "Yuri", "Love Triangle", "Office Lady", "Work", "Idol", "Band", "Food", "Video Games", "Swordplay", "Dungeon",
    "Cultivation", "Zombie", "Ninja", "Delinquents",
]

// AniList's tag categories, as the filter names them.
function categoryLabel(c: string) {
    const named: Record<string, string> = {
        "Cast-Main Cast": "Main cast",
        "Cast-Traits": "Characters",
        Demographic: "Audience",
        "Setting-Scene": "Setting",
        "Setting-Time": "Time",
        "Setting-Universe": "World",
        Technical: "Style",
        "Sexual Content": "Adult",
    }
    return named[c] ?? c.replace(/^Theme-/, "").replace(/-/g, " · ")
}

type Get = (k: string) => string
type GetAll = (k: string) => string[]
type Update = (change: (p: URLSearchParams) => void) => void

// The filters in the address, as a search (the page adds the title, type,
// season, year and sort).
export function filtersQuery(get: Get, getAll: GetAll, type: string): SearchParams {
    const num = (k: string) => (Number(get(k)) > 0 ? Number(get(k)) : undefined)
    const list = (k: string) => (getAll(k).length ? getAll(k) : undefined)
    const formats = getAll("format").filter(f => formatsFor(type).includes(f))
    return {
        genres: list("genre"),
        excludeGenres: list("xgenre"),
        tags: list("tag"),
        excludeTags: list("xtag"),
        formats: formats.length ? formats : undefined,
        statuses: list("status"),
        country: get("country") || undefined,
        sources: list("source"),
        yearFrom: num("from"),
        yearTo: num("to"),
        minScore: num("score"),
        minCount: num("min"),
        maxCount: num("max"),
        onList: get("list") === "on" ? true : get("list") === "off" ? false : undefined,
    }
}

// How many filters are set in the panel.
export function filterCount(params: URLSearchParams) {
    return FILTER_KEYS.reduce((n, k) => n + params.getAll(k).filter(Boolean).length, 0)
}

// A word to pick: off, wanted, or (three-way ones, a second time) left out.
function Pick({ state, onClick, children, title }: { state: "off" | "on" | "out"; onClick: () => void; children: React.ReactNode; title?: string }) {
    const classic = useClassic()
    return (
        <button
            onClick={onClick}
            title={title}
            aria-pressed={state === "on" ? true : state === "out" ? "mixed" : false}
            data-on={state !== "off" || undefined}
            className={cn(
                "h-8 shrink-0 font-medium transition-colors",
                classic
                    ? cn(
                          "rounded-full px-3 text-[13px]",
                          state === "on" ? "bg-white/20 text-fg" : state === "out" ? "bg-rose-500/20 text-rose-200 line-through" : "bg-white/[0.05] text-muted hover:bg-white/[0.09] hover:text-fg",
                      )
                    : cn("word label focus-ring px-2.5 text-[10.5px]", state === "on" ? "text-fg" : state === "out" ? "text-rose-300 line-through" : "text-muted hover:text-fg"),
            )}
        >
            {children}
        </button>
    )
}

function Section({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
    const classic = useClassic()
    return (
        <div className={className}>
            <p className={cn("mb-2 flex items-baseline gap-3", classic ? "text-xs font-medium text-subtle" : "label text-[10px] text-subtle")}>
                {label}
                {hint && <span className={cn("normal-case", classic ? "font-normal" : "tracking-normal")}>{hint}</span>}
            </p>
            {children}
        </div>
    )
}

export function SearchFilters({ type, get, getAll, update }: { type: string; get: Get; getAll: GetAll; update: Update }) {
    const classic = useClassic()
    const genres = useGenres(GENRES)
    const { data: allTags } = useTags()
    const loggedIn = !!useStatus().data?.user
    const [find, setFind] = useState("")
    const [allOpen, setAllOpen] = useState(false)

    // A three-way filter: wanted (k), left out (x+k), or neither.
    const triState = (k: string, v: string): "off" | "on" | "out" => (getAll(k).includes(v) ? "on" : getAll("x" + k).includes(v) ? "out" : "off")
    const cycle = (k: string, v: string) =>
        update(p => {
            const on = p.getAll(k)
            const out = p.getAll("x" + k)
            const put = (key: string, vals: string[]) => {
                p.delete(key)
                vals.forEach(x => p.append(key, x))
            }
            if (on.includes(v)) {
                put(k, on.filter(x => x !== v))
                put("x" + k, [...out, v])
            } else if (out.includes(v)) put("x" + k, out.filter(x => x !== v))
            else put(k, [...on, v])
        })
    const toggle = (k: string, v: string) =>
        update(p => {
            const cur = p.getAll(k)
            p.delete(k)
            for (const x of cur.includes(v) ? cur.filter(c => c !== v) : [...cur, v]) p.append(k, x)
        })
    const set = (k: string, v: string) =>
        update(p => {
            if (v) p.set(k, v)
            else p.delete(k)
        })

    // The tags by category, in AniList's order; and the ones looked for.
    const tags = allTags ?? []
    const known = useMemo(() => new Set(tags.map(t => t.name)), [tags])
    const groups = useMemo(() => {
        const m = new Map<string, MediaTag[]>()
        for (const t of tags) m.set(t.category, [...(m.get(t.category) ?? []), t])
        return [...m.entries()]
    }, [tags])
    const q = find.trim().toLowerCase()
    const found = q ? tags.filter(t => t.name.toLowerCase().includes(q)).slice(0, 80) : []
    // What's picked shows first, wherever it is in the list.
    const picked = [...getAll("tag"), ...getAll("xtag")]
    const shown = q ? found.map(t => t.name) : [...picked, ...POPULAR_TAGS.filter(t => !picked.includes(t) && (!tags.length || known.has(t)))]
    const describe = (name: string) => tags.find(t => t.name === name)?.description

    const years = Array.from({ length: new Date().getFullYear() - 1939 }, (_, i) => String(new Date().getFullYear() + 1 - i))
    const count = type === "MANGA" ? "Chapters" : "Episodes"

    return (
        <div className={cn("grid gap-x-10 gap-y-6 lg:grid-cols-2", classic ? "card p-5" : "border-y border-line-strong py-6")}>
            <Section label="Genres" hint="Again to leave out" className="lg:col-span-2">
                <div className="flex flex-wrap gap-1">
                    {genres.map(g => (
                        <Pick key={g} state={triState("genre", g)} onClick={() => cycle("genre", g)}>
                            {g}
                        </Pick>
                    ))}
                </div>
            </Section>

            <Section label="Tags" hint={tags.length ? `${tags.length} in all` : undefined} className="lg:col-span-2">
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="w-full max-w-xs">
                        <Input value={find} onChange={e => setFind(e.target.value)} placeholder="Find a tag…" aria-label="Find a tag" icon={<SearchIcon className="size-4" />} />
                    </div>
                    {!q && tags.length > 0 && (
                        <button
                            onClick={() => setAllOpen(o => !o)}
                            aria-expanded={allOpen}
                            className={cn("flex h-8 items-center gap-1.5 font-medium transition-colors", classic ? "text-[13px] text-muted hover:text-fg" : "word label px-2.5 text-[10.5px] text-muted hover:text-fg")}
                        >
                            All tags
                            <ChevronDown className={cn("size-3.5 transition-transform", allOpen && "rotate-180")} />
                        </button>
                    )}
                </div>
                {q && found.length === 0 ? (
                    <p className="text-sm text-muted">No tag called that.</p>
                ) : (
                    <div className="flex flex-wrap gap-1">
                        {shown.map(t => (
                            <Pick key={t} state={triState("tag", t)} onClick={() => cycle("tag", t)} title={describe(t)}>
                                {t}
                            </Pick>
                        ))}
                    </div>
                )}
                {allOpen && !q && (
                    <div className="mt-5 flex flex-col gap-5">
                        {groups.map(([cat, list]) => (
                            <div key={cat}>
                                <p className={cn("mb-1.5", classic ? "text-xs text-subtle" : "label text-[10px] text-subtle")}>{categoryLabel(cat)}</p>
                                <div className="flex flex-wrap gap-1">
                                    {list.map(t => (
                                        <Pick key={t.name} state={triState("tag", t.name)} onClick={() => cycle("tag", t.name)} title={t.description}>
                                            {t.name}
                                        </Pick>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section label="Format">
                <div className="flex flex-wrap gap-1">
                    {formatsFor(type).map(f => (
                        <Pick key={f} state={getAll("format").includes(f) ? "on" : "off"} onClick={() => toggle("format", f)}>
                            {FORMAT_LABEL[f] ?? f}
                        </Pick>
                    ))}
                </div>
            </Section>
            <Section label="Status">
                <div className="flex flex-wrap gap-1">
                    {statusesFor(type).map(s => (
                        <Pick key={s.value} state={getAll("status").includes(s.value) ? "on" : "off"} onClick={() => toggle("status", s.value)}>
                            {s.label}
                        </Pick>
                    ))}
                </div>
            </Section>
            <Section label="Country">
                <div className="flex flex-wrap gap-1">
                    {COUNTRIES.map(c => (
                        <Pick key={c.value} state={get("country") === c.value ? "on" : "off"} onClick={() => set("country", get("country") === c.value ? "" : c.value)}>
                            {c.label}
                        </Pick>
                    ))}
                </div>
            </Section>
            <Section label="Source">
                <div className="flex flex-wrap gap-1">
                    {sourcesFor(type).map(s => (
                        <Pick key={s.value} state={getAll("source").includes(s.value) ? "on" : "off"} onClick={() => toggle("source", s.value)}>
                            {s.label}
                        </Pick>
                    ))}
                </div>
            </Section>

            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:col-span-2">
                <Section label="From">
                    <Select value={get("from")} onChange={v => set("from", v)} options={[{ value: "", label: "Any year" }, ...years.map(y => ({ value: y, label: y }))]} />
                </Section>
                <Section label="To">
                    <Select value={get("to")} onChange={v => set("to", v)} options={[{ value: "", label: "Any year" }, ...years.map(y => ({ value: y, label: y }))]} />
                </Section>
                <Section label="Score">
                    <Select value={get("score")} onChange={v => set("score", v)} options={[{ value: "", label: "Any score" }, ...SCORES.map(s => ({ value: String(s), label: `${s}% or more` }))]} />
                </Section>
                {loggedIn ? (
                    <Section label="Your list">
                        <Select
                            value={get("list")}
                            onChange={v => set("list", v)}
                            options={[
                                { value: "", label: "Everything" },
                                { value: "off", label: "Not on my list" },
                                { value: "on", label: "Only my list" },
                            ]}
                        />
                    </Section>
                ) : (
                    <span />
                )}
                <Section label={count} hint="Known counts only" className="col-span-2">
                    <div className="flex items-center gap-2">
                        <Input type="number" min={0} inputMode="numeric" value={get("min")} onChange={e => set("min", e.target.value)} placeholder="Min" aria-label={`Fewest ${count.toLowerCase()}`} className="w-24 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                        <span className="text-subtle">–</span>
                        <Input type="number" min={0} inputMode="numeric" value={get("max")} onChange={e => set("max", e.target.value)} placeholder="Max" aria-label={`Most ${count.toLowerCase()}`} className="w-24 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                </Section>
            </div>
        </div>
    )
}

// What's picked, as words to take off one at a time.
export function ActiveFilters({ type, getAll, update }: { type: string; getAll: GetAll; update: Update }) {
    const classic = useClassic()
    const label = (k: string, v: string) => {
        if (k === "xgenre" || k === "xtag") return `Not ${v}`
        if (k === "format") return FORMAT_LABEL[v] ?? v
        if (k === "status") return statusesFor(type).find(s => s.value === v)?.label ?? v
        if (k === "country") return COUNTRIES.find(c => c.value === v)?.label ?? v
        if (k === "source") return sourcesFor(type).find(s => s.value === v)?.label ?? v
        if (k === "from") return `From ${v}`
        if (k === "to") return `To ${v}`
        if (k === "score") return `${v}%+`
        if (k === "min") return `${v}+ ${type === "MANGA" ? "chapters" : "episodes"}`
        if (k === "max") return `Up to ${v} ${type === "MANGA" ? "chapters" : "episodes"}`
        if (k === "list") return v === "on" ? "On my list" : "Not on my list"
        return v
    }
    const items = FILTER_KEYS.flatMap(k => getAll(k).filter(Boolean).map(v => ({ k, v })))
    if (!items.length) return null
    const remove = (k: string, v: string) =>
        update(p => {
            const rest = p.getAll(k).filter(x => x !== v)
            p.delete(k)
            rest.forEach(x => p.append(k, x))
        })
    return (
        <div className="flex flex-wrap items-center gap-1">
            {items.map(({ k, v }) => (
                <button
                    key={k + v}
                    onClick={() => remove(k, v)}
                    aria-label={`Remove ${label(k, v)}`}
                    className={cn(
                        "flex h-7 items-center gap-1.5 font-medium transition-colors",
                        classic ? "rounded-full bg-white/[0.07] px-3 text-xs text-fg/85 hover:bg-white/[0.12]" : "label px-2 text-[10px] text-fg/85 hover:text-fg",
                        (k === "xgenre" || k === "xtag") && "text-rose-300",
                    )}
                >
                    {label(k, v)}
                    <X className="size-3 opacity-60" />
                </button>
            ))}
        </div>
    )
}
