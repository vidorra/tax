#!/usr/bin/env bash
# Rooktest van de Docker-image zoals CapRover hem bouwt en draait. De workflow in GitHub Actions
# (.github/workflows/deploy.yml) draait hem voor elke deploy op een Linux-runner: die maakt deploy.tar met
# scripts/deploy-tarball.sh, pakt hem uit, bouwt daaruit de image (linux/amd64, zoals de server) en roept dit script
# aan met ROOKTEST_BOUW=0 en ROOKTEST_IMAGE. Wie lokaal Docker heeft, kan het script ook alles zelf laten doen
# (npm run build, de tarball, de image); nodig is dat niet.
#
# Met de image start de test een container met een lege opslag als /app/data (de Persistent Directory) en controleert:
# - de image bevat .next zonder .next/cache, tsx en geen devDependencies, tests, prive-mappen, databases of
#   .env-bestanden (alleen de gegenereerde .env.production);
# - /api/health antwoordt met de versie uit de tarball (GIT_SHA in .env.production, of ROOKTEST_VERSIE) en
#   /dossier/setup/ toont het formulier (geen configuratie- of databasemelding);
# - het databasebestand staat in de gekoppelde opslag en is van node (ook als die eerst van root was), en de server
#   draait als node;
# - tsx werkt in de image (migreren als node);
# - een account met 2FA aanmaken lukt, scripts/backup.ts maakt en controleert een back-up in de container, en in een
#   nieuwe container met dezelfde map (een deploy) bestaat het account nog.
#
#   ROOKTEST_BOUW=0 ROOKTEST_IMAGE=<image> scripts/docker-rooktest.sh   # een bestaande image (zo draait de workflow)
#   ROOKTEST_VERSIE=abc1234                                      # deze versie verwachten in /api/health
#   ROOKTEST_PLATFORM=linux/amd64                                # platform van de image (docker build en docker run)
#   ROOKTEST_POORT=3999                                          # poort op 127.0.0.1 (standaard 3999)
#   ROOKTEST_OPSLAG=map                                          # een tijdelijke map op de host in plaats van een volume
#   scripts/docker-rooktest.sh                                   # lokaal: next build, tarball, image uit de tarball
#   ROOKTEST_NEXT_BUILD=0 scripts/docker-rooktest.sh             # lokaal, met de bestaande .next (geen npm run build)
#
# Standaard is /app/data een nieuw Docker-volume dat eerst van root wordt gemaakt, zoals een volume van CapRover of
# een map op de server. Met ROOKTEST_OPSLAG=map is het een tijdelijke map op de host; Docker Desktop op een Mac toont
# daarin geen echte eigenaar, dus daar slaat de test de eigenaarscontrole over.
#
# Nodig op de host: docker, curl, openssl en node. Gebruikt een verzonnen account en wegwerpsleutels; ruimt
# container, volume en mappen op. De image blijft staan (docker image rm <image>).
set -euo pipefail

hoofd="$(cd "$(dirname "$0")/.." && pwd)"
image="${ROOKTEST_IMAGE:-ibcalculator-rooktest}"
naam="ibcalculator-rooktest-$$"
poort="${ROOKTEST_POORT:-3999}"
platform="${ROOKTEST_PLATFORM:-}"
basis="http://127.0.0.1:$poort"
opslag="${ROOKTEST_OPSLAG:-volume}"
if [ "$opslag" = "map" ]; then
  data="$(mktemp -d "${TMPDIR:-/tmp}/ibc-rooktest-data.XXXXXX")"
else
  data="ibcalculator-rooktest-$$"
fi
werk="$(mktemp -d "${TMPDIR:-/tmp}/ibc-rooktest-werk.XXXXXX")"
auth_secret="$(openssl rand -hex 32)"
dossier_key="$(openssl rand -base64 32)"
email="rooktest@example.nl"
wachtwoord="rooktest-wachtwoord-$(openssl rand -hex 4)"

opruimen() {
  docker rm -f "$naam" >/dev/null 2>&1 || true
  if [ "$opslag" = "map" ]; then
    # De bestanden in de map kunnen van node (uid 1000) zijn; weggooien via een container.
    docker run --rm ${platform:+--platform "$platform"} -v "$data:/d" "$image" sh -c 'rm -rf /d/* /d/.[!.]* 2>/dev/null; true' >/dev/null 2>&1 || true
    rm -rf "$data" 2>/dev/null || true
  else
    docker volume rm "$data" >/dev/null 2>&1 || true
  fi
  rm -rf "$werk" 2>/dev/null || true
}
trap opruimen EXIT

mislukt() {
  echo "MISLUKT: $*" >&2
  echo "--- laatste regels van de container ---" >&2
  docker logs "$naam" 2>&1 | tail -40 >&2 || true
  exit 1
}
ok() { echo "ok: $*"; }

