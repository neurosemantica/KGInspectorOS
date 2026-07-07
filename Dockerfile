FROM node:22-alpine AS frontend

WORKDIR /build
COPY src/frontend/package.json src/frontend/package-lock.json ./
RUN npm ci --ignore-scripts

COPY src/frontend/ ./
ENV VITE_API_URL=""
RUN npm run build

FROM python:3.12-slim AS runtime

LABEL org.opencontainers.image.title="KGInspector" \
      org.opencontainers.image.description="Semantic diff engine for RDF Knowledge Graphs" \
      org.opencontainers.image.source="https://github.com/neurosemantica/KGInspectorOS"

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

COPY requirements.txt ./
RUN uv pip install --system --no-cache -r requirements.txt

COPY src/ src/
COPY --from=frontend /build/dist src/frontend/dist/

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER app

ENV PORT=8000
ENV WORKERS=4
EXPOSE 8000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["serve"]
