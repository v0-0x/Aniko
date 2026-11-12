import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Loader2, RefreshCw, X } from "lucide-react"
import React, { createContext, forwardRef, useContext, useEffect, useRef, useState } from "react"
import { useClassic } from "@/lib/themes"
import { tv } from "@/lib/tv"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Buttons

type ButtonVariant = "primary" | "white" | "subtle" | "ghost" | "outline" | "danger" | "success"
type ButtonSize = "xs" | "sm" | "md" | "lg"

// One thing is filled in: the main action, in the ink (the accent). The rest
// are words (index.css's word: brackets step in around them under the
// pointer).
const variants: Record<ButtonVariant, string> = {
    primary: "bg-brand text-[color:var(--on-brand)] hover:opacity-85",
    // On artwork: white whatever the accent.
    white: "bg-white text-black hover:opacity-85",
    subtle: "word text-fg/85 hover:text-fg data-[state=open]:text-fg",
    ghost: "word text-muted hover:text-fg data-[state=open]:text-fg",
    outline: "word text-fg/85 hover:text-fg data-[state=open]:text-fg",
    danger: "word text-rose-300 hover:text-rose-200",
    success: "word text-emerald-300 hover:text-emerald-200",
}
// In small capitals (index.css's label).
const sizes: Record<ButtonSize, string> = {
    xs: "label h-7 gap-1.5 rounded-sm px-2.5 text-[10px]",
    sm: "label h-8 gap-1.5 rounded-sm px-3 text-[10.5px]",
    md: "label h-9 gap-2 rounded-sm px-3.5",
    lg: "label h-11 gap-2.5 rounded-sm px-5 text-xs",
}
// The Classic look's (before 3.0.37): rounded pills in the rounded face.
const classicVariants: Record<ButtonVariant, string> = {
    // The accent as a chunky pill: a solid edge under it, pressed down when
    // pressed. Its text dark or white, whichever reads on the accent.
    primary:
        "bg-brand font-bold text-[color:var(--on-brand)] shadow-[0_3px_0_color-mix(in_oklab,var(--brand)_60%,black)] hover:bg-[color-mix(in_oklab,var(--brand)_88%,white)] active:translate-y-[2px] active:shadow-[0_1px_0_color-mix(in_oklab,var(--brand)_60%,black)]",
    white: "bg-white font-bold text-neutral-950 shadow-[0_3px_0_#b9b1c9] hover:bg-white/90 active:translate-y-[2px] active:shadow-[0_1px_0_#b9b1c9]",
    subtle: "bg-white/[0.065] text-fg hover:bg-white/[0.1]",
    ghost: "text-muted hover:text-fg hover:bg-white/[0.06]",
    outline: "border border-line-strong text-fg hover:bg-white/[0.05]",
    danger: "bg-rose-500/12 text-rose-300 hover:bg-rose-500/20",
    success: "bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20",
}
const classicSizes: Record<ButtonSize, string> = {
    xs: "h-7 px-3 text-xs gap-1.5 rounded-full font-display",
    sm: "h-8 px-3.5 text-[13px] gap-1.5 rounded-full font-display",
    md: "h-9 px-4 text-sm gap-2 rounded-full font-display",
    lg: "h-11 px-6 text-[15px] gap-2 rounded-full font-display",
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    size?: ButtonSize
    loading?: boolean
    icon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = "subtle", size = "md", loading, icon, className, children, disabled, ...props },
    ref,
) {
    const classic = useClassic()
    // While loading it ignores presses but isn't disabled: a disabled button
    // loses the focus, and a TV's remote its place on the page.
    const busy = loading && !disabled
    return (
        <button
            ref={ref}
            disabled={disabled}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            className={cn(
                "focus-ring inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,border-color,color,opacity,transform,filter] select-none active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 aria-busy:opacity-50 aria-busy:active:scale-100 [&_svg]:shrink-0",
                (classic ? classicVariants : variants)[variant],
                (classic ? classicSizes : sizes)[size],
                className,
            )}
            {...props}
            onClick={busy ? e => e.preventDefault() : props.onClick}
        >
            {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
            {children}
        </button>
    )
})

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label?: string }>(function IconButton(
    { variant = "ghost", size = "md", className, label, children, ...props },
    ref,
) {
    const dims = { xs: "size-7", sm: "size-8", md: "size-9", lg: "size-11" }[size]
    const btn = (
        <Button ref={ref} variant={variant} size={size} className={cn(dims, "icon-only px-0", className)} aria-label={label} {...props}>
            {children}
        </Button>
    )
    return label ? <Tooltip content={label}>{btn}</Tooltip> : btn
})

