import { useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Heart, LogIn, MessageSquareText, RefreshCw, UserCheck, UserPlus, UsersRound } from "lucide-react"
import { useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { LoginDialog } from "@/components/LoginDialog"
import { MediaCard, MediaGrid } from "@/components/MediaCard"
import { Button, EmptyState, ErrorState, IconButton, Skeleton, Tabs } from "@/components/ui"
import { api } from "@/lib/api"
import { useMediaQuery } from "@/lib/hooks"
import { useActivity, useCollection, useProfile, useStatus } from "@/lib/queries"
import { toast } from "@/lib/toast"
import { focusEl, tv } from "@/lib/tv"
import type { Activity, CollectionItem, Profile, UserLite } from "@/lib/types"
import { cn, cover, entryUrl, img, relativeTime, title } from "@/lib/utils"

// An AniList profile: the logged-in user's (/profile), or another's
// (/profile?user=Name). Its numbers, what the people followed have been
// watching (or what this user has), favourites and who they follow.
export default function ProfilePage() {
    const [params, setParams] = useSearchParams()
    const user = params.get("user") ?? ""
    const { data: status } = useStatus()
    const loggedIn = !!status?.loggedIn
    const { data: profile, error, isLoading, refetch, isFetching } = useProfile(user, loggedIn)
    const qc = useQueryClient()
    const [loginOpen, setLoginOpen] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    // A phone's width fits the four tabs without their counts (the header
    // has them).
    const narrow = useMediaQuery("(max-width: 639px)")
    const tab = (params.get("tab") as Tab) || "activity"
    const setTab = (t: Tab) =>
        setParams(
            p => {
                p.set("tab", t)
                return p
            },
            { replace: true },
        )
    // Asked again from AniList (the server forgets what it kept), the
    // feeds too.
    const refresh = async () => {
        setRefreshing(true)
        try {
            await api.get(`/api/anilist/profile?refresh=1${user ? `&user=${encodeURIComponent(user)}` : ""}`)
            await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ["activity"] })])
        } catch (e) {
            toast.error((e as Error).message)
        } finally {
            setRefreshing(false)
        }
    }

    if (status && !loggedIn)
        return (
            <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
                <h1 className="mb-8 text-[1.75rem] font-semibold tracking-tight">Profile</h1>
                <EmptyState
                    icon={<UsersRound className="size-6" />}
                    title="Log in with AniList"
                    action={
                        <Button variant="primary" icon={<LogIn className="size-4" />} onClick={() => setLoginOpen(true)}>
                            Log in
                        </Button>
                    }
                />
                <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
            </div>
        )
    if (error && !profile)
        return (
            <div className="min-h-full px-6 pt-8 pb-24 md:px-8 xl:px-10">
                <ErrorState title={user ? `Couldn't load ${user}'s profile` : "Couldn't load your profile"} error={error} retrying={isFetching} onRetry={() => refetch()} />
            </div>
        )
    if (isLoading || !profile)
        return (
            <div className="flex min-h-full flex-col gap-8 px-6 pt-24 pb-24 md:px-8 xl:px-10">
                <Skeleton className="h-40 rounded-3xl" />
                <Skeleton className="h-10" />
                <Skeleton className="h-64" />
            </div>
        )

    return (
        // Keyed by who: another profile starts at its top, on its own tabs.
        <div key={profile.id} className="min-h-full pb-24">
            <Header profile={profile} onTab={setTab} onRefresh={refresh} refreshing={refreshing} />
            <div className="relative z-10 flex flex-col gap-8 px-6 pt-8 md:px-8 xl:px-10">
                <Tabs
                    variant="underline"
                    value={tab}
                    onChange={setTab}
                    tabs={[
                        { value: "activity", label: "Activity" },
                        { value: "favourites", label: "Favourites" },
                        { value: "following", label: "Following", count: narrow ? undefined : countText(profile.followingCount, profile.followingMore) },
                        { value: "followers", label: "Followers", count: narrow ? undefined : countText(profile.followersCount, profile.followersMore) },
                    ]}
                />
                {tab === "activity" && <ActivityTab profile={profile} />}
                {tab === "favourites" && <Favourites profile={profile} />}
                {(tab === "following" || tab === "followers") && <People profile={profile} kind={tab} onRetry={refresh} retrying={refreshing} />}
            </div>
        </div>
    )
}

type Tab = "activity" | "favourites" | "following" | "followers"

