import { Palette, Power, Sparkles } from "lucide-react"
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useSaveSettings, useSettings } from "@/lib/queries"
import type { Holiday } from "@/lib/themes"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger, Tooltip } from "./ui"

// The holiday's little drawing: on Kumo's logo in the sidebar, and on its
// button there.
export function HolidayIcon({ id, className }: { id: string; className?: string }) {
    const common = { viewBox: "0 0 32 32", className, "aria-hidden": true } as const
    switch (id) {
        case "christmas": // a Santa hat
            return (
                <svg {...common}>
                    <path d="M5 21C8 12 14 5 23 5c2 4 3 10 4 16Z" fill="#e5484d" />
                    <rect x="3" y="19" width="26" height="7" rx="3.5" fill="#f4f4f5" />
                    <circle cx="23.5" cy="5" r="3.5" fill="#f4f4f5" />
                </svg>
            )
        case "halloween": // a pumpkin
            return (
                <svg {...common}>
                    <path d="M15 9c0-3 1-5 4-6" stroke="#65a30d" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                    <ellipse cx="10" cy="19" rx="7" ry="9" fill="#ea580c" />
                    <ellipse cx="22" cy="19" rx="7" ry="9" fill="#ea580c" />
                    <ellipse cx="16" cy="19" rx="7.5" ry="10" fill="#f97316" />
                    <path d="M10 16l3 3h-4ZM22 16l-3 3h4ZM10.5 23q5.5 4 11 0q-2 1.5-3 .5l-1 1.5-1.5-1.5-1.5 1.5-1-1.5q-1 1-3-.5Z" fill="#431407" />
                </svg>
            )
        case "valentine": // a heart
            return (
                <svg {...common}>
                    <path d="M16 28C14 26 3 19 3 11a6.5 6.5 0 0 1 13-1 6.5 6.5 0 0 1 13 1c0 8-11 15-13 17Z" fill="#f2557a" />
                </svg>
            )
        case "sakura": // a cherry blossom
            return (
                <svg {...common}>
                    {[0, 72, 144, 216, 288].map(a => (
                        <ellipse key={a} cx="16" cy="8.5" rx="5" ry="7.5" fill="#f9a8d4" transform={`rotate(${a} 16 16)`} />
                    ))}
                    <circle cx="16" cy="16" r="3.2" fill="#fde047" />
                </svg>
            )
        case "newyear": // sparkles
            return (
                <svg {...common}>
                    <path d="M13 3l2.4 7.6L23 13l-7.6 2.4L13 23l-2.4-7.6L3 13l7.6-2.4Z" fill="#f5c542" />
                    <path d="M24 18l1.3 3.7L29 23l-3.7 1.3L24 28l-1.3-3.7L19 23l3.7-1.3Z" fill="#fde68a" />
                </svg>
            )
        case "summer": // a paper lantern
            return (
                <svg {...common}>
                    <path d="M16 1v4" stroke="#a1a1aa" strokeWidth="1.5" />
                    <rect x="11" y="4" width="10" height="3" rx="1" fill="#3f3f46" />
                    <rect x="7" y="7" width="18" height="18" rx="9" fill="#ef4444" />
                    <path d="M8 12h16M7 16h18M8 20h16" stroke="#b91c1c" strokeWidth="1.2" />
                    <rect x="11" y="25" width="10" height="3" rx="1" fill="#3f3f46" />
                </svg>
            )
        default:
            return null
    }
}

// Where the drawing sits on the logo: a hat on top, a pumpkin at its foot...
const ON_LOGO: Record<string, string> = {
    christmas: "-top-[9px] -right-[7px] size-[19px] rotate-[18deg]",
    halloween: "-right-[6px] -bottom-[5px] size-[15px]",
    valentine: "-top-[5px] -right-[5px] size-[13px]",
    sakura: "-top-[5px] -right-[5px] size-[14px]",
    newyear: "-top-[6px] -right-[6px] size-[15px]",
    summer: "-top-[7px] -right-[4px] size-[13px]",
}

export function HolidayOnLogo({ holiday }: { holiday: Holiday | null }) {
    if (!holiday) return null
    return <HolidayIcon id={holiday.id} className={cn("pointer-events-none absolute drop-shadow", ON_LOGO[holiday.id])} />
}

// The holiday theme's button in the sidebar: its animation on or off, the
// themes off, or their settings.
export function HolidayButton({ holiday, wide }: { holiday: Holiday; wide: boolean }) {
    const settings = useSettings()
    const save = useSaveSettings()
    const navigate = useNavigate()
    const effects = settings?.ui.seasonalEffects ?? true
    const setUI = (ui: Partial<NonNullable<typeof settings>["ui"]>) => settings && save.mutate({ ...settings, ui: { ...settings.ui, ...ui } })
    const auto = (settings?.ui.seasonal ?? "auto") === "auto"
    const button = (
        <DropdownTrigger asChild>
            <button
                aria-label={`${holiday.name} theme`}
                className={cn(
                    "focus-ring flex h-9 shrink-0 items-center rounded-md text-[13.5px] font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-fg data-[state=open]:bg-white/[0.06]",
                    wide ? "gap-3 px-2.5" : "w-10 justify-center",
                )}
            >
                <HolidayIcon id={holiday.id} className="size-[18px] shrink-0" />
                {wide && <span className="truncate">{holiday.name}</span>}
            </button>
        </DropdownTrigger>
    )
    return (
        <Dropdown>
            {wide ? (
                button
            ) : (
                <Tooltip content={`${holiday.name} theme`} side="right">
                    {button}
                </Tooltip>
            )}
            <DropdownContent align="start" side={wide ? "top" : "right"} className="w-60">
                <DropdownLabel>
                    {holiday.name} theme{auto ? ` · ${holiday.when.replace(/^In /, "in ")}` : ""}
                </DropdownLabel>
                <DropdownItem icon={<Sparkles />} onSelect={() => setUI({ seasonalEffects: !effects })}>
                    {effects ? `Stop the ${holiday.effectName.toLowerCase()}` : `Show the ${holiday.effectName.toLowerCase()}`}
                </DropdownItem>
                <DropdownItem icon={<Power />} onSelect={() => setUI({ seasonal: "off" })}>
                    Turn off holiday themes
                </DropdownItem>
                <DropdownSeparator />
                <DropdownItem icon={<Palette />} onSelect={() => navigate("/settings?tab=ui")}>
                    Theme settings
                </DropdownItem>
            </DropdownContent>
        </Dropdown>
    )
}

const SEEN_KEY = "kumo-holiday-seen"

// A holiday theme that came on by itself (by the date) is said once a year,
// with a button to turn them off.
export function useHolidayNotice(holiday: Holiday | null, seasonal: string) {
    const settings = useSettings()
    const save = useSaveSettings()
    const id = seasonal === "auto" ? holiday?.id : undefined
    useEffect(() => {
        if (!id || !holiday || !settings) return
        const mark = `${id}-${new Date().getFullYear()}`
        try {
            if (localStorage.getItem(SEEN_KEY) === mark) return
            localStorage.setItem(SEEN_KEY, mark)
        } catch {
            return // nowhere to remember it: not said each time
        }
        toast(`Kumo's ${holiday.name} theme is on`, {
            description: `Its colors and ${holiday.effectName.toLowerCase()}, ${holiday.when.replace(/^In /, "in ").replace(/^January/, "on January")}. Settings › User Interface changes it.`,
            duration: 12000,
            action: { label: "Turn off", onClick: () => save.mutate({ ...settings, ui: { ...settings.ui, seasonal: "off" } }) },
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, !!settings])
}
