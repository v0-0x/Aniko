import { Check, Palette, Settings2, Sparkles } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useSaveUI, useSettings } from "@/lib/queries"
import { useStore } from "@/lib/store"
import { activeHoliday, COLOR_THEMES, HOLIDAYS, holidayStore, type ColorTheme } from "@/lib/themes"
import { cn } from "@/lib/utils"
import { HolidayIcon } from "./HolidayBadge"
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger, Tooltip } from "./ui"

// The sidebar's Themes menu: every color theme, the holiday themes (by the
// date, off, or one always) and their animation, changed at once and the
// menu left open to try another. Settings › User Interface has the same.
export function ThemesMenu({ wide }: { wide: boolean }) {
    const ui = useSettings()?.ui
    const saveUI = useSaveUI()
    const navigate = useNavigate()
    const holiday = useStore(holidayStore)
    const theme = ui?.colorTheme ?? "kumo"
    const seasonal = ui?.seasonal ?? "auto"
    const effects = ui?.seasonalEffects ?? true
    // What "by the date" is now.
    const today = activeHoliday("auto")
    // In the theme's own colors: its accent (the holiday's while one is on)
    // tints it, and its drawing (or a palette) leads.
    const icon = holiday ? <HolidayIcon id={holiday.id} className="size-4" /> : <Palette className="size-4 stroke-[1.9] text-brand-strong" />
    const button = (
        <DropdownTrigger asChild>
            <button
                aria-label="Themes"
                className={cn(
                    "focus-ring group flex shrink-0 items-center rounded-xl text-[13.5px] font-medium text-fg transition-[background-color,box-shadow]",
                    "bg-[linear-gradient(135deg,color-mix(in_oklab,var(--brand)_18%,transparent),color-mix(in_oklab,var(--brand)_4%,transparent))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_26%,transparent)]",
                    "hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_45%,transparent)] data-[state=open]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_55%,transparent)]",
                    wide ? "h-10 gap-2.5 pr-3 pl-2" : "size-10 justify-center",
                )}
            >
                <span className={cn("grid shrink-0 place-items-center rounded-lg", wide && "size-7 bg-[color-mix(in_oklab,var(--brand)_20%,transparent)]")}>{icon}</span>
                {wide && <span className="min-w-0 flex-1 truncate text-left">Themes</span>}
            </button>
        </DropdownTrigger>
    )
    return (
        <Dropdown>
            {wide ? (
                button
            ) : (
                <Tooltip content="Themes" side="right">
                    {button}
                </Tooltip>
            )}
            <DropdownContent side={wide ? "top" : "right"} align={wide ? "start" : "end"} className="max-h-[min(80vh,640px)] w-72 overflow-y-auto">
                <DropdownLabel>Colors</DropdownLabel>
                <div className="grid grid-cols-2 gap-0.5">
                    {COLOR_THEMES.map(t => (
                        <DropdownItem key={t.id} keepOpen onSelect={() => saveUI({ colorTheme: t.id, accentColor: t.accent })} className="h-9 gap-2 px-2">
                            <Swatch theme={t} />
                            <span className="min-w-0 flex-1 truncate">{t.name}</span>
                            {theme === t.id && <Check className="size-3.5 shrink-0 text-brand-strong" />}
                        </DropdownItem>
                    ))}
                </div>
                <DropdownSeparator />
                <DropdownLabel>Holiday theme</DropdownLabel>
                <Choice on={seasonal === "auto"} onSelect={() => saveUI({ seasonal: "auto" })} icon={<CalendarIcon />}>
                    <span className="min-w-0 flex-1">
                        By the date
                        <span className="block text-[11px] text-subtle">{today ? `${today.name} now` : "None right now"}</span>
                    </span>
                </Choice>
                <Choice on={seasonal === "off"} onSelect={() => saveUI({ seasonal: "off" })} icon={<span className="size-4 rounded-full border border-dashed border-white/30" />}>
                    Off
                </Choice>
                {HOLIDAYS.map(h => (
                    <Choice key={h.id} on={seasonal === h.id} onSelect={() => saveUI({ seasonal: h.id })} icon={<HolidayIcon id={h.id} className="size-4" />}>
                        <span className="min-w-0 flex-1 truncate">{h.name}</span>
                        <span className="text-[11px] text-subtle">{h.when.replace(/^In /, "")}</span>
                    </Choice>
                ))}
                <DropdownSeparator />
                <DropdownItem keepOpen disabled={!holiday} onSelect={() => saveUI({ seasonalEffects: !effects })} icon={<Sparkles />} className="h-9">
                    <span className="min-w-0 flex-1">{holiday ? holiday.effectName : "Holiday animations"}</span>
                    {/* A switch, drawn: the item is what's pressed. */}
                    <span aria-hidden className={cn("relative h-[18px] w-8 shrink-0 rounded-full transition-colors", effects && holiday ? "bg-brand" : "bg-white/[0.14]")}>
                        <span className={cn("absolute top-[3px] size-3 rounded-full bg-white transition-transform", effects && holiday ? "translate-x-[17px]" : "translate-x-[3px]")} />
                    </span>
                </DropdownItem>
                <DropdownItem icon={<Settings2 />} onSelect={() => navigate("/settings?tab=ui")}>
                    More in Settings
                </DropdownItem>
            </DropdownContent>
        </Dropdown>
    )
}

function Choice({ on, onSelect, icon, children }: { on: boolean; onSelect: () => void; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <DropdownItem keepOpen onSelect={onSelect} className="h-auto min-h-8 py-1.5">
            <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
            {children}
            <Check className={cn("size-3.5 shrink-0 text-brand-strong", !on && "invisible")} />
        </DropdownItem>
    )
}

// A color theme in small: its window, page and accent.
function Swatch({ theme }: { theme: ColorTheme }) {
    const p = theme.palette
    return (
        <span aria-hidden className="relative size-6 shrink-0 overflow-hidden rounded-md ring-1 ring-white/15" style={{ background: p.frame }}>
            <span className="absolute inset-y-1 right-0 left-1.5 rounded-l-sm" style={{ background: p.s2 }} />
            <span className="absolute right-1 bottom-1 size-2 rounded-full" style={{ background: theme.accent }} />
        </span>
    )
}

function CalendarIcon() {
    return (
        <svg viewBox="0 0 16 16" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <rect x="2" y="3" width="12" height="11" rx="2" />
            <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
        </svg>
    )
}
