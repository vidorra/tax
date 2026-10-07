#!/usr/bin/env bash
# Maakt deploy.tar voor CapRover: de kant-en-klare .next-build met precies wat de container verder nodig heeft. De
# image bouwt niets (zie Dockerfile): de server installeert alleen de productie-afhankelijkheden. De workflow
# (.github/workflows/deploy.yml) en scripts/docker-rooktest.sh gebruiken allebei dit script, zodat de rooktest
# dezelfde image bouwt als de server.
#
#   npm run build && scripts/deploy-tarball.sh            # schrijft ./deploy.tar
#   scripts/deploy-tarball.sh /pad/naar/deploy.tar
#   GIT_SHA=abc1234 scripts/deploy-tarball.sh             # versie voor /api/health (standaard de huidige commit)
#
# In de tarball:
# - .next: wat next start serveert, zonder .next/cache (de bouwcache), .next/types (alleen voor tsc) en .next/trace;
# - package.json en package-lock.json (npm ci --omit=dev in de image), next.config.js en public/ als die bestaat;
# - start.sh, tsconfig.json (de paden met @/ voor tsx) en migrations/ (scripts/migrate.ts leest die map);
# - scripts/migrate.ts en scripts/backup.ts met alle bronbestanden die ze importeren. Die lijst bepaalt esbuild, de
#   bundler die tsx zelf gebruikt, dus zonder tests, prive-mappen en broncode die alleen voor .next nodig was;
# - Dockerfile, captain-definition en .dockerignore;
# - een gegenereerde .env.production met alleen GIT_SHA (next start leest hem, /api/health toont de versie).
# Geen .env-bestanden uit de werkmap, geen data/, databases of back-ups; het script stopt als er toch zoiets in komt.
set -euo pipefail

hoofd="$(cd "$(dirname "$0")/.." && pwd)"
uit="${1:-$hoofd/deploy.tar}"
case "$uit" in /*) ;; *) uit="$PWD/$uit" ;; esac
cd "$hoofd"

fout() {
  echo "deploy-tarball: $*" >&2
  exit 1
}

[ -f .next/BUILD_ID ] || fout ".next/BUILD_ID ontbreekt. Draai eerst npm run build (de image bouwt niet zelf)."
[ -d node_modules/tsx ] || fout "node_modules/tsx ontbreekt. Draai eerst npm ci."

git_sha="${GIT_SHA:-$(git rev-parse --short=7 HEAD 2>/dev/null || echo onbekend)}"
printf '%s' "$git_sha" | grep -Eq '^[A-Za-z0-9._-]{1,64}$' || fout "GIT_SHA mag alleen letters, cijfers, punt, streep en liggend streepje bevatten."

werk="$(mktemp -d "${TMPDIR:-/tmp}/ibc-deploy.XXXXXX")"
trap 'rm -rf "$werk"' EXIT

# De bronbestanden van migrate.ts en backup.ts, zoals tsx ze in de container laadt. Pakketten uit node_modules blijven
# buiten de lijst; die moeten dan wel in dependencies staan, want de image installeert geen devDependencies.
node --input-type=commonjs -e '
const path = require("node:path")
const { builtinModules } = require("node:module")
const esbuild = require(require.resolve("esbuild", { paths: [path.resolve("node_modules/tsx")] }))
const r = esbuild.buildSync({
  entryPoints: ["scripts/migrate.ts", "scripts/backup.ts"],
  bundle: true, write: false, metafile: true, platform: "node", format: "esm",
  packages: "external", outdir: "uit", tsconfig: "tsconfig.json", logLevel: "silent",
})
if (r.warnings.length) {
  for (const w of r.warnings) console.error(`${w.location?.file ?? ""}: ${w.text}`)
  console.error("deploy-tarball: esbuild kan niet alle imports volgen; de lijst met bronbestanden is dan niet volledig.")
  process.exit(1)
}
const deps = new Set(Object.keys(require(path.resolve("package.json")).dependencies ?? {}))
const ingebouwd = new Set(builtinModules)
const missend = new Set()
for (const o of Object.values(r.metafile.outputs)) {
  for (const i of o.imports ?? []) {
    if (!i.external) continue
    const naam = i.path.startsWith("@") ? i.path.split("/").slice(0, 2).join("/") : i.path.split("/")[0]
    if (!i.path.startsWith("node:") && !ingebouwd.has(naam) && !deps.has(naam)) missend.add(naam)
  }
}
if (missend.size) {
  console.error(`deploy-tarball: scripts/migrate.ts of scripts/backup.ts gebruikt ${[...missend].join(", ")}, maar dat staat niet in dependencies.`)
  process.exit(1)
}
for (const f of Object.keys(r.metafile.inputs)) console.log(f)
' > "$werk/bronnen"

{
  find .next \( -path .next/cache -o -path .next/types -o -path .next/trace \) -prune -o -type f -print
  if [ -d public ]; then find public -type f; fi
  find migrations -type f
  printf '%s\n' package.json package-lock.json next.config.js start.sh tsconfig.json Dockerfile captain-definition .dockerignore
  cat "$werk/bronnen"
} | LC_ALL=C sort -u > "$werk/lijst"

while IFS= read -r f; do
  [ -f "$f" ] || fout "$f ontbreekt."
done < "$werk/lijst"

# Vangnet: dit hoort nooit in de image.
verboden='^(data|backups)/|(^|/)(__tests__|prive)/|\.spec\.[cm]?[jt]sx?$|(^|/)\.env|\.db(-wal|-shm|-journal)?$|\.ibcbak$|^\.next/cache/'
if grep -Eq "$verboden" "$werk/lijst"; then
  grep -E "$verboden" "$werk/lijst" >&2
  fout "deze bestanden horen niet in de tarball."
fi

printf 'GIT_SHA=%s\n' "$git_sha" > "$werk/.env.production"

# Op een Mac geen ._-bestanden en geen extended attributes in de tarball.
export COPYFILE_DISABLE=1
extra=()
if tar --version 2>/dev/null | grep -q bsdtar; then extra=(--no-mac-metadata --no-xattrs); fi
rm -f "$uit"
tar -cf "$uit" "${extra[@]+"${extra[@]}"}" --no-recursion -T "$werk/lijst"
tar -rf "$uit" "${extra[@]+"${extra[@]}"}" -C "$werk" .env.production

aantal="$(tar -tf "$uit" | wc -l | tr -d ' ')"
echo "deploy-tarball: $uit ($aantal bestanden, $(du -h "$uit" | cut -f1 | tr -d ' '), GIT_SHA=$git_sha)"
