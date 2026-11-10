// What's new in Aniko, newest first: shown once on each device after an
// update (components/WhatsNew). A new entry gets the next id.

export type Change = { title: string; text: string; to?: string }
// hub: about Aniko Hub; shown only on a device that knows a hub.
export type Release = { id: number; title: string; changes: Change[]; hub?: boolean }

export const RELEASES: Release[] = [
    {
        id: 46,
        title: "Aniko 3.0",
        changes: [
            {
                title: "Home starts with your next episode",
                text: "The Home banner shows your next episode, with Resume and Details.",
                to: "/",
            },
            {
                title: "A new look for the player",
                text: "The controls float over the picture, and menus show a check on the choice in use.",
            },
            {
                title: "Settings in ten pages",
                text: "Eighteen pages became ten, with every setting still there.",
                to: "/settings",
            },
            {
                title: "Your server, from the app",
                text: "With mediaserver 2.0.3 or newer, a Server page shows its status, load and drive space.",
                to: "/server",
            },
            {
                title: "Faster to open",
                text: "Aniko loads less than half as much at startup.",
            },
        ],
    },
    {
        id: 45,
        title: "Manga on your server, and Continue watching arrows",
        changes: [
            {
                title: "Read the manga on mediaserver",
                text: "Manga › Downloaded shows the manga downloaded onto mediaserver (or another computer that shares with this one), under its name, and a manga's page lists the chapters there: they open in the reader from the server. Needs mediaserver 1.0.29 or newer.",
                to: "/manga",
            },
            {
                title: "Arrows on Continue watching",
                text: "On a computer, round arrows on the Continue watching row scroll it, as many cards at a time as fit.",
            },
        ],
    },
    {
        id: 44,
        title: "When your lists were last in step",
        changes: [
            {
                title: "Shown in Settings",
                text: "Under \"Same list and watch order on all my devices\", Settings › Other devices says when your lists were last in step with mediaserver. And when an episode starts somewhere other than where it should (resume), the app notes both times in its log, so a report says why.",
                to: "/settings?tab=devices",
            },
        ],
    },
    {
        id: 43,
        title: "Image subtitles after a seek",
        changes: [
            {
                title: "A line already on screen is drawn too",
                text: "Seeking into the middle of an image subtitle (PGS, VobSub) now shows it from there, instead of nothing until the next line.",
            },
        ],
    },
    {
        id: 42,
        title: "Fixes",
        changes: [
            {
                title: "The Marketplace opens at once",
                text: "It no longer waits for every plugin's details before showing the list: the \"Needs …\" badges come in a moment later.",
            },
            {
                title: "Image subtitles from an older computer",
                text: "When the computer or server a file is on is too old to draw its image subtitles, the track says it needs that one updated, instead of playing without them.",
            },
            {
                title: "Lists kept in step: one send for many changes",
                text: "Changes made close together (removing several anime) go to the server as one, a couple of seconds after the last.",
            },
        ],
    },
    {
        id: 41,
        title: "Lists and watch order on all your devices",
        changes: [
            {
                title: "Kept in step through mediaserver (experimental)",
                text: "Your watch-order edits, and the list of a device that isn't logged into AniList, now follow you between your devices through mediaserver: an anime added or removed on one, an order fixed on one, shows on the others. The devices on no AniList account share one list through the server. Experimental: Settings › Other devices turns it off, and the lists then stay as they are on each device.",
                to: "/settings?tab=devices",
            },
        ],
    },
    {
        id: 40,
        title: "Torrents streamed on the TV",
        changes: [
            {
                title: "Stream, through the computer your downloads go to",
                text: "On a TV, a torrent in the Torrents tab can be streamed: the computer that takes the TV's downloads (Settings › Other devices, \"Let it download here\") plays it as it downloads and the TV reads it from there, like a shared file. Only that TV can read it, and it stops when the TV stops it. Not with parental controls, on either side.",
            },
        ],
    },
    {
        id: 39,
        title: "Image subtitles in the in-app player",
        changes: [
            {
                title: "PGS and VobSub subtitles, drawn on by the server",
                text: "Image subtitles (Blu-ray PGS, DVD VobSub) can be picked in the player now: the computer the file is on draws them onto the video and converts it, so they show here, on the TV and on a phone. Converting costs that computer some work.",
            },
            {
                title: "Sound in step after a seek",
                text: "A converted video with copied sound started a few seconds early after a seek (the sound from the keyframe before it), and its time was off by that much. The sound is converted with the video now.",
            },
        ],
    },
    {
        id: 38,
        title: "Small fixes",
        changes: [
            {
                title: "Anime still being looked up are said so",
                text: "When AniList hasn't said yet what some anime in your library are, Home and Local library say how many are still being looked up; they come in by themselves.",
            },
            {
                title: "The portable Windows build updates itself",
                text: "Update on the Home page downloads the new portable zip, puts it in place once Aniko has closed, and opens Aniko again. Nothing is installed.",
            },
            {
                title: "Report wrong order",
                text: "Editing a watch order has a Report wrong order button: it keeps Aniko's order and your edit as a file, to send along with a bug report so the order can be put right for everyone.",
            },
            {
                title: "Marketplace: what a plugin needs",
                text: "A plugin that asks for permissions Aniko doesn't have (Seanime's playback, system…) is marked in the Marketplace: what it does with them won't work here.",
                to: "/extensions",
            },
            {
                title: "Built from a source zip, with its version",
                text: "An Arch package built from a downloaded source zip (no git) gets its version from the folder's name or the newest release, instead of 1.0.0.",
            },
        ],
    },
    {
        id: 37,
        title: "Downloads go to the folder you pick",
        changes: [
            {
                title: "A library folder for new downloads",
                text: "With more than one library folder, Settings › Library › Downloads go to picks the one new anime are downloaded into (streams and torrents alike). An anime that already has a folder, in any library folder, keeps it. On the media server, the same choice is under Library › Folders.",
                to: "/settings?tab=library",
            },
        ],
    },
    {
        id: 36,
        title: "Continue watching starts where the card says",
        changes: [
            {
                title: "Resumed from the card's position",
                text: "A Continue watching card starts the episode at the time it shows, also when the saved position moved on after Home was loaded (watched further, or finished, on another device). A saved position is also kept when the file's length isn't known, and a video that has to be converted after all goes on from where it was.",
            },
        ],
    },
    {
        id: 35,
        title: "Steadier with the media server",
        changes: [
            {
                title: "Not offline on one slow answer",
                text: "A media server or another Aniko busy for a moment (a scan, a disk waking up) no longer shows as offline, nor loses its library here: it has to miss twice. Playing from it or syncing with it also counts as hearing from it.",
            },
            {
                title: "Your list comes at once",
                text: "Home and Local library show the copy here right away and ask AniList in the background, so a slow AniList doesn't hold the page. Episode names come from what's kept here the same way.",
            },
            {
                title: "Windows: a firewall rule",
                text: "The installer offers to add a Windows Firewall rule for Aniko's server, so the other devices' announcements get through. Settings › Devices says when a device is found by its address only, and has a Refresh button.",
            },
        ],
    },
    {
        id: 34,
        title: "A tidier sidebar",
        changes: [
            {
                title: "What you use most, first",
                text: "Home, Search, Discover and Local library are at the top, then My lists, Schedule and Manga. Downloads, Torrents and the Auto downloader come next, and Library tools, Extensions and Stats are together at the bottom. On a phone, the tabs along the bottom go Home, Search, Discover, Library.",
            },
        ],
    },
    {
        id: 33,
        title: "Download missing episodes",
        changes: [
            {
                title: "From Library tools, sub or dub",
                text: "Library tools › Missing episodes has a Download button on each anime: pick Sub or Dub (the anime's own choice to start with), the missing episodes, the ones aired since, or both, and a quality. ani-cli downloads them into your library, and they're matched by themselves.",
                to: "/library?tab=missing",
            },
            {
                title: "Only what's there",
                text: "Before you download, it says which of them ani-cli has in that version, which it doesn't (try the other version, or torrents), and which are already downloading.",
            },
        ],
    },
    {
        id: 32,
        title: "Download manga",
        changes: [
            {
                title: "Chapters to keep",
                text: "On a manga's page: Download (unread chapters, all of them, or from one chapter to another), or the download button on a chapter. Each is saved as a comic book file (.cbz) with its details from AniList inside, and the manga's details and cover beside it, so other comic readers show them properly too.",
            },
            {
                title: "Read without the provider",
                text: "A downloaded chapter opens from your device, also offline or once the provider has dropped it. Manga › Downloaded lists what you have; Settings › Manga sets the folder (Manga in your home folder unless you choose).",
            },
            {
                title: "Or onto your media server",
                text: "With a media server that takes your downloads, pick it under Save on: each chapter goes to the server's manga folder once downloaded. On a TV, that's where they go.",
            },
        ],
    },
    {
        id: 31,
        title: "Movies in the watch order",
        changes: [
            {
                title: "A Movies tab",
                text: "An anime's Watch order has a Movies tab: all of the franchise's movies, in story order, then those of its spin-offs and other versions.",
            },
            {
                title: "Movies AniList links only loosely",
                text: "Many franchises' films (Detective Conan's, Pokémon's, a series' theatrical movies) are linked on AniList as just \"other\". They're now in the watch order too, placed by their release dates. A movie's own page now shows its series' order as well.",
            },
        ],
    },
    {
        id: 30,
        title: "Stream torrents",
        changes: [
            {
                title: "Play a torrent as it downloads",
                text: "A result of an anime's Torrents tab now has Stream: it plays in a few seconds, the part being watched first, and seeking works; of a batch, the episode you looked for. It plays like a file on this computer (converted when it has to be, its audio tracks too); its own subtitles show once most of it is here. What it downloads is only kept while it's played. Download still sends it to your torrent client.",
            },
        ],
    },
    {
        id: 29,
        title: "Aniko Hub is now mediaserver",
        changes: [
            {
                title: "mediaserver",
                text: "Aniko Hub became mediaserver, one home server for Aniko and KumoBox: the same library, devices and AniList logins, on the same address. Its dashboard installs it in the hub's place (Settings › Updates there).",
                to: "/settings?tab=devices",
            },
            {
                title: "Upload to your server",
                text: "Episodes, whole folders of them, and their subtitles from this computer into the server's library: Local library › Upload, or Upload next to it in Settings › Other devices. An upload cut short carries on where it stopped. The server lets this device download there first (its dashboard's Devices › Let it download here).",
                to: "/local",
            },
        ],
    },
    {
        id: 28,
        title: "A picture on the Fire TV",
        changes: [
            {
                title: "The TV plays videos in Android's own player",
                text: "The Fire TV's built-in web view has been showing videos as a grey picture under their sound, in other apps too. On the TV, Aniko now plays every video, from the hub, a computer or online, in Android's own video player, with Aniko's controls and subtitles over it as before.",
            },
            {
                title: "Less converting on the hub",
                text: "Android's player plays Matroska (.mkv) files as they are, so the hub sends more episodes to the TV unchanged instead of converting them. What the old grey-picture fix set up on the TV (converting in software) is undone.",
            },
            {
                title: "Android's video player, on or off",
                text: "In the player's settings (the gauge) on the TV: turn it off to go back to the web view's player, or on again. The episode goes on from where it was.",
            },
        ],
    },
    {
        id: 27,
        title: "The whole library, every time",
        changes: [
            {
                title: "No more missing anime when the app opens",
                text: "Sometimes the library showed only part of the hub's anime until the app was opened again: those not on your AniList list were left out when AniList didn't answer at once. Aniko now uses what it knew of them before, asks again until every one is in, and gets the hub's library again when it reconnects.",
            },
        ],
    },
    {
        id: 26,
        title: "The TV's grey picture",
        changes: [
            {
                title: "A grey picture is caught too",
                text: "When the TV shows only a flat grey picture under the sound, Aniko now notices, the same as when it shows none: it opens the video again, then converts it, and last converts it in software, which this TV then keeps doing.",
            },
            {
                title: "Grey picture? Convert in software",
                text: "In the player's settings (the gauge): converts the video in software on the computer or hub, for this device from then on. Choose it again to turn it off.",
            },
        ],
    },
    {
        id: 25,
        title: "Kumo is now Aniko",
        changes: [
            {
                title: "A new name and logo",
                text: "Same app, new name: Aniko, with a new logo, an A and a spark. Your library, history, settings and logins came along; nothing to set up again.",
            },
            {
                title: "On every device",
                text: "The computers, the TV app and the hub all update to Aniko by themselves and keep finding each other. On a Mac, the app still called Kumo renames itself Aniko when it opens.",
            },
        ],
    },
    {
        id: 24,
        title: "The TV: the picture, and dubs",
        changes: [
            {
                title: "No more grey picture",
                text: "When the TV plays an episode's sound under a grey picture, Aniko now converts the video for it (and keeps converting that format for this TV), and as a last resort converts it another way. Each try is written in the log of the computer or hub the episode is on.",
            },
            {
                title: "Dubs without subtitles",
                text: "On the TV, a dub starts without subtitles; turn them on from the player when you want them. Switching to the original audio turns them back on.",
            },
        ],
    },
    {
        id: 23,
        hub: true,
        title: "Aniko Hub: the TV's picture",
        changes: [
            {
                title: "A picture from the Raspberry Pi",
                text: "Videos the hub converted with the Pi's encoder played their sound under a grey picture on the TV: the video's start information was missing. It's sent now, and the hub's Server log says how each video is sent (copied or converted).",
            },
        ],
    },
    {
        id: 22,
        hub: true,
        title: "Aniko Hub: an audit log",
        changes: [
            {
                title: "Everything that happens on the hub",
                text: "The dashboard's Activity is now the Audit log, kept 90 days: what the devices watch and send the hub, every change made on the dashboard and from where, sign-ins and wrong passwords, downloads finishing or failing, deleted files. Filter it, search it.",
            },
            {
                title: "Download again",
                text: "Deleted episodes are listed there with a Download again button (sub or dub), which downloads them onto the hub again. The hub keeps no trash any more.",
            },
            {
                title: "The server's log",
                text: "Every line the hub's server writes, kept on its disk: search it, show only the problems, or save it as a file.",
            },
        ],
    },
    {
        id: 21,
        hub: true,
        title: "Aniko Hub: delete from its library",
        changes: [
            {
                title: "Delete anime and episodes on the hub",
                text: "The hub's dashboard, under Library › Anime: open an anime to delete it from the hub, or single episodes. They're deleted at once; the hub's audit log can download them again.",
            },
        ],
    },
    {
        id: 20,
        title: "A back arrow",
        changes: [
            {
                title: "Back, at the top left",
                text: "Once you've opened a page (an anime, a setting, a list), an arrow next to the Aniko logo takes you back to the one before. In the desktop app, Alt+Left (⌘[ on a Mac) and a mouse's back button do too.",
            },
        ],
    },
    {
        id: 19,
        title: "Watch order (experimental)",
        changes: [
            {
                title: "Story and release order",
                text: "An anime's page now shows its franchise in order, under the episodes and in Details: the order the story happens in and the order it came out in, with recaps marked skippable and spin-offs apart. Edit the story order to your own; it's kept on this device.",
            },
        ],
    },
    {
        id: 18,
        title: "Your whole library on Home",
        changes: [
            {
                title: "In your library, all of it",
                text: "Home's In your library now shows every anime in your library, the hub's included, as the Local library page does. It used to leave out the ones on your AniList lists, which show in their list's row too.",
            },
        ],
    },
    {
        id: 17,
        title: "Download progress from the hub",
        changes: [
            {
                title: "Downloads show how far they are",
                text: "Episodes downloaded with ffmpeg (the hub's way, and a computer's without yt-dlp) stayed at 0% until they were done. They now show their percentage and the time left, or the minutes downloaded when the episode's length can't be found.",
                to: "/downloads",
            },
        ],
    },
    {
        id: 16,
        title: "Search opens the Search page",
        changes: [
            {
                title: "Search, with its filters",
                text: "Search in the sidebar now opens the Search page, with its filters by season, year, format, status and genre. Ctrl K still opens quick search from anywhere, the player included.",
                to: "/search",
            },
        ],
    },
    {
        id: 15,
        hub: true,
        title: "Aniko Hub: its library, with artwork",
        changes: [
            {
                title: "Browse the hub's library",
                text: "The hub's dashboard, under Library: every anime it has with its cover, episodes and size, to search and sort; open one for its details and the episodes on the hub. The hub now downloads and keeps every anime's artwork, episode thumbnails and details itself.",
            },
        ],
    },
    {
        id: 14,
        hub: true,
        title: "Aniko Hub: put its library right",
        changes: [
            {
                title: "Library tools on the hub",
                text: "The hub's dashboard, under Library › Put the library right: match the files it couldn't place, ignore what isn't an episode, and fix episode numbers or wrong matches, as in Library tools on a computer.",
            },
        ],
    },
    {
        id: 13,
        title: "Parental controls: more 18+",
        changes: [
            {
                title: "Block 18+ anime covers more",
                text: "Besides AniList's adult anime, it now blocks Ecchi and Hentai, and anime AniList tags with sexual content (nudity and the like) when most of its voters agree. Devices with it on don't offer Ecchi as a filter either.",
            },
        ],
    },
    {
        id: 12,
        hub: true,
        title: "Only the hub's library",
        changes: [
            {
                title: "Turn off this computer's library",
                text: "Moved your anime to an Aniko Hub? Settings › Local library › A library on this computer: off. Aniko forgets this computer's files (nothing is deleted) and plays your hub's library instead. A folder taken out of the library goes too, also when its drive is gone.",
                to: "/settings?tab=library",
            },
        ],
    },
    {
        id: 11,
        title: "Parental controls",
        changes: [
            {
                title: "Parental controls",
                text: "On the computer or Aniko Hub that shares with a device (a kid's tablet or TV), Settings › Other devices (or the hub's Devices) › Parental controls: block 18+ anime, chosen genres or titles, or allow only the anime you pick, and see everything it watched. Its Aniko hides the rest and won't open or play it, also away from home; only the computer that set them, or a PIN on the device, lifts them.",
                to: "/settings?tab=devices",
            },
        ],
    },
    {
        id: 10,
        hub: true,
        title: "Aniko Hub",
        changes: [
            {
                title: "A hub for your home",
                text: "Aniko Hub is Aniko for a Raspberry Pi (or any Linux computer that stays on): it shares its library with your computers, TVs and phones, and keeps the devices on the same AniList account in step as you watch: stop on the TV, carry on from the same second on the computer. Its dashboard, in a browser, shows what it's streaming to whom and how the Pi is doing. To set one up, see packaging/hub/README.md on GitHub.",
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
                text: "Your AniList profile in Aniko: your numbers, favourites, what you're watching and what you've finished, who you follow and who follows you, and what the people you follow have been watching. Like their updates, open theirs, and follow people from their profiles. It's in the menu under your name in the sidebar.",
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
                text: "Opening an anime starts on its Play button, and Home on your first Continue watching card. The manga reader turns pages with the remote, Back takes you up Home before it leaves Aniko, and holding OK no longer pauses and plays over and over. A remote's Stop, Previous and Captions keys work too.",
            },
            {
                title: "On a phone",
                text: "Tabs along the bottom instead of the sidebar, and pages that use the whole screen: Settings, buttons and menus fit. In the Android app, Back goes back a page instead of closing Aniko.",
            },
            {
                title: "On your computer",
                text: "Aniko's window opens where you left it, at its size, and shows that it's starting. Right-click copies and pastes, Ctrl + and − zoom (and stay that way), and the mouse's back button goes back. If Aniko can't start, it says why and offers to try again.",
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
            { title: "A smoother look", text: "Aniko 2.0, calmer: flatter buttons and panels, softer shadows and corners, closer to how the classic look felt." },
        ],
    },
    {
        id: 4,
        title: "Classic look and beta updates",
        changes: [
            {
                title: "Classic look",
                text: "Liked Aniko better as it was before 2.0? Turn on Classic look in Themes in the sidebar, or in Settings › Appearance. The color and holiday themes work in both.",
                to: "/settings?tab=appearance",
            },
            {
                title: "Beta updates",
                text: "New versions now come out as betas first. Want them early? Turn on Beta updates in Settings › Updates & about; otherwise Aniko stays on the stable releases.",
                to: "/settings?tab=updates",
            },
            { title: "Smoother sidebar", text: "A cleaner Themes button, and on smaller laptop screens every link fits again." },
        ],
    },
    {
        id: 3,
        title: "Aniko 2.0",
        changes: [
            { title: "A cleaner look", text: "The same Aniko, tidied up: the sidebar in sections, softer panels and cards, nicer dialogs, menus and buttons." },
            { title: "Themes in the sidebar", text: "Every color theme and holiday theme a click away: try one after another, the menu stays open." },
            {
                title: "Holiday themes, redone",
                text: "Each holiday brings its own colors and decorations (Christmas lights, Halloween's moon and cobweb, a cherry branch, summer lanterns) and nicer snow, bats, hearts, petals, fireflies and fireworks.",
            },
            {
                title: "Fixes",
                text: "Alerts for a season's last episode, and for torrents once they're done downloading; Clean up never takes the only copy of an episode; the desktop app follows Aniko to a new port; and more.",
            },
        ],
    },
    {
        id: 2,
        title: "Themes, picture in picture and more",
        changes: [
            { title: "Color themes", text: "Eight looks for Aniko, from Midnight blue to true Black for OLED screens.", to: "/settings?tab=appearance" },
            {
                title: "Holiday themes",
                text: "Aniko dresses up by itself: bats in October, snow in December, hearts in February and more. Turn them off, or keep one all year, in Settings.",
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
            { title: "Settings › Other devices", text: "All your Aniko devices with their versions, Wake buttons, and a question when a new TV shows up.", to: "/settings?tab=devices" },
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
