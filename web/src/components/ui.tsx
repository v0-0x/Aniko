import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { AlertTriangle, ChevronDown, Loader2, RefreshCw, X } from "lucide-react"
import React, { forwardRef } from "react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Buttons

type ButtonVariant = "primary" | "white" | "subtle" | "ghost" | "outline" | "danger" | "success"
type ButtonSize = "xs" | "sm" | "md" | "lg"

const variants: Record<ButtonVariant, string> = {
    // The accent, lit from above, with a glow of its color.
    primary:
        "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--brand)_86%,white),var(--brand))] text-white shadow-[0_6px_18px_-8px_var(--brand),inset_0_1px_0_rgb(255_255_255/0.18)] hover:brightness-110",
    white: "bg-white text-neutral-950 shadow-[0_6px_18px_-10px_rgb(255_255_255/0.6)] hover:bg-white/90",
    subtle: "bg-white/[0.06] text-fg ring-1 ring-white/[0.05] ring-inset hover:bg-white/[0.1]",
    ghost: "text-muted hover:text-fg hover:bg-white/[0.06]",
    outline: "border border-line-strong text-fg hover:bg-white/[0.05]",
    danger: "bg-rose-500/12 text-rose-300 ring-1 ring-rose-400/15 ring-inset hover:bg-rose-500/20",
    success: "bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-400/15 ring-inset hover:bg-emerald-500/20",
}
const sizes: Record<ButtonSize, string> = {
    xs: "h-7 px-2.5 text-xs gap-1.5 rounded-lg",
    sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[9px]",
    md: "h-9 px-3.5 text-sm gap-2 rounded-[10px]",
    lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
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
    return (
        <button
            ref={ref}
            disabled={disabled || loading}
            className={cn(
                "focus-ring inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,color,opacity,transform,filter] select-none active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 [&_svg]:shrink-0",
                variants[variant],
                sizes[size],
                className,
            )}
            {...props}
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
        <Button ref={ref} variant={variant} size={size} className={cn(dims, "px-0", className)} aria-label={label} {...props}>
            {children}
        </Button>
    )
    return label ? <Tooltip content={label}>{btn}</Tooltip> : btn
})