start_container() {
  docker run -d --name "$naam" ${platform:+--platform "$platform"} -p "127.0.0.1:$poort:3000" -v "$data:/app/data" \
    -e AUTH_SECRET="$auth_secret" -e DOSSIER_KEY="$dossier_key" -e NEXT_PUBLIC_SITE_URL="$basis" \
    "$image" >/dev/null
  for _ in $(seq 1 120); do
    if curl -fsS "$basis/api/health/" -o "$werk/health.json" 2>/dev/null; then return 0; fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$naam" 2>/dev/null)" != "true" ]; then mislukt "container is gestopt"; fi
    sleep 1
  done
  mislukt "/api/health antwoordt niet binnen 120 seconden"
}

if [ "${ROOKTEST_BOUW:-1}" = "1" ]; then
  if [ "${ROOKTEST_NEXT_BUILD:-1}" = "1" ]; then
    echo "npm run build (zoals de workflow)"
    (cd "$hoofd" && npm run build)
  fi
  "$hoofd/scripts/deploy-tarball.sh" "$werk/deploy.tar"
  mkdir "$werk/context"
  tar -xf "$werk/deploy.tar" -C "$werk/context"
  echo "Image bouwen uit de uitgepakte tarball${platform:+ ($platform)}"
  docker build ${platform:+--platform "$platform"} -t "$image" "$werk/context"
fi
docker image inspect "$image" >/dev/null 2>&1 || mislukt "image $image bestaat niet"

# De versie die /api/health moet tonen: ROOKTEST_VERSIE, anders GIT_SHA uit de .env.production in de image.
verwacht_sha="${ROOKTEST_VERSIE:-$(docker run --rm ${platform:+--platform "$platform"} --entrypoint sh "$image" -c 'sed -n "s/^GIT_SHA=//p" /app/.env.production 2>/dev/null' || true)}"

# De inhoud van de image, zonder de app te starten.
docker run --rm ${platform:+--platform "$platform"} --entrypoint sh "$image" -c '
  cd /app || exit 1
  fout=0
  meld() { echo "$1" >&2; fout=1; }
  [ -f .next/BUILD_ID ] || meld "geen .next/BUILD_ID"
  [ ! -e .next/cache ] || meld ".next/cache staat in de image"
  [ -x node_modules/.bin/tsx ] || meld "geen tsx in node_modules"
  for p in typescript vitest eslint drizzle-kit tailwindcss; do
    [ ! -e "node_modules/$p" ] || meld "devDependency $p staat in de image"
  done
  rest="$(find . -path ./node_modules -prune -o \( -name __tests__ -o -name prive -o -name "*.spec.ts" -o -name "*.db" -o -name "*.ibcbak" -o \( -name ".env*" ! -name .env.production \) \) -print)"
  [ -z "$rest" ] || meld "hoort niet in de image: $rest"
  [ ! -e .env.production ] || ! grep -Evq "^GIT_SHA=" .env.production || meld ".env.production bevat meer dan GIT_SHA"
  exit $fout
' || mislukt "de inhoud van de image klopt niet"
ok "inhoud van de image (.next zonder cache, tsx, geen devDependencies, tests of geheimen)"

if [ "$opslag" != "map" ]; then
  # Een leeg volume neemt bij de eerste start de map uit de image over (van node). Maak hem van root en niet leeg,
  # zoals een bestaand volume of een map op de server, zodat start.sh hem echt moet overdragen.
  docker volume create "$data" >/dev/null
  docker run --rm ${platform:+--platform "$platform"} -v "$data:/d" "$image" sh -c 'touch /d/.van-root && chown -R root:root /d && chmod 755 /d'
fi

echo "Container starten met lege opslag als /app/data ($opslag: $data)"
start_container
grep -q '"ok":true' "$werk/health.json" || mislukt "/api/health geeft geen ok"
if [ -n "$verwacht_sha" ]; then
  grep -q "\"versie\":\"$verwacht_sha\"" "$werk/health.json" || mislukt "/api/health toont niet versie $verwacht_sha: $(cat "$werk/health.json")"
  ok "/api/health (versie $verwacht_sha)"
else
  ok "/api/health"
fi

curl -fsSL "$basis/dossier/setup/" -o "$werk/setup.html" || mislukt "/dossier/setup/ geeft een fout"
grep -q 'nog niet ingericht' "$werk/setup.html" && mislukt "/dossier/setup/ toont de configuratiemelding"
grep -q 'niet bereikbaar' "$werk/setup.html" && mislukt "/dossier/setup/ toont een databasefout"
grep -q 'autoComplete="new-password"\|autocomplete="new-password"' "$werk/setup.html" || mislukt "/dossier/setup/ toont geen formulier"
ok "/dossier/setup/ toont het formulier"

