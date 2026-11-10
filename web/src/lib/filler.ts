// Filler and recap episodes, as MyAnimeList marks them (GET /api/anime/{id}/filler).
export type Filler = { filler: number[]; recap: number[] }

// The first fact on an episode's card: "Filler" or "Recap" (or nothing).
export function fillerFact(episode: number, f: Filler | undefined): string | undefined {
    if (f?.filler.includes(episode)) return "Filler"
    if (f?.recap.includes(episode)) return "Recap"
    return undefined
}

// The next episode after `after` (in `episodes`, any order) that isn't
// filler: undefined when there's none.
export function nextNonFiller(after: number, episodes: number[], filler: number[]): number | undefined {
    const skip = new Set(filler)
    let next: number | undefined
    for (const n of episodes) {
        if (n > after && !skip.has(n) && (next === undefined || n < next)) next = n
    }
    return next
}
