#!/usr/bin/env bash
# Installs Kumo Hub on a Raspberry Pi (Pi 4 or 5, Raspberry Pi OS 64-bit
# best; 32-bit works too) or any other Linux computer, as a service that
# starts with it. Run it as the user the hub is to run as (not root: it asks
# for sudo when it needs it):
#
#   curl -fsSL https://raw.githubusercontent.com/v0-0x/kumo-anime/HEAD/packaging/hub/install.sh | bash
#
# or, in the folder of a kumo-hub-<version>-linux-<arch>.tar.gz you
# unpacked: ./install.sh (it installs the kumo-hub next to it).
#
#   --beta         the newest beta too (and the hub's updates follow the betas)
#   --no-ffmpeg    don't install ffmpeg (needed to convert the videos a
#                  device can't play as they are, and for downloads)
#   --no-ani-cli   don't install ani-cli (for the episodes devices download
#                  onto the hub)
#   --uninstall    remove the hub's program and service (its data stays)
#   --purge        the same, and its data (accounts, history, settings)
#
# The hub's program goes in ~/.local/bin/kumo-hub (it replaces it itself
# when it updates), its data in ~/.local/share/kumo-hub, its service in
# /etc/systemd/system/kumo-hub.service.
set -euo pipefail

# All in a function, run at the end: piped from curl, a download cut short
# runs nothing.
main() {
REPO=v0-0x/kumo-anime
beta=0 ffmpeg=1 anicli=1 uninstall=0 purge=0
for arg in "$@"; do
  case $arg in
    --beta) beta=1 ;;
    --no-ffmpeg) ffmpeg=0 ;;
    --no-ani-cli) anicli=0 ;;
    --uninstall) uninstall=1 ;;
    --purge) uninstall=1 purge=1 ;;
    -h | --help)
      sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "install.sh: unknown option $arg (see --help)" >&2
      exit 2
      ;;
  esac
done

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() {
  printf '\033[31m%s\033[0m\n' "$*" >&2
  exit 1
}

if [ "$(id -u)" -eq 0 ]; then
  die "Run this as the user the hub is to run as (pi, say), not as root or with sudo: it asks for sudo when it needs it."
fi
[ "$(uname -s)" = Linux ] || die "Kumo Hub is for Linux (a Raspberry Pi, say). On Windows and macOS, install Kumo itself."
command -v curl > /dev/null || die "This needs curl: sudo apt-get install -y curl"

user=$(id -un)
bin="$HOME/.local/bin/kumo-hub"
data="${XDG_DATA_HOME:-$HOME/.local/share}/kumo-hub"
unit=/etc/systemd/system/kumo-hub.service
has_systemd=0
if command -v systemctl > /dev/null && [ -d /run/systemd/system ]; then
  has_systemd=1
fi

if [ "$uninstall" = 1 ]; then
  if [ "$has_systemd" = 1 ] && [ -f "$unit" ]; then
    say "Stopping the hub's service…"
    sudo systemctl disable --now kumo-hub || true
    sudo rm -f "$unit"
    sudo systemctl daemon-reload
  fi
  rm -f "$bin" "$bin.new"
  if [ "$purge" = 1 ]; then
    rm -rf "$data"
    say "Kumo Hub is removed, with its data."
  else
    say "Kumo Hub is removed. Its data stays in $data (--purge removes it)."
  fi
  exit 0
fi

# The program for this processor. A static program: on a 64-bit kernel the
# 64-bit one runs even with a 32-bit system around it.
case $(uname -m) in
  aarch64 | arm64) arch=arm64 ;;
  armv7l | armv8l) arch=arm ;;
  x86_64 | amd64) arch=amd64 ;;
  armv6l) die "This Raspberry Pi (ARMv6: a Pi 1 or Zero) is too slow for Kumo Hub: use a Pi 3, 4 or 5." ;;
  *) die "Kumo Hub isn't made for this processor ($(uname -m))." ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
here=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2> /dev/null && pwd || true)
prerelease=0
if [ -n "$here" ] && [ -x "$here/kumo-hub" ] && [ -f "$here/kumo-hub.service" ]; then
  # Run from an unpacked archive.
  src=$here
  version=$("$src/kumo-hub" --version | awk '{ print $NF }')
  say "Installing Kumo Hub $version from $src"
