# Repository commands

Use the recipes in the `justfile` for project commands, including installation, formatting,
linting, type-checking, testing, compilation, and publishing. Do not invoke `pnpm` directly unless
there is no applicable Justfile recipe.

Before sending a final response for a completed change, run `just ready` and require it to pass.

# Environment

Work inside the devcontainer. It pins Node and installs the pnpm major version from `package.json`,
so the toolchain always matches the project and the host's own versions never come into it. The
workspace is mounted at the same path as on the host.
