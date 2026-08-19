FROM node:24-alpine

WORKDIR /app
COPY src ./src

ENV PLATFORM_HOME=/var/lib/app-builder
ENV PLATFORM_HOST=0.0.0.0
ENV PLATFORM_PORT=3847

EXPOSE 3847

CMD ["node", "src/main.ts"]
