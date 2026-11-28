#!/bin/sh
# macOS bundle entry. LaunchServices starts this file (CFBundleExecutable),
# then exec replaces it with the NSH host.
#
# A double-clicked app gets a short PATH (/usr/bin:/bin:/usr/sbin:/sbin)
# that does not include ~/.local/bin. Desktop is only allowed to spawn the
# bare command name "ear", so the bundled helper must be the first match.
set -eu
DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
HELPERS=$(CDPATH= cd "$DIR/../Helpers" && pwd)
export PATH="$HELPERS${PATH:+:$PATH}"
exec "$DIR/Ear.bin" "$@"
