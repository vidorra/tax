# ---- Builder ----
FROM node:20-alpine AS builder
RUN apk add --no-cache tzdata
WORKDIR /app
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
RUN rm -rf node_modules .next/cache

# ---- Runner ----
FROM node:20-alpine AS runner
RUN apk add --no-cache tzdata
ENV TZ=Europe/Amsterdam
WORKDIR /app
COPY --from=builder /app ./
RUN npm ci --omit=dev && npm install --no-save tsx
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN chmod +x /app/start.sh
CMD [ "/app/start.sh" ]
