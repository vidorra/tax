# ---- Builder ----
FROM node:20-alpine AS builder
# python3, make en g++ voor better-sqlite3 (native). npm ci haalt meestal een kant-en-klare binary voor
# linux-musl op; lukt dat niet, dan bouwt node-gyp hem hiermee.
RUN apk add --no-cache python3 make g++ tzdata
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_UMAMI_SRC
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_UMAMI_SRC=$NEXT_PUBLIC_UMAMI_SRC
ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npm run build
# Alleen de productie-afhankelijkheden blijven over, met de gebouwde better-sqlite3 en tsx (start.sh en
# scripts/backup.ts draaien met tsx).
RUN npm prune --omit=dev && rm -rf .next/cache

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
# node_modules komt uit de builder (zelfde basisimage), dus better-sqlite3 wordt hier niet opnieuw gebouwd en de
# runner heeft geen bouwtools nodig.
COPY --from=builder --chown=node:node /app ./
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data && chmod +x /app/start.sh
VOLUME /app/data
EXPOSE 3000
CMD [ "/app/start.sh" ]
