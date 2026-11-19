import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Wrench, X } from "lucide-react"
import { useEffect } from "react"
import { Button, IconButton } from "@/components/ui"
import { api } from "@/lib/api"
import { usePersisted } from "@/lib/hooks"
import { canInstallPrograms, missingPrograms, setupWindow, useInstallPrograms, useWatchSetup } from "@/lib/programs"
import { useStatus } from "@/lib/queries"
import { useClassic } from "@/lib/themes"
import type { Status } from "@/lib/types"
import { cn } from "@/lib/utils"

const list = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`)

// The Windows setup, program by program (server/internal/winsetup): the one
// running, or the last one that ran.
export type SetupItem = { name: string; state: "waiting" | "downloading" | "unpacking" | "done" | "skipped" | "failed"; done?: number; total?: number; error?: string }
export type SetupProgress = { running: boolean; items: SetupItem[] }

// How far the Windows setup is, asked every second while it runs: Nyakuro
// downloads the programs itself there, with no window to follow.
export function useSetupProgress(status?: Status) {
    const qc = useQueryClient()
    const enabled = status?.platform === "windows" && canInstallPrograms(status)
    const started = !!status?.setupRunning
    const { data } = useQuery({
        queryKey: ["setup-programs"],
        queryFn: () => api.get<SetupProgress>("/api/setup/programs"),
        enabled,
        refetchInterval: q => (started || q.state.data?.running ? 1000 : false),
    })
    useEffect(() => {
        if (started) qc.invalidateQueries({ queryKey: ["setup-programs"] })
    }, [started, qc])
    return enabled ? data : undefined
}

// What the setup is doing ("Downloading ffmpeg… 42%").
export function setupStep(progress?: SetupProgress) {
    const it = progress?.items.find(i => i.state === "downloading" || i.state === "unpacking")
    if (!it) return "Starting…"
    if (it.state === "unpacking") return `Unpacking ${it.name}…`
    return `Downloading ${it.name}…${it.total ? ` ${Math.floor((100 * (it.done ?? 0)) / it.total)}%` : ""}`
}

// What the last setup couldn't install and why, or "".
export function setupFailures(progress?: SetupProgress) {
    const failed = progress?.running ? [] : (progress?.items ?? []).filter(i => i.state === "failed")
    return failed.length ? `Not installed: ${failed.map(i => `${i.name} (${i.error})`).join(", ")}` : ""
}

// On Windows and macOS, when the in-app player's ffmpeg or ani-cli is
// missing: a button that installs what Nyakuro uses. Hidden for good per set of
// missing programs.
export function ProgramsNotice() {
    const classic = useClassic()
    const { data: status } = useStatus()
    const [hidden, setHidden] = usePersisted("nyakuro-programs-notice-hidden", "")
    const install = useInstallPrograms(status)
    useWatchSetup(status)
    const progress = useSetupProgress(status)
    const missing = missingPrograms(status)
    const key = missing.join(",")
    const running = !!status?.setupRunning || !!progress?.running
    const failures = setupFailures(progress)
    const note = () => {
        if (status?.platform === "darwin") return running ? `Follow the ${setupWindow(status)} window.` : "Nyakuro can download them. No Homebrew or password needed."
        if (running) return setupStep(progress)
        return failures || "Nyakuro can download them. No administrator rights needed."
    }
    if (!canInstallPrograms(status) || !(missing.includes("ffmpeg") || missing.includes("ani-cli")) || hidden === key) return null
    return (
        <div className={cn("flex flex-wrap items-center gap-4 border px-5 py-4", classic ? "rounded-xl border-amber-500/25 bg-amber-500/10" : "rounded-sm border-amber-400/45")}>
            <Wrench className="size-5 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-amber-200">{running ? "Installing the programs Nyakuro uses…" : `Nyakuro needs ${list(missing)}`}</p>
                <p className="mt-0.5 text-muted">{note()}</p>
            </div>
            {!running && (
                <Button variant="primary" size="sm" icon={<Download className="size-4" />} loading={install.isPending} onClick={() => install.mutate()}>
                    {failures ? "Try again" : "Install"}
                </Button>
            )}
            <IconButton label="Hide" variant="ghost" size="sm" onClick={() => setHidden(key)}>
                <X className="size-4" />
            </IconButton>
        </div>
    )
}
