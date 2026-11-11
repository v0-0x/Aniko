import { Check, CheckCheck, Clock, HardDrive, Info, Minus, MoreHorizontal, Play } from "lucide-react"
import { useClassic } from "@/lib/themes"
import { cn, formatDuration, img } from "@/lib/utils"
import { Dropdown, DropdownContent, DropdownTrigger, Tooltip } from "./ui"

type Props = {
    image?: string
    number: number
    title?: string
    subtitle?: React.ReactNode
    runtime?: number
    watched?: boolean
    hasFile?: boolean
    progress?: number // 0-1 resume progress
    resumeAt?: number
    aired?: boolean
    blur?: boolean
    large?: boolean
    onClick?: () => void
    actions?: React.ReactNode
    // The episode's facts (length, air date, file size…), on one muted line
    // under "Ep N · title"; without them the subtitle is that line.
    facts?: React.ReactNode[]
    epLabel?: string | false // "Ep N" before the title (with facts); false for none
    tag?: string // "Filler" or "Recap": a tag on the picture's top left
    // Menu items for a "…" button by the title: always there, as a TV and a
    // phone can't hover.
    menu?: React.ReactNode
    onRemove?: () => void // "Continue watching": removes the card's item
    onInfo?: () => void // "Continue watching": opens the anime's page
    className?: string
}