docker exec "$naam" test -f /app/data/ibcalculator.db || mislukt "geen ibcalculator.db in /app/data"
if [ "$opslag" = "map" ]; then
  [ -f "$data/ibcalculator.db" ] || mislukt "geen ibcalculator.db in de map op de host"
fi
if [ "$opslag" = "map" ] && [ "$(uname -s)" = "Darwin" ]; then
  echo "let op: eigenaarscontrole overgeslagen (map op de host onder Docker Desktop)"
else
  eigenaar="$(docker exec "$naam" find /app/data -exec stat -c %U {} \; | sort -u | tr '\n' ' ')"
  [ "$eigenaar" = "node " ] || mislukt "bestanden in /app/data zijn van $eigenaar, niet alleen van node"
fi
uid1="$(docker exec "$naam" awk '/^Uid:/{print $2}' /proc/1/status)"
[ "$uid1" = "1000" ] || mislukt "de server draait als uid $uid1, niet als node (1000)"
ok "database in /app/data, van node; server draait als node"

docker exec -u node "$naam" npx --no-install tsx scripts/migrate.ts > "$werk/migrate.txt" 2>&1 || { cat "$werk/migrate.txt" >&2; mislukt "migreren met tsx als node"; }
grep -q 'geen nieuwe migraties' "$werk/migrate.txt" || { cat "$werk/migrate.txt" >&2; mislukt "migreren gaf iets anders dan 'geen nieuwe migraties'"; }
ok "tsx en migraties in de image (als node)"

curl -sS -D "$werk/setup-headers.txt" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"wachtwoord\":\"$wachtwoord\"}" "$basis/api/auth/setup/" -o "$werk/setup.json"
secret="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).secret??"")}catch{console.log("")}' < "$werk/setup.json")"
[ -n "$secret" ] || { cat "$werk/setup.json" >&2; mislukt "account aanmaken gaf geen TOTP-geheim"; }
cookie="$(grep -i '^set-cookie: ib-setup=' "$werk/setup-headers.txt" | head -1 | sed 's/^[^:]*: //; s/;.*//' | tr -d '\r')"
[ -n "$cookie" ] || mislukt "geen setup-cookie"
code="$(docker exec "$naam" node -e "const O=require('otpauth');console.log(new O.TOTP({algorithm:'SHA1',digits:6,period:30,secret:O.Secret.fromBase32(process.argv[1])}).generate())" "$secret")"
curl -sS -H 'Content-Type: application/json' -H "Cookie: $cookie" -d "{\"code\":\"$code\"}" "$basis/api/auth/setup/bevestig/" -o "$werk/bevestig.json"
grep -q '"ok":true' "$werk/bevestig.json" || { cat "$werk/bevestig.json" >&2; mislukt "2FA bevestigen"; }
ok "account met 2FA aangemaakt"

docker exec -u node "$naam" npx --no-install tsx scripts/backup.ts maak --uit /tmp/rooktest-backup > "$werk/backup.txt" 2>&1 || { cat "$werk/backup.txt" >&2; mislukt "back-up maken met scripts/backup.ts als node"; }
bestand="$(docker exec "$naam" sh -c 'ls /tmp/rooktest-backup/*.ibcbak' | head -1)"
[ -n "$bestand" ] || mislukt "scripts/backup.ts maak schreef geen .ibcbak"
docker exec -u node "$naam" npx --no-install tsx scripts/backup.ts bekijk "$bestand" > "$werk/bekijk.txt" 2>&1 || { cat "$werk/bekijk.txt" >&2; mislukt "back-up bekijken met scripts/backup.ts"; }
grep -q 'Rijen per tabel' "$werk/bekijk.txt" || { cat "$werk/bekijk.txt" >&2; mislukt "bekijk toont geen rijen per tabel"; }
ok "scripts/backup.ts in de image: back-up gemaakt en gecontroleerd"

echo "Nieuwe container met dezelfde datamap (zoals een deploy)"
docker rm -f "$naam" >/dev/null
start_container
docker logs "$naam" 2>&1 | grep -q 'geen nieuwe migraties' || mislukt "start.sh migreerde niet, of migreerde opnieuw"
aantal="$(docker exec -u node "$naam" node -e "const D=require('better-sqlite3');const d=new D('/app/data/ibcalculator.db',{readonly:true});console.log(d.prepare('SELECT count(*) AS n FROM users WHERE totp_enabled = 1').get().n)")"
[ "$aantal" = "1" ] || mislukt "na de nieuwe start $aantal accounts met 2FA, verwacht 1"
curl -fsSL "$basis/dossier/setup/" -o "$werk/setup2.html" || mislukt "/dossier/setup/ na de nieuwe start"
grep -q 'Er is al een account' "$werk/setup2.html" || mislukt "/dossier/setup/ zegt na de nieuwe start niet dat er al een account is"
ok "account bestaat nog na een nieuwe container"

echo "Rooktest geslaagd."
