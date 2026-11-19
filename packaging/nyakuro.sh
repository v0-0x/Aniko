#!/bin/sh
# Launches the Nyakuro desktop app with the system Electron.
# Extra Electron flags can go in ~/.config/nyakuro-flags.conf (one per line);
# without it, the aniko-flags.conf or kumo-flags.conf written for Nyakuro's
# old names still counts.
ELECTRON="${NYAKURO_ELECTRON:-${ANIKO_ELECTRON:-${KUMO_ELECTRON:-electron}}}"
FLAGS=""
for name in nyakuro aniko kumo; do
    conf="${XDG_CONFIG_HOME:-$HOME/.config}/$name-flags.conf"
    if [ -f "$conf" ]; then
        FLAGS="$(grep -v '^#' "$conf" | tr '\n' ' ')"
        break
    fi
done
# shellcheck disable=SC2086
exec "$ELECTRON" --ozone-platform-hint=auto $FLAGS /usr/lib/nyakuro/app "$@"
