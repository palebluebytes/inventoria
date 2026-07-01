{
  description = "Inventoria";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
      ];

      perSystem =
        { config, pkgs, ... }:
        {
          devShells.default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_latest
              pnpm
              sqlite
              gh # GitHub CLI (issue tracker operations)
              playwright-driver
              playwright-driver.browsers

              # Language servers (LSPs) for the project stack
              svelte-language-server # Svelte components
              typescript-language-server # TypeScript / JavaScript
              vscode-langservers-extracted # HTML, CSS, JSON, ESLint
              nil # Nix
              taplo # TOML (e.g. wrangler.toml)
              yaml-language-server # YAML
              bash-language-server # Bash (.husky hooks, shell scripts)
              marksman # Markdown (docs/, AGENTS.md, CONTEXT.md, ADRs)
            ];

            shellHook = ''
              export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
              export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
              export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
              export PLAYWRIGHT_CLI_EXECUTABLE=${pkgs.playwright-driver}/bin/playwright
              
              echo "=== Inventoria Dev Environment ==="
              echo "Node:   $(node --version)"
              echo "pnpm:   $(pnpm --version)"
              echo "SQLite: $(sqlite3 --version)"
              echo "LSPs:   svelte, typescript, css/html/json, nil, taplo, yaml, bash, marksman"
              echo "=================================="
            '';
          };
        };
    };
}
