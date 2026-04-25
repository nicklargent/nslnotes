#!/usr/bin/env bash
# Bump the user-visible version of NslNotes in one command.
#
# Updates package.json + package-lock.json (via `npm version`) and refreshes
# the npmDepsHash in flake.nix so `nix build` keeps working. The Tauri config,
# the in-app footer, and the flake's `pname-<version>` derivation all read
# from package.json, so no other files need touching.
#
# Usage:
#   scripts/bump-version.sh 1.2.3        # explicit version
#   scripts/bump-version.sh patch        # 1.0.0 -> 1.0.1
#   scripts/bump-version.sh minor        # 1.0.0 -> 1.1.0
#   scripts/bump-version.sh major        # 1.0.0 -> 2.0.0

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <version | patch | minor | major>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

if [[ -n $(git status --porcelain package.json package-lock.json flake.nix 2>/dev/null) ]]; then
  echo "error: package.json, package-lock.json, or flake.nix has uncommitted changes." >&2
  echo "       Commit or stash them first so the bump is a clean diff." >&2
  exit 1
fi

new_version=$(npm version "$1" --no-git-tag-version | tr -d 'v')
echo "package.json -> $new_version"

echo "computing new npmDepsHash..."
new_hash=$(nix run nixpkgs#prefetch-npm-deps -- ./package-lock.json 2>/dev/null | tail -n1)

if [[ ! $new_hash =~ ^sha256- ]]; then
  echo "error: prefetch-npm-deps did not return a sha256 hash" >&2
  echo "got: $new_hash" >&2
  exit 1
fi

# Replace only the npmDeps `hash = ...` line — cargoHash uses `cargoHash = ...`
# so this regex won't touch it.
sed -i -E "s|^(\s*hash = \")sha256-[^\"]+(\";)|\1${new_hash}\2|" flake.nix

if ! grep -qF "$new_hash" flake.nix; then
  echo "error: failed to write new hash into flake.nix" >&2
  exit 1
fi

echo "flake.nix npmDepsHash -> $new_hash"
echo
echo "done. review with: git diff package.json flake.nix"
echo "then: nix build .# && nix profile upgrade nslnotes"