// ---------------------------------------------------------------------------
// Form controls

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }>(
    function Input({ className, icon, ...props }, ref) {
        const classic = useClassic()
        return (
            <div className="relative w-full">
                {icon && <span className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-subtle", classic ? "left-3" : "left-0.5")}>{icon}</span>}
                <input
                    ref={ref}
                    className={cn(
                        classic
                            ? "h-9 w-full rounded-full border border-line bg-white/[0.035] px-4 text-sm text-fg placeholder:text-subtle"
                            : "h-9 w-full rounded-none border-b border-line-strong bg-transparent px-0.5 text-sm text-fg placeholder:text-subtle",
                        classic
                            ? "transition-[border-color,background-color,box-shadow] outline-none hover:border-line-strong focus:border-brand/60 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_12%,transparent)] disabled:opacity-60"
                            : "transition-[border-color] outline-none hover:border-fg/45 focus:border-fg disabled:opacity-60",
                        icon && (classic ? "pl-9" : "pl-7"),
                        className,
                    )}
                    {...props}
                />
            </div>
        )
    },
)

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
    { className, ...props },
    ref,
) {
    const classic = useClassic()
    return (
        <textarea
            ref={ref}
            className={cn(
                classic
                    ? "min-h-24 w-full rounded-[9px] border border-line bg-white/[0.035] px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_12%,transparent)]"
                    : "min-h-24 w-full rounded-sm border border-line bg-transparent px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none transition-[border-color] hover:border-line-strong focus:border-fg",
                className,
            )}
            {...props}
        />
    )
})

export function Select({
    value,
    onChange,
    options,
    className,
    disabled,
}: {
    value: string
    onChange: (v: string) => void
    options: { value: string; label: string }[]
    className?: string
    disabled?: boolean
}) {
    const classic = useClassic()
    return (
        <div className={cn("relative", className)}>
            <select
                value={value}
                disabled={disabled}
                onChange={e => onChange(e.target.value)}
                className={
                    classic
                        ? "h-9 w-full cursor-pointer appearance-none rounded-full border border-line bg-white/[0.035] pr-9 pl-4 text-sm text-fg outline-none transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_12%,transparent)] disabled:opacity-60"
                        : "h-9 w-full cursor-pointer appearance-none rounded-none border-b border-line-strong bg-transparent pr-7 pl-0.5 text-sm text-fg outline-none transition-[border-color] hover:border-fg/45 focus:border-fg disabled:opacity-60"
                }
            >
                {options.map(o => (
                    <option key={o.value} value={o.value} className="bg-surface-2">
                        {o.label}
                    </option>
                ))}
            </select>
            <ChevronDown className={cn("pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-subtle", classic ? "right-3" : "right-0.5")} />
        </div>
    )
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
    const classic = useClassic()
    if (classic)
        return (
            <SwitchPrimitive.Root
                aria-label={label}
                checked={checked}
                onCheckedChange={onChange}
                disabled={disabled}
                className="focus-ring relative h-[22px] w-10 shrink-0 rounded-full bg-white/[0.14] transition-colors data-[state=checked]:bg-brand disabled:opacity-50"
            >
                <SwitchPrimitive.Thumb className="block size-4 translate-x-[3px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out data-[state=checked]:translate-x-[21px]" />
            </SwitchPrimitive.Root>
        )
    // An outlined slot, its block on the left; on, the slot is filled with
    // the ink and the block is on the right.
    return (
        <SwitchPrimitive.Root
            aria-label={label}
            checked={checked}
            onCheckedChange={onChange}
            disabled={disabled}
            className="group/switch focus-ring relative flex h-5 w-9 shrink-0 items-center border border-line-strong transition-colors hover:border-fg/45 data-[state=checked]:border-brand data-[state=checked]:bg-brand disabled:opacity-50"
        >
            <SwitchPrimitive.Thumb className="block size-2.5 translate-x-1 bg-muted transition-[transform,background-color] duration-200 ease-out data-[state=checked]:translate-x-5 data-[state=checked]:bg-[color:var(--on-brand)]" />
        </SwitchPrimitive.Root>
    )
}

