# Deze image bouwt de app niet. De kant-en-klare .next komt mee in deploy.tar: GitHub Actions draait npm ci, de tests
# en next build en maakt de tarball met scripts/deploy-tarball.sh (zie .github/workflows/deploy.yml). De server heeft
# te weinig geheugen voor npm ci met devDependencies en next build; hier komen alleen de productie-afhankelijkheden bij.

# ---- Productie-afhankelijkheden ----
FROM node:20-alpine AS deps
# python3, make en g++ voor better-sqlite3 (native). npm ci haalt meestal een kant-en-klare binary voor linux-musl op;
# lukt dat niet, dan bouwt node-gyp hem hiermee. Deze stage gaat niet mee in de image.
RUN apk add --no-cache python3 make g++
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# Alleen dependencies, met tsx (start.sh en scripts/backup.ts draaien ermee). Daarna controleren dat better-sqlite3
# laadt en tsx er is, zodat een kapotte install hier faalt en niet pas bij de start van de container.
RUN npm ci --omit=dev --no-audit --no-fund \
 && node -e "new (require('better-sqlite3'))(':memory:').close()" \
 && test -x node_modules/.bin/tsx

# ---- Runner ----
FROM node:20-alpine AS runner
# su-exec: start.sh geeft als root de datamap aan de gebruiker node en draait de app daarna als node.
RUN apk add --no-cache tzdata su-exec
ENV TZ=Europe/Amsterdam
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Het SQLite-bestand. /app/data is in CapRover een Persistent Directory; zonder die map is de database na de
# volgende deploy weg.
ENV DATABASE_PATH=/app/data/ibcalculator.db
WORKDIR /app
# node_modules uit de deps-stage (zelfde basisimage), dus de runner heeft geen bouwtools nodig. Eerst, zodat Docker
# deze laag hergebruikt zolang package-lock.json niet verandert.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
# De inhoud van deploy.tar: .next, start.sh, migraties, de scripts en hun bronbestanden (.dockerignore houdt
# node_modules, .next/cache en gegevens buiten de image).
COPY --chown=node:node . .
RUN if [ ! -f .next/BUILD_ID ]; then \
      echo "FOUT: .next/BUILD_ID ontbreekt. Deze image bouwt de app niet zelf: bouw met npm run build en maak de" >&2; \
      echo "context met scripts/deploy-tarball.sh (dat doet de workflow in GitHub Actions bij een push naar main)." >&2; \
      exit 1; \
    fi \
 && if [ -e .env.production ] && grep -Evq '^GIT_SHA=[A-Za-z0-9._-]*$' .env.production; then \
      echo "FOUT: .env.production bevat meer dan GIT_SHA. Geheimen horen in de omgeving van CapRover, niet in de image." >&2; \
      exit 1; \
    fi \
 && mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data && chmod +x /app/start.sh
VOLUME /app/data
EXPOSE 3000
CMD [ "/app/start.sh" ]
