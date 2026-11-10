import { Component, type ReactNode } from "react"
import { api } from "@/lib/api"

// Catches an error while a page is drawn: without it React takes the whole
// app down and the window is black. The page says so instead, with a way
// back, and the error goes to Aniko's log (Settings › App & data › Logs) so
// a report has its cause.
export class PageError extends Component<{ children: ReactNode; full?: boolean }, { error: Error | null }> {
    state = { error: null as Error | null }

    static getDerivedStateFromError(error: Error) {
        return { error }
    }

    componentDidCatch(error: Error) {
        api.post("/api/playback/note", { path: "", text: `the page ${location.pathname}${location.search} stopped: ${error.message}` }).catch(() => {})
    }

    render() {
        const { error } = this.state
        if (!error) return this.props.children
        return (
            <div role="alert" className={this.props.full ? "grid h-full place-items-center bg-frame p-6" : "grid h-full place-items-center p-6"}>
                <div className="max-w-md text-center">
                    <p className="text-lg font-semibold">This page hit a problem</p>
                    <p className="mt-2 text-sm text-muted">Aniko couldn't show it. Your library and settings are fine. Reloading usually brings it back; if it keeps happening, send what's below.</p>
                    <p className="mt-3 rounded-lg bg-white/[0.05] px-3 py-2 font-mono text-xs break-words text-muted">{error.message}</p>
                    <div className="mt-5 flex justify-center gap-2">
                        <button onClick={() => location.reload()} className="focus-ring h-9 rounded-lg bg-white px-4 text-sm font-semibold text-black hover:bg-white/90">
                            Reload
                        </button>
                        <a href="/" className="focus-ring inline-flex h-9 items-center rounded-lg bg-white/10 px-4 text-sm font-medium hover:bg-white/15">
                            Go to Home
                        </a>
                    </div>
                </div>
            </div>
        )
    }
}
