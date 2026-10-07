#!/usr/bin/env bash
# Ronde 2: een eigen git-worktree voor een bouwagent, met een eigen branch, poort, .next en database.
# node_modules is een symlink naar de hoofdrepository (niets installeren). Zie ontwerp-ronde2.md, hoofdstuk 1.
#
#   RONDE2_MAP=/pad/naar/worktrees scripts/ronde2-worktree.sh A1 3101
#
# RONDE2_MAP: map waarin de worktree komt (standaard naast de repository); de worktree heet ibcalculator-<agent>.
# RONDE2_BASIS: commit of branch om vanaf te beginnen (standaard main).
# De database is het SQLite-bestand ./data/ibcalculator.db in de worktree (git negeert data/), dus elke agent heeft
# vanzelf een eigen database. scripts/dev-account.ts voert de migraties uit en maakt een ontwikkelaccount met 2FA.
set -euo pipefail
agent="${1:?agent, bijvoorbeeld A1}"
poort="${2:?poort, bijvoorbeeld 3101}"
laag="$(printf '%s' "$agent" | tr '[:upper:]' '[:lower:]')"
hoofd="$(git rev-parse --show-toplevel)"
map="${RONDE2_MAP:-$(dirname "$hoofd")}"
mkdir -p "$map"
doel="$map/ibcalculator-$laag"
branch="ronde2/$laag"
basis="${RONDE2_BASIS:-main}"

if [ -e "$doel" ]; then
  echo "Bestaat al: $doel" >&2
  exit 1
fi
git -C "$hoofd" worktree add -b "$branch" "$doel" "$basis"
ln -s "$hoofd/node_modules" "$doel/node_modules"

geheim() { node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"; }
{
  echo "# Ronde 2, worktree $agent (niet in git)"
  echo "PORT=$poort"
  echo "NEXT_PUBLIC_SITE_URL=http://localhost:$poort"
  echo "AUTH_SECRET=$(geheim)"
  echo "DOSSIER_KEY=$(geheim)"
  echo "# Database: ./data/ibcalculator.db in deze worktree (standaard, geen DATABASE_PATH nodig)"
} > "$doel/.env.local"

echo "Worktree: $doel (branch $branch, poort $poort)"
(cd "$doel" && npx tsx --env-file=.env.local scripts/dev-account.ts)
echo "Bouwen en starten: cd $doel && npx next build && npx next start -p $poort"