export function EpisodeCard({ image, number, title, subtitle, runtime, watched, hasFile, progress, resumeAt, aired = true, blur, large, onClick, actions, facts, epLabel, tag, menu, onRemove, onInfo, className }: Props) {
    const classic = useClassic()
    const label = facts && epLabel !== false ? epLabel ?? `Ep ${number}` : ""
    const shown = (facts ?? []).filter(f => f !== undefined && f !== null && f !== false && f !== "")
    return (
        <div
            role="button"
            tabIndex={0}
            data-tv-card
            onClick={e => {
                // Menus open in portals outside the card, but React still
                // bubbles their clicks up to here: "Play in mpv" from the
                // episode menu used to also start the default player.
                if (!e.currentTarget.contains(e.target as Node)) return
                onClick?.()
            }}
            onKeyDown={e => {
                // Only keys on the card itself, not on its buttons.
                if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return
                e.preventDefault()
                onClick?.()
            }}
            className={cn("group/ep focus-ring flex cursor-pointer flex-col gap-2.5 outline-none", classic ? "rounded-lg" : "rounded-[10px]", !aired && "cursor-default opacity-50", className)}
        >
            <div className={cn("relative aspect-video overflow-hidden bg-surface-2", classic ? "rounded-lg" : "rounded-[10px] shadow-[0_6px_18px_-12px_rgb(0_0_0/0.8)]")}>
                {image ? (
                    <img
                        src={img(image)}
                        alt=""
                        loading="lazy"
                        className={cn(
                            "size-full object-cover transition-[filter,opacity] duration-300 group-hover/ep:brightness-[0.8]",
                            blur && !watched && "scale-110 blur-xl",
                            watched && "opacity-75 group-hover/ep:opacity-100",
                        )}
                    />
                ) : (
                    <div className="grid size-full place-items-center bg-surface-3 text-3xl font-semibold text-white/15 tabular-nums">{number}</div>
                )}
                <div
                    data-tv-ring
                    className={cn(
                        "pointer-events-none absolute inset-0 ring-1 transition-[box-shadow] duration-300 ring-inset",
                        classic ? "rounded-lg ring-white/[0.07] group-hover/ep:ring-white/20" : "rounded-[10px] ring-white/[0.07] group-hover/ep:ring-white/[0.22]",
                    )}
                />
                {aired && (
                    <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover/ep:opacity-100">
                        <span className={cn("grid place-items-center rounded-full bg-white/95 text-neutral-950 shadow-lg shadow-black/40", large ? "size-14" : "size-11")}>
                            <Play className={cn("ml-0.5 fill-current", large ? "size-5" : "size-4")} />
                        </span>
                    </div>
                )}
                {actions && (
                    <div className={cn("absolute top-2 right-2 opacity-0 transition-opacity group-hover/ep:opacity-100 focus-within:opacity-100", !menu && "[@media(pointer:coarse)]:opacity-100")} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        {actions}
                    </div>
                )}
                {(onRemove || onInfo) && (
                    <div
                        // On hover, and always on touch screens, which can't hover.
                        className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover/ep:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => e.stopPropagation()}
                    >
                        {onInfo && (
                            <Tooltip content="Anime page">
                                <button aria-label="Anime page" onClick={onInfo} className="focus-ring grid size-7 place-items-center rounded-md bg-black/70 text-white transition-colors hover:bg-black/85">
                                    <Info className="size-4" />
                                </button>
                            </Tooltip>
                        )}
                        {onRemove && (
                            <Tooltip content="Remove from Continue watching">
                                <button
                                    aria-label="Remove from Continue watching"
                                    onClick={onRemove}
                                    className="focus-ring grid size-7 place-items-center rounded-md bg-black/70 text-white transition-colors hover:bg-black/85"
                                >
                                    <Minus className="size-4" />
                                </button>
                            </Tooltip>
                        )}
                    </div>
                )}
                {tag && (
                    <span className={cn("absolute top-2 left-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase shadow-md shadow-black/40", tag === "Filler" ? "bg-amber-400 text-neutral-950" : "bg-sky-400 text-neutral-950")}>{tag}</span>
                )}
                {!facts && resumeAt !== undefined && resumeAt > 0 && (
                    <span className="absolute right-2 bottom-2.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
                        <Clock className="size-3" /> {formatDuration(resumeAt)}
                    </span>
                )}
                {!!progress && progress > 0 && (
                    <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/50">
                        <div className={cn("h-full bg-brand", !classic && "rounded-r-full")} style={{ width: `${Math.min(100, progress * 100)}%` }} />
                    </div>
                )}
            </div>
            <div className="flex items-start gap-1 px-0.5">
                <div className="min-w-0 flex-1">
                    <p className={cn("flex items-center gap-1.5 font-medium", large ? "text-[15px]" : "text-[13.5px]")}>
                        {watched && <Check aria-label="Watched" className="size-3.5 shrink-0 stroke-[3] text-emerald-400" />}
                        {label && <span className="shrink-0 text-muted tabular-nums">{label}</span>}
                        {title && <span className="truncate">{title}</span>}
                    </p>
                    {facts ? (
                        <p className="mt-0.5 truncate text-xs text-muted tabular-nums">
                            {shown.map((f, i) => (
                                <span key={i}>
                                    {i > 0 && " · "}
                                    {f}
                                </span>
                            ))}
                        </p>
                    ) : (
                        <p className={cn("mt-0.5 flex items-center gap-2 text-muted", large ? "text-[13.5px]" : "text-xs")}>
                            <span className="min-w-0 flex-1 truncate">{subtitle ?? `Episode ${number}`}</span>
                            {hasFile && <HardDrive aria-label="Downloaded" className="size-3 shrink-0 text-subtle" />}
                            {!!runtime && <span className="shrink-0 text-xs text-subtle tabular-nums">{runtime}m</span>}
                        </p>
                    )}
                </div>
                {menu && (
                    <div className="-mt-1 -mr-1.5 shrink-0" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        <Dropdown>
                            <DropdownTrigger asChild>
                                <button aria-label={`More for episode ${number}`} className="focus-ring grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-fg data-[state=open]:bg-white/[0.06] data-[state=open]:text-fg">
                                    <MoreHorizontal className="size-4" />
                                </button>
                            </DropdownTrigger>
                            <DropdownContent>{menu}</DropdownContent>
                        </Dropdown>
                    </div>
                )}
            </div>
        </div>
    )
}

// Small "mark as watched / unwatched" button for episode card actions.
export function WatchedToggle({ watched, onToggle, disabled }: { watched: boolean; onToggle: () => void; disabled?: boolean }) {
    const label = watched ? "Mark as unwatched" : "Mark as watched"
    return (
        <Tooltip content={label}>
            <button
                aria-label={label}
                disabled={disabled}
                onClick={e => {
                    e.stopPropagation()
                    onToggle()
                }}
                onKeyDown={e => e.stopPropagation()}
                className={cn(
                    "grid size-7 place-items-center rounded-md text-white transition-colors disabled:opacity-50",
                    watched ? "bg-emerald-500/90 hover:bg-emerald-500" : "bg-black/70 hover:bg-black/85",
                )}
            >
                {watched ? <CheckCheck className="size-4" /> : <Check className="size-4" />}
            </button>
        </Tooltip>
    )
}
