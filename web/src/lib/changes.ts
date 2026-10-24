// What's new in Kumo, newest first: shown once on each device after an
// update (components/WhatsNew). A new entry gets the next id.

export type Change = { title: string; text: string; to?: string }
export type Release = { id: number; title: string; changes: Change[] }

export const RELEASES: Release[] = [
    {
        id: 4,
        title: "The classic look",
        changes: [
            {
                title: "Classic look",
                text: "Liked Kumo better as it was before 2.0? Turn on Classic look in Themes in the sidebar, or in Settings › User Interface. The color and holiday themes work in both.",
                to: "/settings?tab=ui",
            },
        ],
    },
    {
        id: 3,
        title: "Kumo 2.0",
        changes: [
            { title: "A cleaner look", text: "The same Kumo, tidied up: the sidebar in sections, softer panels and cards, nicer dialogs, menus and buttons." },
            { title: "Themes in the sidebar", text: "Every color theme and holiday theme a click away: try one after another, the menu stays open." },
            {
                title: "Holiday themes, redone",
                text: "Each holiday brings its own colors and decorations (Christmas lights, Halloween's moon and cobweb, a cherry branch, summer lanterns) and nicer snow, bats, hearts, petals, fireflies and fireworks.",
            },
            {
                title: "Fixes",
                text: "Alerts for a season's last episode, and for torrents once they're done downloading; Clean up never takes the only copy of an episode; the desktop app follows Kumo to a new port; and more.",
            },
        ],
    },
    {
        id: 2,
        title: "Themes, picture in picture and more",
        changes: [
            { title: "Color themes", text: "Eight looks for Kumo, from Midnight blue to true Black for OLED screens.", to: "/settings?tab=ui" },
            {
                title: "Holiday themes",
                text: "Kumo dresses up by itself: bats in October, snow in December, hearts in February and more. Turn them off, or keep one all year, in Settings.",
                to: "/settings?tab=ui",
            },
            { title: "Picture in picture", text: "In the desktop app, an episode goes on in a small window on top of the others: p, or the button next to Fullscreen." },
            { title: "Movies, OVAs and specials", text: "Local library shows only TV series, movies, or OVAs, ONAs and specials when you like.", to: "/local" },
        ],
    },
    {
        id: 1,
        title: "Devices, the player and your library",
        changes: [
            { title: "Wake your computer from the TV", text: "When the computer with your anime is asleep, Home on the TV has a button to wake it (with Wake-on-LAN on in its settings).", to: "/settings?tab=devices" },
            { title: "Stays awake while the TV plays", text: "The computer doesn't go to sleep while another device plays its anime." },
            { title: "Syncs by itself", text: "Continue watching catches up when the TV app opens or a device comes back on the network.", to: "/settings?tab=devices" },
            { title: "Settings › Devices", text: "All your Kumo devices with their versions, Wake buttons, and a question when a new TV shows up.", to: "/settings?tab=devices" },
            { title: "Up next and Start over", text: "A card in the ending plays the next episode; Start over (or 0) goes back to the beginning." },
            { title: "Subtitles your way", text: "Size, background and position for each device, and their timing with z and x.", to: "/settings?tab=playback" },
            { title: "Previews on the seek bar", text: "A picture of the episode where you point, or where Left and Right go on the TV." },
            { title: "Skip recaps and previews", text: "Like openings and endings, by themselves or with a button.", to: "/settings?tab=playback" },
            { title: "Missing episodes", text: "The gaps in your library and the episodes aired since, with torrents a click away.", to: "/library?tab=missing" },
            { title: "Clean up", text: "How full the drive is, episodes watched a while ago, episodes there twice, and a trash to change your mind.", to: "/library?tab=cleanup" },
            { title: "Alerts", text: "When a new episode of what you're watching airs, or an episode is ready to watch.", to: "/settings?tab=app" },
            { title: "What should I watch?", text: "The dice on Home picks something from your list.", to: "/" },
            { title: "Stats", text: "Your anime in numbers, and what you watched month by month.", to: "/stats" },
            { title: "Backup and restore", text: "Your settings, history, list and more as one file.", to: "/settings?tab=app" },
        ],
    },
]
