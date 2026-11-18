import { Component, type ReactNode } from "react"

// What a plugin draws comes from the plugin as it is: when drawing it fails,
// nothing shows in its place, and the page (the whole app, for the sidebar's
// trays) stays up. Tried again when resetKey changes (the plugin's new state).
export class PluginBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, { failed: boolean; resetKey: unknown }> {
    state = { failed: false, resetKey: this.props.resetKey }

    static getDerivedStateFromError() {
        return { failed: true }
    }

    static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { resetKey: unknown }) {
        return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey }
    }

    render() {
        return this.state.failed ? null : this.props.children
    }
}