// "50+" when AniList gave no total past the first page; nothing when it
// didn't say at all.
function countText(n: number | null, more?: boolean) {
    return n === null ? undefined : `${n.toLocaleString()}${more ? "+" : ""}`
}

// The person on one glass panel over their banner (theirs, else a wash in
// their profile color): the avatar and name, a line of totals (following
// and followers open those tabs), since when, and the page's actions.
function Header({ profile, onTab, onRefresh, refreshing }: { profile: Profile; onTab: (t: Tab) => void; onRefresh: () => void; refreshing: boolean }) {
    const qc = useQueryClient()
    const [following, setFollowing] = useState(profile.isFollowing)
    const [busy, setBusy] = useState(false)
    const color = COLORS[profile.options?.profileColor] ?? profile.options?.profileColor ?? "var(--brand)"
    const follow = async () => {
        setBusy(true)
        try {
            const r = await api.post<{ isFollowing: boolean }>(`/api/anilist/follow/${profile.id}`)
            setFollowing(r.isFollowing)
            toast.success(r.isFollowing ? `Following ${profile.name}` : `Stopped following ${profile.name}`)
            qc.invalidateQueries({ queryKey: ["profile"] })
            qc.invalidateQueries({ queryKey: ["activity"] })
        } catch (e) {
            toast.error((e as Error).message)
        } finally {
            setBusy(false)
        }
    }
    const since = profile.createdAt ? new Date(profile.createdAt * 1000).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : ""
    const a = profile.statistics.anime
    const m = profile.statistics.manga
    const days = a.minutesWatched / 1440
    const num = (value: string, label: string) => (
        <span>
            <b className="font-semibold text-white tabular-nums">{value}</b> {label}
        </span>
    )
    const tab = (t: Tab, value: string, label: string) => (
        <button onClick={() => onTab(t)} className="focus-ring -mx-1 rounded px-1 transition-colors hover:text-white">
            {num(value, label)}
        </button>
    )
    const totals = [
        profile.followingCount !== null && tab("following", countText(profile.followingCount, profile.followingMore)!, "following"),
        profile.followersCount !== null && tab("followers", countText(profile.followersCount, profile.followersMore)!, profile.followersCount === 1 && !profile.followersMore ? "follower" : "followers"),
        num(a.count.toLocaleString(), "anime"),
        num(a.episodesWatched.toLocaleString(), "episodes"),
        num(days >= 10 ? Math.round(days).toLocaleString() : days.toFixed(1), "days watched"),
        num(a.meanScore ? `${Math.round(a.meanScore)}%` : "–", "mean score"),
        m.chaptersRead > 0 && num(m.chaptersRead.toLocaleString(), "chapters read"),
    ].filter(Boolean)
    return (
        <div className="relative">
            <div className="absolute inset-x-0 top-0 h-80 overflow-hidden">
                {profile.bannerImage ? (
                    <img src={img(profile.bannerImage)} alt="" className="size-full object-cover opacity-80 fade-in [mask-image:linear-gradient(to_bottom,#000_80%,transparent)]" />
                ) : (
                    <div className="size-full" style={{ background: `radial-gradient(900px 260px at 20% 0%, color-mix(in oklab, ${color} 35%, transparent), transparent)` }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-bg/10" />
            </div>
            <div className="relative z-10 px-6 pt-24 md:px-8 md:pt-28 xl:px-10">
                <div className={cn("flex flex-col gap-5 rounded-3xl border border-white/10 bg-black/35 p-5 shadow-[0_24px_60px_-28px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.08)] md:p-6", !tv && "backdrop-blur-2xl")}>
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-4 md:gap-6">
                        <img src={img(profile.avatar?.large)} alt="" className="size-20 shrink-0 rounded-2xl object-cover shadow-2xl shadow-black/60 ring-1 ring-white/10 md:size-28" />
                        <div className="min-w-0 flex-1">
                            <h1 className="truncate text-3xl leading-tight font-semibold tracking-tight text-white md:text-[2.5rem]">{profile.name}</h1>
                            {(since || (!profile.own && profile.isFollower)) && (
                                <p className="mt-1 truncate text-sm text-white/55">{[since && `On AniList since ${since}`, !profile.own && profile.isFollower && "Follows you"].filter(Boolean).join(" · ")}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {!profile.own && (
                            <Button variant={following ? "subtle" : "primary"} loading={busy} icon={following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />} onClick={follow}>
                                {following ? "Following" : "Follow"}
                            </Button>
                        )}
                        <IconButton label="Refresh" variant="subtle" loading={refreshing} onClick={onRefresh}>
                            {!refreshing && <RefreshCw className="size-4" />}
                        </IconButton>
                        {/* A TV has no browser to open it in. */}
                        {!tv && (
                            <IconButton label="Open on AniList" variant="subtle" onClick={() => window.open(profile.siteUrl, "_blank", "noopener")}>
                                <ExternalLink className="size-4" />
                            </IconButton>
                        )}
                    </div>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/70">
                        {totals.map((el, k) => (
                            <span key={k} className="flex items-center gap-2">
                                {k > 0 && <span className="text-white/25">·</span>}
                                {el}
                            </span>
                        ))}
                    </p>
                </div>
            </div>
        </div>
    )
}

// AniList's named profile colors.
const COLORS: Record<string, string> = { blue: "#3db4f2", purple: "#c063ff", pink: "#fc9dd6", orange: "#ef881a", red: "#e13333", green: "#4cca51", gray: "#677b94" }

// What the people followed have been watching, or this user's own; beside
// it (wide windows), what's being watched now and the top genres.
function ActivityTab({ profile }: { profile: Profile }) {
    const [params, setParams] = useSearchParams()
    const feed: "following" | "user" = profile.own && params.get("feed") !== "you" ? "following" : "user"
    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0">
                {profile.own && (
                    <Tabs
                        className="mb-5"
                        value={feed === "following" ? "following" : "you"}
                        onChange={v =>
                            setParams(
                                p => {
                                    p.set("feed", v)
                                    return p
                                },
                                { replace: true },
                            )
                        }
                        tabs={[
                            { value: "following", label: "People you follow" },
                            { value: "you", label: "You" },
                        ]}
                    />
                )}
                <Feed feed={feed} profile={profile} />
            </div>
            <aside className="flex min-w-0 flex-col gap-8">
                {profile.own && <WatchingNow />}
                {profile.own && <Completed />}
                <TopGenres profile={profile} />
            </aside>
        </div>
    )
}

function Feed({ feed, profile }: { feed: "following" | "user"; profile: Profile }) {
    const { data, error, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isFetching } = useActivity(feed, profile.id)
    const items = data?.pages.flatMap(p => p.items) ?? []
    const list = useRef<HTMLDivElement>(null)
    // On a TV the remote goes on at the first new entry (the button may be
    // gone: the last page), not back at the top.
    const more = async () => {
        const before = items.length
        await fetchNextPage()
        if (!tv) return
        requestAnimationFrame(() => {
            const next = list.current?.children[before]?.querySelector<HTMLElement>("a[href], button")
            if (next) focusEl(next)
        })
    }
    if (isLoading)
        return (
            <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-[4.5rem]" />
                ))}
            </div>
        )
    if (error && !data) return <ErrorState title="Couldn't load the activity" error={error} retrying={isFetching} onRetry={() => refetch()} />
    if (items.length === 0)
        return (
            <EmptyState icon={<UsersRound className="size-6" />} title="Nothing here yet">
                {feed === "following" ? "Follow people on AniList." : undefined}
            </EmptyState>
        )
    return (
        // A TV's remote starts on the first one (lib/pages).
        <div ref={list} className="flex flex-col gap-2" data-tv-autofocus>
            {items.map(a => (
                <ActivityRow key={a.id} activity={a} showUser={feed === "following"} />
            ))}
            {hasNextPage && (
                <Button className="self-center" loading={isFetchingNextPage} onClick={more}>
                    Show more
                </Button>
            )}
        </div>
    )
}

// One entry: who, what (watched episode 5 of…, a post), when; a like, and
// the replies (on AniList).
function ActivityRow({ activity: a, showUser }: { activity: Activity; showUser: boolean }) {
    const [liked, setLiked] = useState(a.isLiked)
    const [likes, setLikes] = useState(a.likeCount)
    const [expanded, setExpanded] = useState(false)
    const like = async () => {
        // At once, and put back if AniList says no.
        setLiked(!liked)
        setLikes(likes + (liked ? -1 : 1))
        try {
            const r = await api.post<{ likeCount: number; isLiked: boolean }>(`/api/anilist/activity/${a.id}/like`)
            setLiked(r.isLiked)
            setLikes(r.likeCount)
        } catch (e) {
            setLiked(liked)
            setLikes(likes)
            toast.error((e as Error).message)
        }
    }
    const text = a.kind === "text" ? plainText(a.text ?? "") : ""
    const replies = `${a.replyCount} ${a.replyCount === 1 ? "reply" : "replies"}`
    return (
        <div className="card flex items-center gap-3.5 p-3">
            {a.media ? (
                <Link to={entryUrl(a.media)} className="focus-ring shrink-0 rounded-lg" aria-label={title(a.media)}>
                    <img src={cover(a.media, "thumb")} alt="" loading="lazy" className="h-16 w-11 rounded-lg object-cover" />
                </Link>
            ) : showUser ? (
                <Link to={`/profile?user=${encodeURIComponent(a.user.name)}`} className="focus-ring shrink-0 self-start rounded-full" aria-label={a.user.name}>
                    <img src={img(a.user.avatar?.medium)} alt="" loading="lazy" className="size-11 rounded-full object-cover" />
                </Link>
            ) : (
                <span className="flex size-11 shrink-0 items-center justify-center self-start rounded-full bg-white/[0.06] text-muted">
                    <MessageSquareText className="size-[18px]" />
                </span>
            )}
            <div className="min-w-0 flex-1">
                {a.kind === "list" && a.media ? (
                    <p className="line-clamp-2 leading-snug text-fg/85">
                        {sentence(a)}{" "}
                        <Link to={entryUrl(a.media)} className="font-medium text-fg hover:underline" tabIndex={-1}>
                            {title(a.media)}
                        </Link>
                    </p>
                ) : (
                    <>
                        <p className={cn("text-[14.5px] leading-relaxed break-words whitespace-pre-line text-fg/85", !expanded && "line-clamp-6")}>{text}</p>
                        {text.length > 400 && (
                            <button onClick={() => setExpanded(e => !e)} className="focus-ring mt-1 rounded text-sm font-medium text-muted hover:text-fg">
                                {expanded ? "Show less" : "Read more"}
                            </button>
                        )}
                    </>
                )}
                {/* Who, when and the replies (on AniList), on one line. */}
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-muted">
                    {showUser && (
                        <>
                            {a.media && <img src={img(a.user.avatar?.medium)} alt="" loading="lazy" className="size-4 shrink-0 rounded-full object-cover" />}
                            <Link to={`/profile?user=${encodeURIComponent(a.user.name)}`} className="truncate hover:text-fg hover:underline" tabIndex={a.media ? -1 : undefined}>
                                {a.user.name}
                            </Link>
                            <span className="text-subtle">·</span>
                        </>
                    )}
                    <span className="shrink-0">{relativeTime(a.createdAt)}</span>
                    {a.replyCount > 0 && (
                        <>
                            <span className="text-subtle">·</span>
                            {tv ? (
                                <span className="shrink-0">{replies}</span>
                            ) : (
                                <a href={a.siteUrl} target="_blank" rel="noopener noreferrer" className="focus-ring shrink-0 rounded hover:text-fg hover:underline" title="Replies, on AniList">
                                    {replies}
                                </a>
                            )}
                        </>
                    )}
                </p>
            </div>
            <button
                onClick={like}
                aria-pressed={liked}
                aria-label={liked ? "Unlike" : "Like"}
                className={cn("focus-ring flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] tabular-nums transition-colors hover:bg-white/[0.07]", liked ? "text-fg" : "text-muted")}
            >
                <Heart className={cn("size-4", liked && "fill-current")} />
                {likes > 0 && likes}
            </button>
        </div>
    )
}

// "Watched episode 5 of", "Completed", "Plans to watch"… as AniList says it.
function sentence(a: Activity) {
    const s = (a.status ?? "").trim()
    const head = s.charAt(0).toUpperCase() + s.slice(1)
    return a.progress ? `${head} ${a.progress} of` : head
}

// A post's text without AniList's markup: its pictures and videos named,
// spoilers hidden, links and emphasis as plain words.
export function plainText(s: string) {
    return s
        .replace(/~!([\s\S]*?)!~/g, "(spoiler)")
        .replace(/img\d*%?\s*\(([^)]*)\)/gi, "(picture)")
        .replace(/(youtube|webm)\s*\(([^)]*)\)/gi, "(video)")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "(picture)")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/~~~/g, "")
        .replace(/(\*\*|__)(.+?)\1/g, "$2")
        .replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$)/g, "$1$2")
        .replace(/^#+\s*/gm, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

// The anime being watched, most recently updated first (the logged-in
// user's own list, as Aniko has it).
function WatchingNow() {
    const { data } = useCollection()
    const items = (data?.lists ?? [])
        .filter(l => l.status === "CURRENT" || l.status === "REPEATING")
        .flatMap(l => l.items)
        .sort((x, y) => (y.listEntry?.updatedAt ?? 0) - (x.listEntry?.updatedAt ?? 0))
        .slice(0, 6)
    if (!items.length) return null
    return (
        <section>
            <h2 className="mb-3 text-xl font-semibold tracking-tight">Watching now</h2>
            <div className="flex flex-col gap-1">
                {items.map(it => {
                    const total = it.media.episodes ?? 0
                    const progress = it.listEntry?.progress ?? 0
                    return (
                        <Link key={it.media.id} to={entryUrl(it.media)} className="focus-ring flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-white/[0.05]">
                            <img src={cover(it.media, "thumb")} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13.5px] font-medium">{title(it.media)}</p>
                                <p className="text-xs text-muted tabular-nums">
                                    Episode {progress}
                                    {total ? ` of ${total}` : ""}
                                </p>
                                {total > 0 && (
                                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                                        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (progress / total) * 100)}%` }} />
                                    </div>
                                )}
                            </div>
                        </Link>
                    )
                })}
            </div>
        </section>
    )
}

// The anime finished most recently (the date on AniList, else when the
// entry last changed), with the score given; See all opens the list.
function Completed() {
    const { data } = useCollection()
    const seen = new Set<number>()
    const all = (data?.lists ?? [])
        .filter(l => l.status === "COMPLETED")
        .flatMap(l => l.items)
        .filter(it => !seen.has(it.media.id) && !!seen.add(it.media.id))
    if (!all.length) return null
    const items = all.sort((x, y) => finished(y) - finished(x)).slice(0, 6)
    return (
        <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight">
                    Completed <span className="ml-1 text-sm font-normal tracking-normal text-subtle tabular-nums">{all.length.toLocaleString()}</span>
                </h2>
                <Link to="/lists?status=COMPLETED" className="focus-ring rounded px-1 text-[13px] text-muted transition-colors hover:text-fg">
                    See all
                </Link>
            </div>
            <div className="flex flex-col gap-1">
                {items.map(it => {
                    const score = it.listEntry?.score ?? 0
                    const d = it.listEntry?.completedAt
                    const when = d?.year ? new Date(d.year, (d.month ?? 1) - 1, d.day ?? 1).toLocaleDateString(undefined, d.month ? { month: "short", year: "numeric" } : { year: "numeric" }) : ""
                    const eps = it.media.episodes ? `${it.media.episodes} episode${it.media.episodes === 1 ? "" : "s"}` : ""
                    return (
                        <Link key={it.media.id} to={entryUrl(it.media)} className="focus-ring flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-white/[0.05]">
                            <img src={cover(it.media, "thumb")} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13.5px] font-medium">{title(it.media)}</p>
                                <p className="truncate text-xs text-muted tabular-nums">{[when && `Finished ${when}`, eps, score > 0 && `Scored ${(score / 10).toFixed(score % 10 ? 1 : 0)}`].filter(Boolean).join(" · ") || "Completed"}</p>
                            </div>
                        </Link>
                    )
                })}
            </div>
        </section>
    )
}

// When an entry was finished, in seconds: AniList's date, else when it last
// changed.
function finished(it: CollectionItem) {
    const d = it.listEntry?.completedAt
    return d?.year ? Date.UTC(d.year, (d.month ?? 1) - 1, d.day ?? 1) / 1000 : (it.listEntry?.updatedAt ?? 0)
}

function TopGenres({ profile }: { profile: Profile }) {
    const genres = profile.statistics.anime.genres ?? []
    if (!genres.length) return null
    const top = Math.max(...genres.map(g => g.count))
    return (
        <section>
            <h2 className="mb-3 text-xl font-semibold tracking-tight">Top genres</h2>
            <div className="flex flex-col gap-2">
                {genres.map(g => (
                    <Link key={g.genre} to={`/search?genre=${encodeURIComponent(g.genre)}`} className="group/g focus-ring flex items-center gap-3 rounded-md text-[13px]">
                        <span className="w-24 shrink-0 truncate text-muted group-hover/g:text-fg">{g.genre}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                            <span className="block h-full rounded-full bg-brand/80" style={{ width: `${(g.count / top) * 100}%` }} />
                        </span>
                        <span className="w-8 shrink-0 text-right text-muted tabular-nums">{g.count}</span>
                    </Link>
                ))}
            </div>
        </section>
    )
}

function Favourites({ profile }: { profile: Profile }) {
    const f = profile.favourites
    if (!f.anime.length && !f.manga.length && !f.characters.length)
        return (
            <EmptyState icon={<Heart className="size-6" />} title="No favourites yet">
                {profile.own ? "Add them on AniList." : undefined}
            </EmptyState>
        )
    return (
        <div className="flex flex-col gap-10">
            {f.anime.length > 0 && (
                <section>
                    <h2 className="mb-4 text-xl font-semibold tracking-tight">Anime</h2>
                    <MediaGrid start>
                        {f.anime.map(m => (
                            <MediaCard key={m.id} media={m} showProgress={false} />
                        ))}
                    </MediaGrid>
                </section>
            )}
            {f.manga.length > 0 && (
                <section>
                    <h2 className="mb-4 text-xl font-semibold tracking-tight">Manga</h2>
                    <MediaGrid>
                        {f.manga.map(m => (
                            <MediaCard key={m.id} media={m} showProgress={false} />
                        ))}
                    </MediaGrid>
                </section>
            )}
            {f.characters.length > 0 && (
                <section>
                    <h2 className="mb-4 text-xl font-semibold tracking-tight">Characters</h2>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-x-4 gap-y-5">
                        {f.characters.map(c => {
                            const body = (
                                <>
                                    <img src={img(c.image?.large)} alt="" loading="lazy" className="aspect-square w-full rounded-full object-cover ring-1 ring-white/10" />
                                    <span className="line-clamp-2 text-center text-[13px]">{c.name.full}</span>
                                </>
                            )
                            // Characters have no page in Aniko: AniList's (not on a TV).
                            return tv ? (
                                <div key={c.id} className="flex flex-col items-center gap-2">
                                    {body}
                                </div>
                            ) : (
                                <a key={c.id} href={c.siteUrl} target="_blank" rel="noopener noreferrer" className="focus-ring flex flex-col items-center gap-2 rounded-lg transition-opacity hover:opacity-85">
                                    {body}
                                </a>
                            )
                        })}
                    </div>
                </section>
            )}
        </div>
    )
}

// Who they follow, or who follows them: the first 50 by name, and the
// rest on AniList.
function People({ profile, kind, onRetry, retrying }: { profile: Profile; kind: "following" | "followers"; onRetry: () => void; retrying: boolean }) {
    if (profile.followsError) {
        const title = kind === "following" ? (profile.own ? "Couldn't load who you follow" : `Couldn't load who ${profile.name} follows`) : profile.own ? "Couldn't load your followers" : `Couldn't load ${profile.name}'s followers`
        return <ErrorState title={title} error={new Error(profile.followsError)} retrying={retrying} onRetry={onRetry} />
    }
    const users = kind === "following" ? profile.following : profile.followers
    const count = (kind === "following" ? profile.followingCount : profile.followersCount) ?? users.length
    const more = kind === "following" ? profile.followingMore : profile.followersMore
    if (!users.length)
        return (
            <EmptyState icon={<UsersRound className="size-6" />} title={kind === "following" ? "Not following anyone yet" : "No followers yet"} />
        )
    const rest = more ? 0 : count - users.length
    return (
        <div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-4 gap-y-6" data-tv-autofocus>
                {users.map(u => (
                    <UserTile key={u.id} user={u} />
                ))}
            </div>
            {(rest > 0 || more) && (
                <p className="mt-6 text-sm text-muted">
                    {rest > 0 ? `And ${rest.toLocaleString()} more` : "And more"}
                    {!tv && (
                        <>
                            {" "}
                            <a href={`${profile.siteUrl}/${kind}`} target="_blank" rel="noopener noreferrer" className="focus-ring rounded text-fg/85 underline-offset-2 hover:underline">
                                on AniList
                            </a>
                        </>
                    )}
                    .
                </p>
            )}
        </div>
    )
}

function UserTile({ user }: { user: UserLite }) {
    return (
        <Link to={`/profile?user=${encodeURIComponent(user.name)}`} className="group/u focus-ring flex flex-col items-center gap-2 rounded-xl p-1">
            <img src={img(user.avatar?.large || user.avatar?.medium)} alt="" loading="lazy" className="aspect-square w-full rounded-2xl object-cover ring-1 ring-white/10 transition-transform duration-200 group-hover/u:-translate-y-0.5" />
            <span className="w-full truncate text-center text-[13px] font-medium">{user.name}</span>
        </Link>
    )
}
