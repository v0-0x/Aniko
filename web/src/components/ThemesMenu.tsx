import { Check, ChevronRight, ChevronUp, History, Palette, Settings2, Sparkles } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useSaveUI, useSettings } from "@/lib/queries"
import { useStore } from "@/lib/store"
import { activeHoliday, colorTheme, HOLIDAYS, holidayStore, themesOf, useClassic, type ColorTheme } from "@/lib/themes"
import { tv } from "@/lib/tv"
import { cn } from "@/lib/utils"
import { HolidayIcon } from "./HolidayBadge"
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger, Tooltip } from "./ui"

// The sidebar's Themes menu: every color theme, the holiday themes (by the
// date, off, or one always) and their animation, and the classic look,
// changed at once and the menu left open to try another. Settings ›
// Appearance has the same.
export function ThemesMenu({ wide }: { wide: boolean }) {
    const holiday = useStore(holidayStore)
    // Drawn as it is now (one being tried in Settings too).
    const classic = useClassic()
    const button = classic ? (
        // The Classic look's (before 3.0.37): a small round chip in the
        // accent (the holiday's drawing, or a palette), lit with the accent
        // while open; on a TV a link like the others, the chevron turning.
        <DropdownTrigger asChild>
            <button
                aria-label="Themes"
                className={cn(
                    "focus-ring group flex shrink-0 items-center rounded-lg text-[13.5px] font-medium text-muted transition-[background-color,color] duration-200 ease-out",
                    "hover:bg-white/[0.05] hover:text-fg data-[state=open]:bg-brand-soft data-[state=open]:text-fg",
                    wide ? "h-9 gap-2.5 pr-2 pl-1.5" : "size-10 justify-center",
                )}
            >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--brand)_16%,transparent)] transition-[transform,background-color] duration-300 ease-out group-hover:scale-105 group-hover:bg-[color-mix(in_oklab,var(--brand)_24%,transparent)]">
                    {holiday ? <HolidayIcon id={holiday.id} className="size-4" /> : <Palette className="size-3.5 stroke-2 text-brand-strong" />}
                </span>
                {wide && (
                    <>
                        <span className="min-w-0 flex-1 truncate text-left">Themes</span>
                        <ChevronUp className="size-3.5 shrink-0 text-subtle transition-transform duration-200 ease-out group-data-[state=open]:rotate-180" />
                    </>
                )}
            </button>
        </DropdownTrigger>
    ) : (
        // The palette alone in the sidebar's row of icons; on a TV a link
        // like the others.
        <DropdownTrigger asChild>
            <button
                aria-label="Themes"
                className={cn(
                    "focus-ring flex shrink-0 items-center rounded-sm text-muted transition-colors duration-200 hover:text-fg data-[state=open]:text-fg [&>svg]:size-[18px] [&>svg]:shrink-0 [&>svg]:stroke-[1.5]",
                    wide ? "label h-9 gap-1.5 px-3" : "size-9 justify-center data-[state=open]:shadow-[inset_0_-1px_0_var(--text)]",
                )}
            >
                {holiday ? <HolidayIcon id={holiday.id} className="size-[18px] shrink-0" /> : <Palette />}
                {wide && <span className="nav-label truncate">Themes</span>}
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
            <PanelMenu wide={wide} />
        </Dropdown>
    )
}