// ---------------------------------------------------------------------------
// Form controls

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }>(
    function Input({ className, icon, ...props }, ref) {
        return (
            <div className="relative w-full">
                {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle">{icon}</span>}
                <input
                    ref={ref}
                    className={cn(
                        "h-9 w-full rounded-[10px] border border-line bg-white/[0.03] px-3 text-sm text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)] placeholder:text-subtle",
                        "transition-[border-color,background-color,box-shadow] outline-none hover:border-line-strong focus:border-brand/60 focus:bg-white/[0.045] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_18%,transparent)] disabled:opacity-60",
                        icon && "pl-9",
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
    return (
        <textarea
            ref={ref}
            className={cn(
                "min-h-24 w-full rounded-[10px] border border-line bg-white/[0.03] px-3 py-2 text-sm text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)] placeholder:text-subtle outline-none transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_18%,transparent)]",
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
    return (
        <div className={cn("relative", className)}>
            <select
                value={value}
                disabled={disabled}
                onChange={e => onChange(e.target.value)}
                className="h-9 w-full cursor-pointer appearance-none rounded-[10px] border border-line bg-white/[0.03] pr-9 pl-3 text-sm text-fg outline-none transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_18%,transparent)] disabled:opacity-60"
            >
                {options.map(o => (
                    <option key={o.value} value={o.value} className="bg-surface-2">
                        {o.label}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-subtle" />
        </div>
    )
}

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <SwitchPrimitive.Root
            checked={checked}
            onCheckedChange={onChange}
            disabled={disabled}
            className="focus-ring relative h-[22px] w-10 shrink-0 rounded-full bg-white/[0.14] transition-colors data-[state=checked]:bg-brand disabled:opacity-50"
        >
            <SwitchPrimitive.Thumb className="block size-4 translate-x-[3px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out data-[state=checked]:translate-x-[21px]" />
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
    const tones = {
        gray: "bg-white/[0.07] text-fg/75",
        brand: "bg-brand-soft text-brand-strong",
        green: "bg-emerald-500/12 text-emerald-300",
        amber: "bg-amber-500/12 text-amber-300",
        red: "bg-rose-500/12 text-rose-300",
        blue: "bg-sky-500/12 text-sky-300",
    }
    return (
        <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}>
            {children}
        </span>
    )
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
    return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-white/[0.015] px-6 py-14 text-center fade-in">
            {icon && <div className="mb-1 grid size-12 place-items-center rounded-full bg-white/[0.05] text-muted ring-1 ring-white/[0.06] [&_svg]:size-5 [&_svg]:stroke-[1.75]">{icon}</div>}
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
                <h2 className="text-[1.3rem] leading-tight font-semibold tracking-tight">{title}</h2>
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
    tabs: { value: T; label: React.ReactNode; icon?: React.ReactNode; count?: number }[]
    className?: string
    // segmented: a compact switch, for filters and toolbars; underline: a
    // page's sections.
    variant?: "segmented" | "underline"
}) {
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
                        {t.count !== undefined && <span className="rounded-md bg-white/[0.06] px-1.5 text-[11px] leading-[18px] text-muted tabular-nums">{t.count}</span>}
                        <span className={cn("absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand shadow-[0_0_10px_var(--brand)] transition-opacity", value === t.value ? "opacity-100" : "opacity-0")} />
                    </button>
                ))}
            </div>
        )
    return (
        <div className={cn("no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-white/[0.035] p-1 ring-1 ring-white/[0.04] ring-inset", className)}>
            {tabs.map(t => (
                <button
                    key={t.value}
                    onClick={() => onChange(t.value)}
                    className={cn(
                        "focus-ring flex h-7 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] [&_svg]:size-3.5",
                        value === t.value ? "bg-surface-4 text-fg shadow-[0_1px_3px_rgb(0_0_0/0.35),inset_0_1px_0_rgb(255_255_255/0.06)]" : "text-muted hover:text-fg",
                    )}
                >
                    {t.icon}
                    {t.label}
                    {t.count !== undefined && <span className={cn("text-xs tabular-nums", value === t.value ? "text-muted" : "text-subtle")}>{t.count}</span>}
                </button>
            ))}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Overlays

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
    return (
        <TooltipPrimitive.Root delayDuration={350}>
            <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
            <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                    side={side}
                    sideOffset={8}
                    className="z-[100] rounded-lg border border-line-strong bg-surface-3 px-2 py-1 text-xs font-medium text-fg shadow-lg shadow-black/40 fade-in"
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
    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[3px] fade-in" />
                <DialogPrimitive.Content
                    className={cn(
                        "fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line-strong bg-surface-1 outline-none [animation:pop-in_0.16s_var(--ease)_both] [box-shadow:0_30px_80px_-20px_rgb(0_0_0/0.7),inset_0_1px_0_rgb(255_255_255/0.05)]",
                        className,
                    )}
                    aria-describedby={undefined}
                >
                    {(title || description) && (
                        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-3">
                            <div>
                                {title && <DialogPrimitive.Title className="text-[17px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>}
                                {description && <DialogPrimitive.Description className="mt-0.5 text-sm text-muted">{description}</DialogPrimitive.Description>}
                            </div>
                            <DialogPrimitive.Close aria-label="Close" className="focus-ring -mt-1 -mr-2 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.08] hover:text-fg">
                                <X className="size-4" />
                            </DialogPrimitive.Close>
                        </div>
                    )}
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-5">{children}</div>
                    {footer && <div className="flex justify-end gap-2 rounded-b-2xl border-t border-line bg-white/[0.015] px-6 py-3.5">{footer}</div>}
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
    return (
        <DropdownPrimitive.Portal>
            <DropdownPrimitive.Content
                align={align}
                side={side}
                sideOffset={sideOffset}
                collisionPadding={8}
                onCloseAutoFocus={onCloseAutoFocus}
                className={cn(
                    "z-[60] min-w-52 rounded-xl border border-line-strong bg-surface-2 p-1.5 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.7),inset_0_1px_0_rgb(255_255_255/0.05)] pop-in origin-[var(--radix-dropdown-menu-content-transform-origin)]",
                    className,
                )}
            >
                {children}
            </DropdownPrimitive.Content>
        </DropdownPrimitive.Portal>
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
    return (
        <DropdownPrimitive.Item
            onSelect={e => {
                if (keepOpen) e.preventDefault()
                onSelect?.()
            }}
            disabled={disabled}
            className={cn(
                "flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-white/[0.08]",
                danger ? "text-rose-300" : "text-fg",
                className,
            )}
        >
            {icon && <span className="text-muted [&>svg]:size-4 [&>svg]:stroke-[1.75]">{icon}</span>}
            {children}
        </DropdownPrimitive.Item>
    )
}

export function DropdownSeparator() {
    return <DropdownPrimitive.Separator className="-mx-1.5 my-1.5 h-px bg-line" />
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
    return <DropdownPrimitive.Label className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">{children}</DropdownPrimitive.Label>
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
    return (
        <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    side={side}
                    align={align}
                    sideOffset={12}
                    collisionPadding={12}
                    className={cn(
                        "z-[60] max-h-[85vh] overflow-y-auto rounded-2xl border border-line-strong bg-surface-1 p-4 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.7),inset_0_1px_0_rgb(255_255_255/0.05)] outline-none pop-in origin-[var(--radix-popover-content-transform-origin)]",
                        className,
                    )}
                >
                    {children}
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    )
}