export function Field({ label, help, children, className }: { label?: React.ReactNode; help?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <label className={cn("flex flex-col gap-1.5", className)}>
            {label && <span className="text-[13px] font-medium text-fg/90">{label}</span>}
            {children}
            {help && <span className="text-xs text-subtle">{help}</span>}
        </label>
    )
}

// ---------------------------------------------------------------------------
// Display

export function Badge({ children, className, tone = "gray" }: { children: React.ReactNode; className?: string; tone?: "gray" | "brand" | "green" | "amber" | "red" | "blue" }) {
    const classic = useClassic()
    if (classic) {
        const tones = {
            gray: "bg-white/[0.07] text-fg/75",
            brand: "bg-brand-soft text-brand-strong",
            green: "bg-emerald-500/12 text-emerald-300",
            amber: "bg-amber-500/12 text-amber-300",
            red: "bg-rose-500/12 text-rose-300",
            blue: "bg-sky-500/12 text-sky-300",
        }
        return <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>
    }
    // A word in small capitals, in its tone.
    const tones = {
        gray: "text-muted",
        brand: "text-brand-strong",
        green: "text-emerald-300",
        amber: "text-amber-300",
        red: "text-rose-300",
        blue: "text-sky-300",
    }
    return <span className={cn("label inline-flex h-5 items-center gap-1 text-[10px] whitespace-nowrap", tones[tone], className)}>{children}</span>
}

export function Skeleton({ className }: { className?: string }) {
    return <div className={cn("shimmer rounded-lg", className)} />
}

export function Spinner({ className }: { className?: string }) {
    return <Loader2 className={cn("size-5 animate-spin text-brand", className)} />
}

export function Progress({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
    return (
        <div className={cn("h-1 w-full overflow-hidden rounded-full bg-white/[0.08]", className)}>
            <div className={cn("h-full rounded-full bg-brand transition-[width] duration-500 ease-out", barClassName)} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
        </div>
    )
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
    const classic = useClassic()
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-2 px-6 py-14 text-center fade-in",
                classic && "rounded-[14px] bg-white/[0.025]",
            )}
        >
            {icon &&
                (classic ? (
                    <div className="mb-1 grid size-11 place-items-center rounded-full bg-white/[0.05] text-muted [&_svg]:size-5 [&_svg]:stroke-[1.6]">{icon}</div>
                ) : (
                    <div className="mb-1 text-subtle [&_svg]:size-7 [&_svg]:stroke-[1.25]">{icon}</div>
                ))}
            <h3 className="text-[15px] font-semibold">{title}</h3>
            {children && <div className="max-w-md text-sm text-muted">{children}</div>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    )
}

// A load that failed: what went wrong and a way to try again. compact fits
// inside dialogs and lists.
export function ErrorState({
    title,
    error,
    onRetry,
    retrying,
    compact,
    className,
}: {
    title: string
    error: unknown
    onRetry?: () => void
    retrying?: boolean
    compact?: boolean
    className?: string
}) {
    const message = error instanceof Error ? error.message : error ? String(error) : ""
    const retry = onRetry && (
        <Button size={compact ? "sm" : "md"} icon={<RefreshCw className="size-4" />} loading={retrying} onClick={onRetry}>
            Try again
        </Button>
    )
    if (!compact)
        return (
            <EmptyState icon={<AlertTriangle className="size-6" />} title={title} action={retry}>
                {message && <span className="break-words">{message}</span>}
            </EmptyState>
        )
    return (
        <div className={cn("flex flex-col items-center gap-2 px-6 py-8 text-center", className)}>
            <AlertTriangle className="size-5 text-amber-300" />
            <p className="text-sm font-semibold">{title}</p>
            {message && <p className="max-w-md text-xs break-words text-subtle">{message}</p>}
            {retry && <div className="mt-1">{retry}</div>}
        </div>
    )
}

