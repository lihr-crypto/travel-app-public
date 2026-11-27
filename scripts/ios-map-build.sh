#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# This host has CocoaPods in a user gem directory; standard pod installs work too.
if ! command -v pod >/dev/null 2>&1; then
  task_pod_bin="$HOME/.gem/ruby/4.0.0/bin"
  task_ruby_bin="$HOME/homebrew/Library/Homebrew/vendor/portable-ruby/4.0.6/bin"
  if [[ -x "$task_pod_bin/pod" && -x "$task_ruby_bin/ruby" ]]; then
    export PATH="$task_pod_bin:$task_ruby_bin:$PATH"
  else
    printf 'CocoaPods is required for the iOS map build.\n' >&2
    exit 1
  fi
fi

# Expo loads ignored .env.local before evaluating app.config.js.
EXPO_MAPS_REQUIRE_KEYS=1 npx expo config --type prebuild --json >/dev/null
EXPO_MAPS_REQUIRE_KEYS=1 npx expo prebuild --platform ios
EXPO_MAPS_REQUIRE_KEYS=1 npx expo run:ios "$@"
