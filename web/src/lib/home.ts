// Home's rows, which a device can put in its own order and hide (Settings ›
// Appearance › Home; ui.homeOrder and ui.homeHidden). The lists are named by
// their AniList status; LOCAL is what's in the library.
export const HOME_ROWS: { id: string; name: string }[] = [
    { id: "continue", name: "Continue watching" },
    { id: "reading", name: "Continue reading" },
    { id: "genres", name: "Genres" },
    { id: "CURRENT", name: "Currently watching" },
    { id: "PLANNING", name: "Planning" },
    { id: "COMPLETED", name: "Completed" },
    { id: "PAUSED", name: "Paused" },
    { id: "DROPPED", name: "Dropped" },
    { id: "LOCAL", name: "In your library" },
]

// The rows in the order chosen: the ones named first, the rest in their own
// (a row added in a later version, a setting never touched).
export function homeOrder(order: string[] | null | undefined) {
    const ids = HOME_ROWS.map(r => r.id)
    const named = (order ?? []).filter((id, i, all) => ids.includes(id) && all.indexOf(id) === i)
    return [...named, ...ids.filter(id => !named.includes(id))]
}
