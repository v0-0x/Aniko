// What's new in Kumo, newest first: shown once on each device after an
// update (components/WhatsNew). A new entry gets the next id.

export type Change = { title: string; text: string; to?: string }
export type Release = { id: number; title: string; changes: Change[] }

export const RELEASES: Release[] = [
    {
        id: 11,
        title: "Parental controls",
        changes: [
            {
                title: "Parental controls",
                text: "On the computer or Kumo Hub that shares with a device (a kid's tablet or TV), Settings › Other devices (or the hub's Devices) › Parental controls: block 18+ anime, chosen genres or titles, or allow only the anime you pick, and see everything it watched. Its Kumo hides the rest and won't open or play it, also away from home; only the computer that set them, or a PIN on the device, lifts them.",
                to: "/settings?tab=devices",
            },
        ],
    },
    {
        id: 10,
        title: "Kumo Hub",
        changes: [
            {
                title: "A hub for your home",
                text: "Kumo Hub is Kumo for a Raspberry Pi (or any Linux computer that stays on): it shares its library with your computers, TVs and phones, and keeps the devices on the same AniList account in step as you watch: stop on the TV, carry on from the same second on the computer. Its dashboard, in a browser, shows what it's streaming to whom and how the Pi is doing. To set one up, see packaging/hub/README.md on GitHub.",
            },
            {
                title: "With a hub",
                text: "Settings › Other devices shows the hub. Send it your AniList login, theme and watch history from your main device, and your other devices start where it is; your theme and player settings then stay the same on all of them. Devices you allow can download onto the hub.",
                to: "/settings?tab=devices",
            },
        ],
    },
    {
        id: 9,
        title: "Episodes in the player",
        changes: [
            {
                title: "Episodes",
                text: "The player has an Episodes button (or press E): the show's episodes in a small grid in the corner, each with its picture, number, name and how far you got, the one playing ringed in your theme's color. Pick one and it plays; on a TV, OK plays it and Back puts it away.",
            },
            {
                title: "Fullscreen",
                text: "In fullscreen the subtitles, audio and settings menus open where you can see them, and the player's buttons keep working. The next episode stays fullscreen.",
            },
        ],
    },
    {
        id: 8,
        title: "Your AniList profile",
        changes: [
            {
                title: "Profile",
                text: "Your AniList profile in Kumo: your numbers, favourites, what you're watching and what you've finished, who you follow and who follows you, and what the people you follow have been watching. Like their updates, open theirs, and follow people from their profiles. It's in the menu under your name in the sidebar.",
                to: "/profile",
            },
        ],
    },
    {
        id: 7,
        title: "Polished all over",
        changes: [
            {
                title: "On your TV",
                text: "Opening an anime starts on its Play button, and Home on your first Continue watching card. The manga reader turns pages with the remote, Back takes you up Home before it leaves Kumo, and holding OK no longer pauses and plays over and over. A remote's Stop, Previous and Captions keys work too.",
            },
            {
                title: "On a phone",
                text: "Tabs along the bottom instead of the sidebar, and pages that use the whole screen: Settings, buttons and menus fit. In the Android app, Back goes back a page instead of closing Kumo.",
            },
            {
                title: "On your computer",
                text: "Kumo's window opens where you left it, at its size, and shows that it's starting. Right-click copies and pastes, Ctrl + and − zoom (and stay that way), and the mouse's back button goes back. If Kumo can't start, it says why and offers to try again.",
            },
            {
                title: "Everywhere",
                text: "Plainer messages when something can't be reached (qBittorrent, updates, episode info), a button on empty pages for what to do next, genre rows with arrows when they don't fit, and room for four-digit episode counts.",
            },
        ],
    },
    {
        id: 6,
        title: "A new Themes menu",
        changes: [
            {
                title: "Themes, redone",
                text: "Themes in the sidebar is now a panel: each color theme shows as a small window in its colors, the holiday themes sit in a grid, and the colors fade over when you pick a new one. The arrow keys (and a TV remote) move across the grids.",
            },
        ],
    },
    {
        id: 5,
        title: "Settings, reorganized",
        changes: [
            {
                title: "Easier to find",
                text: "Settings are now in short pages under General, Watching, Finding anime, Devices & network and This computer, and there's a search box: type what you're looking for and change it right there.",
                to: "/settings",
            },
            { title: "A smoother look", text: "Kumo 2.0, calmer: flatter buttons and panels, softer shadows and corners, closer to how the classic look felt." },
        ],
    },
    {
        id: 4,
        title: "Classic look and beta updates",
        changes: [
            {
                title: "Classic look",
                text: "Liked Kumo better as it was before 2.0? Turn on Classic look in Themes in the sidebar, or in Settings › Appearance. The color and holiday themes work in both.",
                to: "/settings?tab=appearance",
            },
            {
                title: "Beta updates",
                text: "New versions now come out as betas first. Want them early? Turn on Beta updates in Settings › Updates & about; otherwise Kumo stays on the stable releases.",
                to: "/settings?tab=updates",
            },
            { title: "Smoother sidebar", text: "A cleaner Themes button, and on smaller laptop screens every link fits again." },
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
            { title: "Color themes", text: "Eight looks for Kumo, from Midnight blue to true Black for OLED screens.", to: "/settings?tab=appearance" },
            {
                title: "Holiday themes",
                text: "Kumo dresses up by itself: bats in October, snow in December, hearts in February and more. Turn them off, or keep one all year, in Settings.",
                to: "/settings?tab=appearance",
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
            { title: "Settings › Other devices", text: "All your Kumo devices with their versions, Wake buttons, and a question when a new TV shows up.", to: "/settings?tab=devices" },
            { title: "Up next and Start over", text: "A card in the ending plays the next episode; Start over (or 0) goes back to the beginning." },
            { title: "Subtitles your way", text: "Size, background and position for each device, and their timing with z and x.", to: "/settings?tab=playback" },
            { title: "Previews on the seek bar", text: "A picture of the episode where you point, or where Left and Right go on the TV." },
            { title: "Skip recaps and previews", text: "Like openings and endings, by themselves or with a button.", to: "/settings?tab=playback" },
            { title: "Missing episodes", text: "The gaps in your library and the episodes aired since, with torrents a click away.", to: "/library?tab=missing" },
            { title: "Clean up", text: "How full the drive is, episodes watched a while ago, episodes there twice, and a trash to change your mind.", to: "/library?tab=cleanup" },
            { title: "Alerts", text: "When a new episode of what you're watching airs, or an episode is ready to watch.", to: "/settings?tab=notifications" },
            { title: "What should I watch?", text: "The dice on Home picks something from your list.", to: "/" },
            { title: "Stats", text: "Your anime in numbers, and what you watched month by month.", to: "/stats" },
            { title: "Backup and restore", text: "Your settings, history, list and more as one file.", to: "/settings?tab=backup" },
        ],
    },
]
