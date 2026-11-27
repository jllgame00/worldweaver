FROM node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f AS web
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY docs/project-v1.schema.json /src/docs/project-v1.schema.json
COPY frontend/ ./
RUN npm run build

FROM python:3.13.12-slim-bookworm@sha256:a58daefb915e1e03ad48f3ca4df8832065412c5c35cacb9d39f4229184de12b6
ARG REVISION
LABEL org.opencontainers.image.title="WORLDWEAVER" \
      org.opencontainers.image.source="https://github.com/jllgame00/worldweaver" \
      org.opencontainers.image.revision=$REVISION
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=10000 WORLDWEAVER_EXECUTION_MODE=public-demo
WORKDIR /app
COPY backend/requirements-runtime.txt /tmp/requirements.txt
RUN python -m pip install --no-cache-dir --no-deps --requirement /tmp/requirements.txt && python -m pip check
COPY backend/app/ backend/app/
COPY docs/project-v1.schema.json docs/project-v1.schema.json
COPY --from=web /src/frontend/dist/ frontend/dist/
RUN python -c "import re,sys,pathlib; s=sys.argv[1]; assert re.fullmatch('[0-9a-f]{40}',s); pathlib.Path('backend/app/release-sha').write_text(s,encoding='ascii')" "$REVISION"
USER 65532:65532
EXPOSE 10000
CMD ["sh","-c","exec python -m uvicorn backend.app.main:app --host 0.0.0.0 --port \"$PORT\" --no-proxy-headers --timeout-graceful-shutdown 20"]
