#!/usr/bin/env bash
# Ronde 2: een eigen git-worktree voor een bouwagent, met een eigen branch, poort, .next en databaseschema.
# node_modules is een symlink naar de hoofdrepository (niets installeren). Zie ontwerp-ronde2.md, hoofdstuk 1.
#
#   RONDE2_MAP=/pad/naar/worktrees IB_DEV_DATABASE_URL=postgresql://ibtest@localhost:55439/ibdev scripts/ronde2-worktree.sh A1 3101
#
# RONDE2_MAP: map waarin de worktree komt (standaard naast de repository); de worktree heet ibcalculator-<agent>.
# RONDE2_BASIS: commit of branch om vanaf te beginnen (standaard main).
# IB_DEV_DATABASE_URL: Postgres zonder schema. Elke agent krijgt daarin een eigen schema ib_r2_<agent>, met de
# migraties en een ontwikkelaccount met 2FA (scripts/dev-account.ts). Zonder die variabele wordt de worktree wel
# gemaakt, maar zonder database (geen dossierpagina's; schermafbeeldingen van het dossier dan in de integratiestap).
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
  if [ -n "${IB_DEV_DATABASE_URL:-}" ]; then
    scheiding='?'
    case "$IB_DEV_DATABASE_URL" in *\?*) scheiding='&' ;; esac
    echo "DATABASE_URL=${IB_DEV_DATABASE_URL}${scheiding}options=-c%20search_path%3Dib_r2_$laag"
  fi
} > "$doel/.env.local"

echo "Worktree: $doel (branch $branch, poort $poort)"
if [ -n "${IB_DEV_DATABASE_URL:-}" ]; then
  (cd "$doel" && npx tsx --env-file=.env.local scripts/dev-account.ts)
else
  echo "Geen IB_DEV_DATABASE_URL: geen database voor deze worktree."
fi
echo "Bouwen en starten: cd $doel && npx next build && npx next start -p $poort"
