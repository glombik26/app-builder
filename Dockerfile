FROM node:24-alpine

RUN apk add --no-cache git curl ca-certificates \
  && curl -fsSL -o /usr/local/bin/grok https://x.ai/cli/grok-1.0.5-linux-x86_64 \
  && chmod +x /usr/local/bin/grok

WORKDIR /app
COPY src ./src

ENV PLATFORM_HOME=/var/lib/app-builder
ENV PLATFORM_HOST=0.0.0.0
ENV PLATFORM_PORT=3847
ENV GROK_HOME=/root/.grok

EXPOSE 3847

CMD ["node", "src/main.ts"]
