#!/usr/bin/env bash
# Rooktest van de Docker-image zoals CapRover hem draait: bouwen, starten met een lege opslag als /app/data (de
# Persistent Directory) en dan controleren:
# - /api/health antwoordt en /dossier/setup/ toont het formulier (geen configuratie- of databasemelding);
# - het databasebestand staat in de gekoppelde opslag en is van node (ook als die eerst van root was), en de server
#   draait als node;
# - tsx werkt in de image (migreren als node);
# - een account met 2FA aanmaken lukt, en in een nieuwe container met dezelfde map (een deploy) bestaat het nog.
#
#   scripts/docker-rooktest.sh                                   # bouwt de image uit deze werkmap
#   ROOKTEST_PLATFORM=linux/amd64 scripts/docker-rooktest.sh     # als op de server (x86), op een Mac via emulatie
#   ROOKTEST_BOUW=0 ROOKTEST_IMAGE=<image> scripts/docker-rooktest.sh   # een bestaande image
#   ROOKTEST_POORT=3999                                          # poort op 127.0.0.1 (standaard 3999)
#   ROOKTEST_OPSLAG=map                                          # een tijdelijke map op de host in plaats van een volume
#
# Standaard is /app/data een nieuw Docker-volume dat eerst van root wordt gemaakt, zoals een volume van CapRover of
# een map op de server. Met ROOKTEST_OPSLAG=map is het een tijdelijke map op de host; Docker Desktop op een Mac toont
# daarin geen echte eigenaar, dus daar slaat de test de eigenaarscontrole over.
#
# Gebruikt een verzonnen account en wegwerpsleutels; ruimt container en mappen op.
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
  docker build ${platform:+--platform "$platform"} -t "$image" "$hoofd"
fi

if [ "$opslag" != "map" ]; then
  # Een leeg volume neemt bij de eerste start de map uit de image over (van node). Maak hem van root en niet leeg,
  # zoals een bestaand volume of een map op de server, zodat start.sh hem echt moet overdragen.
  docker volume create "$data" >/dev/null
  docker run --rm ${platform:+--platform "$platform"} -v "$data:/d" "$image" sh -c 'touch /d/.van-root && chown -R root:root /d && chmod 755 /d'
fi

echo "Container starten met lege opslag als /app/data ($opslag: $data)"
start_container
grep -q '"ok":true' "$werk/health.json" || mislukt "/api/health geeft geen ok"
ok "/api/health"

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
