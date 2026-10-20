// What's new in Kumo, newest first: shown once on each device after an
// update (components/WhatsNew). A new entry gets the next id.

export type Change = { title: string; text: string; to?: string }
export type Release = { id: number; title: string; changes: Change[] }

export const RELEASES: Release[] = [
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
