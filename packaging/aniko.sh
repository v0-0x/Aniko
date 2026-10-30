#!/bin/sh
# Launches the Aniko desktop app with the system Electron.
# Extra Electron flags can go in ~/.config/aniko-flags.conf (one per line).
ELECTRON="${ANIKO_ELECTRON:-electron}"
FLAGS=""
if [ -f "${XDG_CONFIG_HOME:-$HOME/.config}/aniko-flags.conf" ]; then
    FLAGS="$(grep -v '^#' "${XDG_CONFIG_HOME:-$HOME/.config}/aniko-flags.conf" | tr '\n' ' ')"
fi
# shellcheck disable=SC2086
exec "$ELECTRON" --ozone-platform-hint=auto $FLAGS /usr/lib/aniko/app "$@"
