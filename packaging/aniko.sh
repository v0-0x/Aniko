#!/bin/sh
# Launches the Aniko desktop app with the system Electron.
# Extra Electron flags can go in ~/.config/aniko-flags.conf (one per line);
# without it, the nyakuro-flags.conf or kumo-flags.conf written for Aniko's
# old names still counts.
ELECTRON="${ANIKO_ELECTRON:-${NYAKURO_ELECTRON:-${KUMO_ELECTRON:-electron}}}"
FLAGS=""
for name in aniko nyakuro kumo; do
    conf="${XDG_CONFIG_HOME:-$HOME/.config}/$name-flags.conf"
    if [ -f "$conf" ]; then
        FLAGS="$(grep -v '^#' "$conf" | tr '\n' ' ')"
        break
    fi
done
# shellcheck disable=SC2086
exec "$ELECTRON" --ozone-platform-hint=auto $FLAGS /usr/lib/aniko/app "$@"