else
  command -v python3 > /dev/null || die "This needs python3 (to read GitHub's list of releases): sudo apt-get install -y python3"
  say "Looking for the newest Kumo Hub…"
  curl -fsSL -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/releases?per_page=100" -o "$tmp/releases.json" ||
    die "Couldn't read Kumo's releases on GitHub (no internet?)."
  # <version> <1 if a beta> <address> <sha256:… or empty>
  pick=$(python3 -I - "$tmp/releases.json" "$beta" "$arch" << 'PY'
import json, re, sys
releases = json.load(open(sys.argv[1]))
beta, arch = sys.argv[2] == "1", sys.argv[3]
hubs = [r for r in releases if not r.get("draft") and re.fullmatch(r"hub-v\d+(\.\d+)*", r["tag_name"])]
stable = [r for r in hubs if not r.get("prerelease")]
# Betas too when asked, or when there's no stable release yet.
pool = hubs if beta or not stable else stable
if not pool:
    sys.exit("no Kumo Hub release yet")
best = max(pool, key=lambda r: tuple(int(n) for n in r["tag_name"][5:].split(".")))
version = best["tag_name"][5:]
name = "kumo-hub-%s-linux-%s.tar.gz" % (version, arch)
asset = next((a for a in best.get("assets", []) if a["name"] == name), None)
if asset is None:
    sys.exit("Kumo Hub %s has no %s" % (version, name))
print(version, "1" if best.get("prerelease") else "0", asset["browser_download_url"], asset.get("digest") or "")
PY
  ) || die "Couldn't find a Kumo Hub to install."
  read -r version prerelease url digest <<< "$pick"
  if [ "$prerelease" = 1 ]; then
    say "Downloading Kumo Hub $version (beta) for $arch…"
  else
    say "Downloading Kumo Hub $version for $arch…"
  fi
  curl -fL --progress-bar -o "$tmp/hub.tar.gz" "$url" || die "The download failed."
  if [[ $digest == sha256:* ]]; then
    echo "${digest#sha256:}  $tmp/hub.tar.gz" | sha256sum -c --quiet - || die "The download is damaged (its checksum doesn't match): try again."
  fi
  mkdir "$tmp/x"
  tar -xzf "$tmp/hub.tar.gz" -C "$tmp/x"
  src=$(find "$tmp/x" -mindepth 1 -maxdepth 1 -type d | head -1)
  [ -x "$src/kumo-hub" ] || die "The archive has no kumo-hub program."
fi

# ffmpeg converts the videos a device can't play as they are (on a Pi with
# its video encoder, h264_v4l2m2m) and saves downloads; ani-cli finds the
# episodes devices download onto the hub.
want=()
if [ "$ffmpeg" = 1 ] && ! command -v ffmpeg > /dev/null; then want+=(ffmpeg); fi
if [ ${#want[@]} -gt 0 ]; then
  if command -v apt-get > /dev/null; then
    say "Installing ${want[*]}…"
    sudo apt-get update -qq && sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${want[@]}" < /dev/null ||
      echo "${want[*]} didn't install: the hub still shares its library, without converting or downloading." >&2
  else
    echo "Install ${want[*]} with your system's packages: the hub converts videos and takes downloads with them." >&2
  fi
fi
if [ "$anicli" = 1 ] && ! command -v ani-cli > /dev/null && [ ! -x "$HOME/.local/bin/ani-cli" ]; then
  say "Installing ani-cli…"
  mkdir -p "$HOME/.local/bin"
  if curl -fsSL -o "$tmp/ani-cli" https://raw.githubusercontent.com/pystardust/ani-cli/master/ani-cli && head -1 "$tmp/ani-cli" | grep -q '^#!'; then
    install -m 755 "$tmp/ani-cli" "$HOME/.local/bin/ani-cli"
  else
    echo "ani-cli didn't download: devices can't download episodes onto the hub until it's installed." >&2
  fi
fi

mkdir -p "$(dirname "$bin")" "$data"
chmod 700 "$data" # AniList logins are in it
was_running=0
if [ "$has_systemd" = 1 ] && systemctl is-active --quiet kumo-hub 2> /dev/null; then
  was_running=1
fi
# Next to the old one, then over it: a running hub goes on until it restarts.
cp "$src/kumo-hub" "$bin.new"
chmod 755 "$bin.new"
mv -f "$bin.new" "$bin"
if [ "$prerelease" = 1 ] || [ "$beta" = 1 ]; then
  "$bin" --data-dir "$data" --set-channel beta > /dev/null
fi

port=43211
host=$(hostname)
[[ $host == *.* ]] || host="$host.local"
if [ "$has_systemd" = 1 ]; then
  say "Installing the service (kumo-hub)…"
  path="$HOME/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  sed -e "s|@USER@|$user|g" -e "s|@BIN@|$bin|g" -e "s|@DATA@|$data|g" -e "s|@PATH@|$path|g" "$src/kumo-hub.service" > "$tmp/kumo-hub.service"
  sudo install -m 644 "$tmp/kumo-hub.service" "$unit"
  sudo systemctl daemon-reload
  sudo systemctl enable kumo-hub > /dev/null 2>&1
  if [ "$was_running" = 1 ]; then
    sudo systemctl restart kumo-hub
  else
    sudo systemctl start kumo-hub
  fi
  sleep 2
  systemctl is-active --quiet kumo-hub || die "The hub didn't start: journalctl -u kumo-hub -n 50 says why."
else
  echo "No systemd here: start the hub with  $bin" >&2
fi

echo
say "Kumo Hub $version is installed."
echo "  Dashboard:   http://$host:$port  (or this computer's address, port $port)"
if "$bin" --data-dir "$data" --setup-code | grep -q '^[0-9]\{4\}-[0-9]\{4\}$'; then
  echo "  Setup code:  $("$bin" --data-dir "$data" --setup-code)  (to set the dashboard's password; ~/.local/bin/kumo-hub --setup-code shows it again)"
fi
if [ "$has_systemd" = 1 ]; then
  echo "  Logs:        journalctl -u kumo-hub -f"
fi
echo
echo "On your computers and TVs with Kumo, turn on Settings › Other devices: the hub shows up there."
}

main "$@"