export function SectionHeader({ title, subtitle, action, className }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string }) {
    return (
        <div className={cn("mb-4 flex items-end justify-between gap-4", className)}>
            <div>
                <h2 className="text-xl leading-tight font-semibold tracking-tight">{title}</h2>
                {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
            </div>
            {action}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Tabs

export function Tabs<T extends string>({
    value,
    onChange,
    tabs,
    className,
    variant = "segmented",
}: {
    value: T
    onChange: (v: T) => void
    tabs: { value: T; label: React.ReactNode; icon?: React.ReactNode; count?: number | string }[]
    className?: string
    // segmented: a compact switch, for filters and toolbars; underline: a
    // page's sections.
    variant?: "segmented" | "underline"
}) {
    const classic = useClassic()
    if (variant === "underline")
        return (
            <div className={cn("no-scrollbar flex max-w-full gap-6 overflow-x-auto border-b border-line", className)}>
                {tabs.map(t => (
                    <button
                        key={t.value}
                        onClick={() => onChange(t.value)}
                        className={cn(
                            "focus-ring relative flex h-10 shrink-0 items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors [&_svg]:size-4",
                            value === t.value ? "text-fg" : "text-muted hover:text-fg",
                        )}
                    >
                        {t.icon}
                        {t.label}
                        {t.count !== undefined && (
                            <span className={cn("tabular-nums", classic ? "rounded-md bg-white/[0.06] px-1.5 text-[11px] leading-[18px] text-muted" : "text-[11px] text-subtle")}>{t.count}</span>
                        )}
                        <span
                            className={cn(
                                "absolute inset-x-0 bg-brand",
                                // The line under the open one: drawn out from its middle (inside the row, which cuts off what's under it).
                                classic
                                    ? cn("-bottom-px h-0.5 rounded-full shadow-[0_0_6px_color-mix(in_oklab,var(--brand)_45%,transparent)] transition-opacity", value === t.value ? "opacity-100" : "opacity-0")
                                    : cn("bottom-0 h-px origin-center transition-transform duration-300 ease-out", value === t.value ? "scale-x-100" : "scale-x-0"),
                            )}
                        />
                    </button>
                ))}
            </div>
        )
    return (
        <div
            className={cn(
                "no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto",
                classic ? "rounded-full bg-white/[0.04] p-[3px]" : "gap-1",
                className,
            )}
        >
            {tabs.map(t => (
                <button
                    key={t.value}
                    onClick={() => onChange(t.value)}
                    aria-pressed={value === t.value}
                    className={cn(
                        "focus-ring flex items-center gap-1.5 px-3 font-medium whitespace-nowrap transition-[background-color,color,box-shadow] [&_svg]:size-3.5",
                        // This look: words, the chosen one in brackets (index.css's word).
                        classic ? "h-7 rounded-full font-display text-[13px]" : "word label h-8 shrink-0 text-[10.5px]",
                        value === t.value ? (classic ? "bg-white/[0.1] text-fg shadow-[0_1px_2px_rgb(0_0_0/0.3)]" : "text-fg") : "text-muted hover:text-fg",
                    )}
                >
                    {t.icon}
                    {t.label}
                    {t.count !== undefined && <span className={cn("tabular-nums", classic ? "text-xs" : "text-[10px]", value === t.value ? "text-muted" : "text-subtle")}>{t.count}</span>}
                </button>
            ))}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Overlays

// Where menus, tooltips, popovers and dialogs go: into the element that's
// fullscreen (the player's) when there is one, else the page. Outside it
// nothing shows in fullscreen, and an open menu would take every click.
function layer() {
    return (document.fullscreenElement as HTMLElement | null) ?? undefined
}

// What's inside stays dark in a light theme (the player): its menus,
// tooltips and dialogs too, which are drawn outside it (index.css's
// on-dark).
export const DarkScope = createContext(false)
const useDark = () => (useContext(DarkScope) ? "on-dark" : undefined)

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
    const classic = useClassic()
    const dark = useDark()
    return (
        <TooltipPrimitive.Root delayDuration={350}>
            <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
            <TooltipPrimitive.Portal container={layer()}>
                <TooltipPrimitive.Content
                    side={side}
                    sideOffset={8}
                    className={cn(
                        "z-[100] px-2 py-1 text-xs font-medium text-fg shadow-lg shadow-black/40 fade-in",
                        classic ? "rounded-lg border border-line bg-surface-4" : "rounded-sm border border-line-strong bg-surface-2",
                        dark,
                    )}
                >
                    {content}
                </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
    )
}

export const TooltipProvider = TooltipPrimitive.Provider

export function Dialog({
    open,
    onOpenChange,
    title,
    description,
    children,
    className,
    footer,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
    title?: React.ReactNode
    description?: React.ReactNode
    children?: React.ReactNode
    className?: string
    footer?: React.ReactNode
}) {
    const classic = useClassic()
    const dark = useDark()
    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal container={layer()}>
                <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50 fade-in", classic ? "bg-black/60 backdrop-blur-[2px]" : "bg-black/70", dark)} />
                <DialogPrimitive.Content
                    className={cn(
                        "fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col border border-line-strong bg-surface-1 outline-none [animation:pop-in_0.16s_var(--ease)_both]",
                        classic ? "rounded-[14px] [box-shadow:0_24px_60px_-20px_rgb(0_0_0/0.65),inset_0_1px_0_rgb(255_255_255/0.04)]" : "rounded-sm bg-bg",
                        dark,
                        className,
                    )}
                    aria-describedby={undefined}
                >
                    {(title || description) && (
                        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-3">
                            <div>
                                {title && <DialogPrimitive.Title className={cn("font-semibold", classic ? "text-base tracking-tight" : "font-display text-lg tracking-tight")}>{title}</DialogPrimitive.Title>}
                                {description && <DialogPrimitive.Description className="mt-0.5 text-sm text-muted">{description}</DialogPrimitive.Description>}
                            </div>
                            <DialogPrimitive.Close
                                aria-label="Close"
                                className="focus-ring -mt-1 -mr-2 grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.07] hover:text-fg"
                            >
                                <X className="size-4" />
                            </DialogPrimitive.Close>
                        </div>
                    )}
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-5">{children}</div>
                    {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-3.5">{footer}</div>}
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}

export const Dropdown = DropdownPrimitive.Root
export const DropdownTrigger = DropdownPrimitive.Trigger

export function DropdownContent({
    children,
    align = "end",
    side,
    sideOffset = 6,
    onCloseAutoFocus,
    className,
}: {
    children: React.ReactNode
    align?: "start" | "center" | "end"
    side?: "top" | "right" | "bottom" | "left"
    sideOffset?: number
    onCloseAutoFocus?: (e: Event) => void
    className?: string
}) {
    const classic = useClassic()
    const dark = useDark()
    return (
        <DropdownPrimitive.Portal container={layer()}>
            <DropdownPrimitive.Content
                align={align}
                side={side}
                sideOffset={sideOffset}
                collisionPadding={8}
                onCloseAutoFocus={onCloseAutoFocus}
                className={cn(
                    "z-[60] min-w-52 border border-line-strong bg-surface-2 pop-in origin-[var(--radix-dropdown-menu-content-transform-origin)]",
                    classic ? "rounded-[10px] p-1 shadow-[0_14px_40px_-12px_rgb(0_0_0/0.65),inset_0_1px_0_rgb(255_255_255/0.04)]" : "rounded-sm bg-surface-1 p-1",
                    dark,
                    className,
                )}
            >
                {children}
            </DropdownPrimitive.Content>
        </DropdownPrimitive.Portal>
    )
}

// A menu at the pointer for a right-click on something (a TV's Menu key
// right-clicks what the remote is on, lib/tv). onContextMenu goes on the
// element, which must be positioned (relative), and node inside it. With no
// menu both do nothing.
export function useContextMenu(menu: React.ReactNode) {
    const [at, setAt] = useState<{ x: number; y: number } | null>(null) // in the element
    const focused = useRef<Element | null>(null)
    const onContextMenu = (e: React.MouseEvent<HTMLElement>) => {
        if (!menu) return
        // React also brings right-clicks in what's drawn elsewhere (the open
        // menu, a dialog: portals) here: those keep the browser's own menu.
        // So does a field to type in (paste).
        const t = e.target as HTMLElement
        if (!e.currentTarget.contains(t)) return
        if (t.isContentEditable || t.tagName === "TEXTAREA" || (t instanceof HTMLInputElement && !["checkbox", "radio", "range", "button", "submit", "color", "file"].includes(t.type))) return
        e.preventDefault()
        // One menu: not also the one of a box this is in.
        e.stopPropagation()
        const r = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - r.left
        const y = e.clientY - r.top
        focused.current = document.activeElement
        // Opened with the menu key there may be no pointer in it.
        setAt(x >= 0 && y >= 0 && x <= r.width && y <= r.height ? { x, y } : { x: r.width / 2, y: r.height / 3 })
    }
    const node = menu ? (
        <Dropdown open={!!at} onOpenChange={v => !v && setAt(null)} modal={false}>
            <DropdownTrigger asChild>
                <span aria-hidden className="pointer-events-none absolute" style={{ left: at?.x, top: at?.y }} />
            </DropdownTrigger>
            <DropdownContent
                align="start"
                sideOffset={2}
                // Focus goes back where it was (the card, after the menu
                // key), unless something else took it (a dialog, a click).
                onCloseAutoFocus={e => {
                    e.preventDefault()
                    if (document.activeElement === document.body && focused.current instanceof HTMLElement) focused.current.focus()
                }}
            >
                {menu}
            </DropdownContent>
        </Dropdown>
    ) : null
    return { onContextMenu, node }
}

// A row, a card or any box with a right-click menu: the same items its "⋯"
// button shows (give both the same fragment). It's a positioned div; with
// no menu, a plain one.
export function ContextArea({ menu, className, children, ...props }: Omit<React.HTMLAttributes<HTMLDivElement>, "onContextMenu"> & { menu: React.ReactNode }) {
    const context = useContextMenu(menu)
    return (
        <div className={cn("relative", className)} onContextMenu={context.onContextMenu} {...props}>
            {children}
            {context.node}
        </div>
    )
}

export function DropdownItem({
    children,
    onSelect,
    icon,
    danger,
    disabled,
    keepOpen,
    className,
}: {
    children: React.ReactNode
    onSelect?: () => void
    icon?: React.ReactNode
    danger?: boolean
    disabled?: boolean
    // The menu stays open (a step of several, like moving the subtitles).
    keepOpen?: boolean
    className?: string
}) {
    const classic = useClassic()
    return (
        <DropdownPrimitive.Item
            onSelect={e => {
                if (keepOpen) e.preventDefault()
                onSelect?.()
            }}
            disabled={disabled}
            className={cn(
                "flex h-8 cursor-pointer items-center gap-2.5 text-[13px] outline-none select-none data-[disabled]:opacity-40",
                classic ? "rounded-md px-2.5 data-[highlighted]:bg-white/[0.07]" : "rounded-sm px-2.5 transition-colors duration-100 data-[highlighted]:bg-white/[0.09]",
                danger ? "text-rose-300" : "text-fg",
                className,
            )}
        >
            {icon && <span className={cn("text-muted [&>svg]:size-4", classic ? "[&>svg]:stroke-[1.75]" : "[&>svg]:stroke-[1.5]")}>{icon}</span>}
            {children}
        </DropdownPrimitive.Item>
    )
}

export function DropdownSeparator() {
    return <DropdownPrimitive.Separator className="-mx-1 my-1 h-px bg-line" />
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
    const classic = useClassic()
    return (
        <DropdownPrimitive.Label className={cn("pt-1.5 pb-1 text-subtle", classic ? "px-2.5 text-xs font-medium" : "label px-2.5 text-[10px]")}>
            {children}
        </DropdownPrimitive.Label>
    )
}

export function Popover({
    trigger,
    children,
    open,
    onOpenChange,
    side = "right",
    align = "end",
    className,
}: {
    trigger: React.ReactNode
    children: React.ReactNode
    open?: boolean
    onOpenChange?: (v: boolean) => void
    side?: "top" | "right" | "bottom" | "left"
    align?: "start" | "center" | "end"
    className?: string
}) {
    const classic = useClassic()
    const dark = useDark()
    return (
        <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal container={layer()}>
                <PopoverPrimitive.Content
                    side={side}
                    align={align}
                    sideOffset={12}
                    collisionPadding={12}
                    className={cn(
                        "z-[60] max-h-[85vh] overflow-y-auto border border-line-strong bg-surface-1 p-4 outline-none pop-in origin-[var(--radix-popover-content-transform-origin)]",
                        classic ? "rounded-[14px] shadow-[0_14px_40px_-12px_rgb(0_0_0/0.65),inset_0_1px_0_rgb(255_255_255/0.04)]" : "rounded-sm",
                        dark,
                        className,
                    )}
                >
                    {children}
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    )
}

// A small switch of two or three words (sub / dub) a page builds itself:
// its box, and each word. In this look they're words, the chosen one in
// brackets: give it data-on too (index.css's word).
export const switchBox = (classic: boolean) => cn("flex", classic ? "rounded-lg bg-white/[0.04] p-0.5" : "gap-0.5")
export const switchItem = (classic: boolean, on: boolean) =>
    cn("h-7 font-medium uppercase transition-colors", classic ? "rounded-md px-3 text-xs" : "word label px-2.5 text-[10px]", on ? (classic ? "bg-white/[0.1] text-fg" : "text-fg") : "text-muted hover:text-fg")

// A link over artwork that looks like a button (a banner's Details), in
// this look: a word in white.
export const artButton = "word label focus-ring inline-flex h-9 items-center px-3.5 text-white/80 transition-colors hover:text-white"

// One choice in a row of them (a genre, a filter): on, it's the one chosen.
export function Chip({ on, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
    const classic = useClassic()
    return (
        <button
            aria-pressed={!!on}
            className={cn(
                "h-8 shrink-0 font-medium transition-colors",
                classic
                    ? cn("rounded-full px-3.5 text-[13px]", on ? "bg-white text-neutral-950" : "bg-white/[0.05] text-muted hover:bg-white/[0.09] hover:text-fg")
                    : // A word; the chosen one in brackets.
                      cn("word label focus-ring px-3 text-[10.5px]", on ? "text-fg" : "text-muted hover:text-fg"),
                className,
            )}
            {...props}
        >
            {children}
        </button>
    )
}

// A row of chips (genres) that scrolls sideways when they don't fit: it
// fades out on the side with more, and an arrow there scrolls it. Not on a
// TV, whose remote moves along the chips themselves.
export function ChipRow({ children, className, label = "More" }: { children: React.ReactNode; className?: string; label?: string }) {
    const ref = useRef<HTMLDivElement>(null)
    const [edges, setEdges] = useState({ left: false, right: false })
    const check = () => {
        const el = ref.current
        if (!el) return
        const left = el.scrollLeft > 2
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
        setEdges(e => (e.left === left && e.right === right ? e : { left, right }))
    }
    // Each render too: the chips can come in after it's drawn.
    useEffect(check)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const ro = new ResizeObserver(check)
        ro.observe(el)
        el.addEventListener("scroll", check, { passive: true })
        return () => {
            ro.disconnect()
            el.removeEventListener("scroll", check)
        }
    }, [])
    const fade = `linear-gradient(to right, ${edges.left ? "transparent, #000 48px" : "#000"}, ${edges.right ? "#000 calc(100% - 48px), transparent" : "#000"})`
    const arrow = (dir: -1 | 1) => (
        <button
            onClick={() => ref.current?.scrollBy({ left: dir * Math.max(200, (ref.current?.clientWidth ?? 400) * 0.7), behavior: "smooth" })}
            data-tv-skip-nav
            aria-label={dir < 0 ? "Back" : label}
            className={cn("grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-fg fade-in", dir < 0 ? "mr-1" : "ml-1")}
        >
            {dir < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
    )
    return (
        <div className={cn("relative flex items-center", className)}>
            {!tv && edges.left && arrow(-1)}
            <div ref={ref} className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth py-1" style={edges.left || edges.right ? { maskImage: fade, WebkitMaskImage: fade } : undefined}>
                {children}
            </div>
            {!tv && edges.right && arrow(1)}
        </div>
    )
}