// A switch, drawn: the item it's in is what's pressed.
function MenuSwitch({ on }: { on: boolean }) {
    const classic = useClassic()
    if (!classic)
        return (
            <span aria-hidden className={cn("flex h-[18px] w-8 shrink-0 items-center border transition-colors", on ? "border-brand bg-brand" : "border-line-strong")}>
                <span className={cn("size-2 transition-transform", on ? "translate-x-[19px] bg-[color:var(--on-brand)]" : "translate-x-[3px] bg-muted")} />
            </span>
        )
    return (
        <span aria-hidden className={cn("relative h-[18px] w-8 shrink-0 rounded-full transition-colors", on ? "bg-brand" : "bg-white/[0.14]")}>
            <span className={cn("absolute top-[3px] size-3 rounded-full bg-white transition-transform", on ? "translate-x-[17px]" : "translate-x-[3px]")} />
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

// What the menu shows and changes. The switches are the saved settings,
// like the rest.
function useThemes() {
    const ui = useSettings()?.ui
    const saveUI = useSaveUI()
    return {
        saveUI,
        navigate: useNavigate(),
        holiday: useStore(holidayStore),
        // The saved one, as this look draws it (lib/themes.ts).
        theme: colorTheme(ui?.colorTheme, !!ui?.classicLook).id,
        seasonal: ui?.seasonal ?? "auto",
        effects: ui?.seasonalEffects ?? true,
        classicLook: !!ui?.classicLook,
        // What "by the date" is now.
        today: activeHoliday("auto"),
    }
}

// The menu: a panel. Each color theme is a small window in its colors, the
// holiday themes a grid, and the colors fade from one theme to the next.
function PanelMenu({ wide }: { wide: boolean }) {
    const { saveUI, navigate, holiday, theme, seasonal, effects, classicLook, today } = useThemes()
    // Drawn as the look is now, with its themes.
    const classic = useClassic()
    const themes = themesOf(classic)
    const current = themes.find(t => t.id === theme) ?? themes[0]
    const pick = (ui: Parameters<typeof saveUI>[0]) => {
        fadeColors()
        saveUI(ui)
    }
    return (
        <DropdownContent
            side={wide ? "top" : "right"}
            align={wide ? "start" : "end"}
            sideOffset={8}
            className={cn("max-h-[min(660px,var(--radix-dropdown-menu-content-available-height))] w-[336px] overflow-y-auto p-2", classic && "rounded-[14px]")}
        >
            <div className="flex items-center gap-3 px-1.5 pt-1 pb-1.5">
                <Window classic={classic} theme={current} accent={holiday?.accent ?? current.accent} className="h-8 w-11 rounded-lg" />
                <div className="min-w-0 flex-1">
                    <p className={cn("font-semibold text-fg", classic ? "text-[14px]" : "font-display text-[15px]")}>Themes</p>
                    <p className="truncate text-[12px] text-subtle">
                        {current.name}
                        {holiday ? ` with ${holiday.name}` : ""}
                    </p>
                </div>
            </div>

            <Section classic={classic} label="Colors">
                <Grid cols={4}>
                    {themes.map(t => {
                        const on = theme === t.id
                        return (
                            <DropdownItem
                                key={t.id}
                                keepOpen
                                onSelect={() => pick({ colorTheme: t.id, accentColor: t.accent })}
                                className="group/tile h-auto flex-col items-stretch gap-1.5 rounded-[10px] p-1.5 data-[highlighted]:bg-white/[0.06]"
                            >
                                <span className="relative block">
                                    <Window
                                        classic={classic}
                                        theme={t}
                                        accent={t.accent}
                                        className={cn(
                                            "h-9 w-full rounded-lg transition-[box-shadow,transform] duration-200 ease-out group-data-[highlighted]/tile:-translate-y-px",
                                            classic
                                                ? on
                                                    ? "shadow-[0_0_0_2px_var(--color-surface-2),0_0_0_3.5px_var(--brand)]"
                                                    : "shadow-[0_0_0_1px_rgb(255_255_255/0.1)]"
                                                : on
                                                  ? "shadow-[0_0_0_2px_var(--color-surface-1),0_0_0_3.5px_var(--text)]"
                                                  : "shadow-[0_0_0_1px_var(--line-strong)]",
                                        )}
                                    />
                                    <span
                                        className={cn(
                                            "absolute -top-1 -right-1 grid size-4 place-items-center rounded-full transition-[opacity,scale] duration-200 ease-out",
                                            classic ? "bg-brand text-white shadow-[0_0_0_2px_var(--color-surface-2)]" : "bg-fg text-bg",
                                            on ? "scale-100 opacity-100" : "scale-50 opacity-0",
                                        )}
                                    >
                                        <Check className="size-2.5 stroke-[3.5]" />
                                    </span>
                                </span>
                                <span className={cn("truncate text-center text-[11.5px] transition-colors", on ? "font-medium text-fg" : "text-muted")}>{t.name}</span>
                            </DropdownItem>
                        )
                    })}
                </Grid>
            </Section>

            <Section classic={classic} label="Holiday theme">
                <Grid cols={2}>
                    <Mode
                        on={seasonal === "auto"}
                        onSelect={() => pick({ seasonal: "auto" })}
                        icon={<CalendarIcon />}
                        name="By the date"
                        note={today ? `${today.name} now` : "None right now"}
                    />
                    <Mode
                        on={seasonal === "off"}
                        onSelect={() => pick({ seasonal: "off" })}
                        icon={<span className="size-4 rounded-full border border-dashed border-white/30" />}
                        name="Off"
                        note="Plain colors all year"
                    />
                </Grid>
                <div className="h-1" />
                <Grid cols={3}>
                    {HOLIDAYS.map(h => (
                        <HolidayTile
                            key={h.id}
                            on={seasonal === h.id}
                            onSelect={() => pick({ seasonal: h.id })}
                            icon={<HolidayIcon id={h.id} className="size-[18px]" />}
                            name={h.name}
                        />
                    ))}
                </Grid>
            </Section>

            <div className={cn("mt-2", classic ? "rounded-[10px] bg-white/[0.03] p-1" : "border-t border-line pt-1")}>
                <DropdownItem keepOpen disabled={!holiday} onSelect={() => saveUI({ seasonalEffects: !effects })} icon={<Sparkles />} className="h-9 rounded-lg">
                    <span className="min-w-0 flex-1 truncate">{holiday ? `Animation: ${holiday.effectName}` : "Holiday animations"}</span>
                    <MenuSwitch on={effects && !!holiday} />
                </DropdownItem>
                <DropdownItem keepOpen onSelect={() => pick({ classicLook: !classicLook })} icon={<History />} className="h-9 rounded-lg">
                    <span className="min-w-0 flex-1">Classic look</span>
                    <MenuSwitch on={classicLook} />
                </DropdownItem>
            </div>

            <DropdownItem icon={<Settings2 />} onSelect={() => navigate("/settings?tab=appearance")} className="mt-1 h-9 rounded-lg text-muted data-[highlighted]:text-fg">
                <span className="flex-1">More in Settings</span>
                <ChevronRight className="size-3.5 text-subtle" />
            </DropdownItem>
        </DropdownContent>
    )
}

function Section({ classic, label, children }: { classic: boolean; label: string; children: React.ReactNode }) {
    return (
        <div className="pt-2">
            <p className={cn("px-1.5 pb-1.5 text-subtle", classic ? "text-[11.5px] font-medium" : "label text-[10px]")}>{label}</p>
            {children}
        </div>
    )
}

// Items in rows: the arrow keys (a TV's too) move across and down them like
// a grid, ahead of the menu's own Up and Down (one item at a time); Up from
// the top row and Down from the bottom one leave it.
function Grid({ cols, children }: { cols: 2 | 3 | 4; children: React.ReactNode }) {
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const step = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -cols,
            ArrowDown: cols,
        }[e.key]
        if (!step) return
        const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        const at = items.indexOf(document.activeElement as HTMLElement)
        if (at < 0) return
        let to: HTMLElement | undefined = items[at + step]
        if (!to && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return
        if (!to) {
            // Out of the grid: the menu's item before or after it.
            const all = [...(e.currentTarget.closest('[role="menu"]')?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([data-disabled])') ?? [])]
            const edge = all.indexOf(step < 0 ? items[0] : items[items.length - 1])
            to = all[edge + (step < 0 ? -1 : 1)]
            if (!to) return
        }
        e.preventDefault()
        to.focus()
    }
    return (
        <div onKeyDownCapture={onKeyDown} className={cn("grid gap-1", { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[cols])}>
            {children}
        </div>
    )
}

// A holiday or mode, lit in the accent while it's the one chosen.
const tile = (on: boolean) =>
    cn(
        "rounded-[10px] transition-[background-color,box-shadow] duration-200 ease-out",
        on
            ? "bg-brand-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_45%,transparent)] data-[highlighted]:bg-brand-soft"
            : "bg-white/[0.025] data-[highlighted]:bg-white/[0.07]",
    )

// By the date or off: what decides the holiday theme.
function Mode({ on, onSelect, icon, name, note }: { on: boolean; onSelect: () => void; icon: React.ReactNode; name: string; note: string }) {
    return (
        <DropdownItem keepOpen onSelect={onSelect} className={cn("h-11 gap-2.5 px-2.5", tile(on))}>
            <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
            <span className="min-w-0 flex-1 leading-tight">
                <span className={cn("block truncate text-[12.5px]", on ? "font-medium text-fg" : "text-muted")}>{name}</span>
                <span className="block truncate text-[11px] text-subtle">{note}</span>
            </span>
        </DropdownItem>
    )
}

// One holiday, on all year.
function HolidayTile({ on, onSelect, icon, name }: { on: boolean; onSelect: () => void; icon: React.ReactNode; name: string }) {
    return (
        <DropdownItem keepOpen onSelect={onSelect} className={cn("h-12 flex-col justify-center gap-1 px-1", tile(on))}>
            <span className="grid size-[18px] place-items-center">{icon}</span>
            <span className={cn("w-full truncate text-center text-[11.5px]", on ? "font-medium text-fg" : "text-muted")}>{name}</span>
        </DropdownItem>
    )
}

// A color theme in small. This look's: its ground, a title and lines in its
// inks, the accent. The Classic look's: a small window, its frame, sidebar,
// page and accent.
function Window({ classic, theme, accent, className }: { classic: boolean; theme: ColorTheme; accent: string; className?: string }) {
    const p = theme.palette
    if (classic)
        return (
            <span aria-hidden className={cn("relative block shrink-0 overflow-hidden", className)} style={{ background: p.frame }}>
                <span className="absolute top-[18%] left-[9%] h-[9%] w-[16%] rounded-full" style={{ background: accent }} />
                <span className="absolute top-[38%] left-[9%] h-[7%] w-[14%] rounded-full" style={{ background: p.s4 }} />
                <span className="absolute top-[56%] left-[9%] h-[7%] w-[14%] rounded-full" style={{ background: p.s4 }} />
                <span className="absolute inset-y-[12%] right-[6%] left-[32%] rounded-[3px]" style={{ background: p.bg }}>
                    <span className="absolute inset-x-[10%] top-[14%] h-[34%] rounded-[2px]" style={{ background: p.s3 }} />
                    <span className="absolute bottom-[16%] left-[10%] h-[12%] w-[38%] rounded-full" style={{ background: accent }} />
                </span>
            </span>
        )
    return (
        <span aria-hidden className={cn("relative block shrink-0 overflow-hidden", className)} style={{ background: p.bg }}>
            <span className="absolute top-[22%] left-[12%] h-[14%] w-[34%]" style={{ background: p.text }} />
            <span className="absolute top-[50%] left-[12%] h-[7%] w-[52%]" style={{ background: p.subtle }} />
            <span className="absolute top-[66%] left-[12%] h-[7%] w-[40%]" style={{ background: p.subtle }} />
            <span className="absolute right-[12%] bottom-[20%] h-[22%] w-[14%]" style={{ background: accent }} />
        </span>
    )
}

// The colors fade from one theme to the next, for a moment (not on a TV,
// whose box is slow, or for those who'd rather nothing moved).
let fading = 0
function fadeColors() {
    if (tv || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const root = document.documentElement
    root.classList.add("theme-fade")
    clearTimeout(fading)
    fading = window.setTimeout(() => root.classList.remove("theme-fade"), 450)
}
