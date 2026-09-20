#!/usr/bin/env bash
set -euo pipefail

source "$NVM_DIR/nvm.sh"
nvm install
nvm alias default "$(cat .nvmrc)"

export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME/bin:$PATH"
PNPM_VERSION="$(jq -r '.devEngines.packageManager.version | match("[0-9]+").string' package.json)"
curl -fsSL https://get.pnpm.io/install.sh | env \
  ENV="$HOME/.zshrc" \
  PNPM_VERSION="$PNPM_VERSION" \
  SHELL="$(command -v zsh)" \
  sh -

pnpm install
