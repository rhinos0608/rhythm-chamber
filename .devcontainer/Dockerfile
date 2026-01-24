FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# Optional: useful baseline tooling
RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*
