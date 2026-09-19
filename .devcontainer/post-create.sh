#!/usr/bin/env bash
set -euo pipefail

source "$NVM_DIR/nvm.sh"
nvm install
nvm alias default "$(cat .nvmrc)"

export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME/bin:$PATH"
curl -fsSL https://get.pnpm.io/install.sh | env \
  ENV="$HOME/.zshrc" \
  PNPM_VERSION="$(jq -r '.devEngines.packageManager.version' package.json)" \
  SHELL="$(command -v zsh)" \
  sh -

pnpm install --frozen-lockfile
