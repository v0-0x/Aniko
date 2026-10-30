# Aniko Hub

Aniko Hub is Aniko without a player, for a computer that stays on: a
Raspberry Pi 4 or 5, or any Linux computer. It shares its library with the
Aniko apps on your home network (computers, TVs, phones) and keeps them in
step:

- **Streaming.** The devices play the hub's episodes as they are, which costs
  the Pi almost nothing. A file a device can't play (some TVs and phones
  can't play HEVC or 10-bit video) is converted as it plays, with the Pi's
  video chip, at most 2 at a time.
- **The same place on every device.** The devices on the same AniList
  account carry on where any of them stopped, a few seconds after it
  stopped, and share their list, theme and player settings. Each account's
  progress is kept apart.
- **AniList logins.** A device can give the hub its AniList login, and the
  hub can give that account to a device that isn't logged in (a TV).
- **Downloads.** Devices you allow send their downloads and torrents to the
  hub, into its library.
- **A dashboard.** In a browser on the network: what it's streaming to whom,
  who's watching what, its devices and logins, its library and disks, and
  the Pi's CPU, memory, temperature and network.

The hub itself uses about 35 to 45 MB of memory, streaming or not; a
video being converted adds ffmpeg's own while it runs.

## What you need

- A Raspberry Pi 4 or 5 (2 GB is plenty) with **Raspberry Pi OS Lite,
  64-bit** (32-bit works too), or another computer with Linux.
- The library on a USB drive (USB 3, the blue ports) or the SD card. Mount
  the drive at the same place every boot, for example `/mnt/anime` with a
  line in `/etc/fstab`; the desktop version of Raspberry Pi OS mounts it
  under `/media/<you>/` by itself.
- A wired network connection gives the steadiest streams; Wi-Fi works for
  one or two.

## Install

On the Pi, as your usual user (not root):

```bash
curl -fsSL https://raw.githubusercontent.com/v0-0x/Aniko/HEAD/packaging/hub/install.sh | bash
```

Add `-s -- --beta` after `bash` for the newest beta. The script installs
the hub for your Pi's processor into `~/.local/bin/aniko-hub`, ffmpeg and
ani-cli, and a service that starts the hub with the Pi. At the end it prints
the dashboard's address and a **setup code**.

Or download `aniko-hub-<version>-linux-<arm64|arm|amd64>.tar.gz` from the
newest **Aniko Hub** release, unpack it and run its `./install.sh`.

Options: `--beta`, `--no-ffmpeg`, `--no-ani-cli`, `--uninstall` (keeps the
hub's data), `--purge` (removes its data too).

## Set it up

1. Open the dashboard from a browser on the network:
   `http://raspberrypi.local:43211` (your Pi's name, or its address).
2. Type the setup code and choose the dashboard's password. (On the Pi,
   `~/.local/bin/aniko-hub --setup-code` shows the code again.)
3. **Library › Add a folder**: the folder your anime are in. The hub finds
   the episodes and matches them to their anime.
4. On each computer, TV or phone with Aniko, turn on **Settings › Other
   devices**. The device shows up on the dashboard under **Devices**: turn on
   **Share the library** for it.
5. On one device logged in to AniList, in **Settings › Other devices**, on
   the hub, press **Send**: the hub takes its AniList login, its theme and
   settings, and every position it has watched, so the other devices start
   where it is. For a TV that isn't logged in, turn on **Give it an AniList
   login** for it on the dashboard.
6. To let a device download onto the hub, turn on **Let it download here**
   for it. Then, on the device, **Settings › Other devices › Downloads from
   this device go to** the hub. Torrents need a torrent client on the hub
   (`sudo apt install transmission-daemon`), set in the dashboard's
   **Settings › Downloads**.

## Updates

The hub looks for new versions by itself; **Settings › Updates** on the
dashboard installs one (the hub restarts in a few seconds). **Beta updates**
there offers the betas too.

## When something's wrong

- **The hub's log:** `journalctl -u aniko-hub -f`
- **Restart it:** `sudo systemctl restart aniko-hub`
- **The dashboard doesn't open:** check the service runs
  (`systemctl status aniko-hub`) and use the Pi's address instead of its
  name.
- **A device doesn't show up:** some routers keep devices from finding each
  other. In the device's Settings › Other devices, **Add by address** with
  the Pi's address and port 43211.
- **Episodes don't show:** the folder must be readable by the user the hub
  runs as; **Library › Scan everything again** looks again.
- **The temperature card says it slows down:** the Pi is too hot (give it a
  case with a fan or a heatsink) or its power supply is too weak (use the
  official one).
- **Forgot the dashboard's password:** on the Pi,

  ```bash
  sudo systemctl stop aniko-hub
  ~/.local/bin/aniko-hub --reset-password
  sudo systemctl start aniko-hub
  ```

  then open the dashboard and set a new one with the setup code it prints.
