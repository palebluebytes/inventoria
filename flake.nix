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
        { pkgs, ... }:
        let
          # One font world on every host, so a screenshot taken on a NixOS
          # workstation and one taken on an ubuntu-latest runner agree.
          #
          # The stock `makeFontsConf { fontDirectories = [ ]; }` that Playwright
          # defaults to is not the isolated set the empty list suggests: it still
          # reaches into /usr/share/fonts, /usr/local/share/fonts and
          # ~/.nix-profile/share/fonts, and includes the host's /etc/fonts/conf.d
          # for hinting and antialiasing rules. Ubuntu populates all of those and
          # NixOS populates none of them, so the same page rasterises differently
          # on each. Naming the directories explicitly and pointing the includes
          # at fontconfig's own in-store conf.d removes every host path.
          #
          # The emoji font is load-bearing, not a nicety: the sidebar renders
          # emoji on every screen the visual catalog captures, so without a
          # pinned one each host substitutes its own and all 14 snapshots differ.
          #
          # This arrives as FONTCONFIG_FILE in the shell rather than as the
          # `fontconfig_file` argument the browsers derivation appears to accept.
          # That argument is declared and then never read (driver.nix builds
          # `components.chromium` with its own hard-coded conf), so passing it
          # changes nothing — the store path comes out identical. The shell
          # export does work, because the Chromium wrapper sets FONTCONFIG_FILE
          # with `--set-default` and yields to an inherited value.
          fontsConfBase = pkgs.makeFontsConf {
            fontDirectories = [
              pkgs.dejavu_fonts
              pkgs.liberation_ttf # metric-compatible Arial/Times/Courier
              pkgs.noto-fonts-color-emoji
            ];
            impureFontDirectories = [ ];
            includes = [ "${pkgs.fontconfig.out}/etc/fonts/conf.d" ];
          };

          # `makeFontsConf` emits `<dir prefix="xdg">fonts</dir>` unconditionally,
          # and none of its arguments suppress it. That is ~/.local/share/fonts:
          # empty on a runner, and not empty on a workstation, which is the whole
          # divergence this is trying to close. Drop that one line.
          #
          # The xdg *cachedir* a few lines above it stays. It decides where
          # fontconfig writes its cache, not which fonts exist.
          fontsConf = pkgs.runCommand "fonts.conf" { } ''
            sed '/<dir prefix="xdg">fonts<\/dir>/d' ${fontsConfBase} > $out
            if grep -q 'prefix="xdg">fonts' $out; then
              echo "the xdg font dir survived the strip; check makeFontsConf output" >&2
              exit 1
            fi
          '';

          # Chromium alone: no Firefox, no WebKit, no chromium-headless-shell.
          # Every project in playwright.config.ts is Chromium (Desktop Chrome,
          # Pixel 5), and CI caches this closure on every push, so the unused
          # engines were 1.3GB paid for on each run.
          #
          # This is coupled to `channel: "chromium"` in playwright.config.ts, and
          # the two only work together. A headless run with no channel resolves
          # to chromium-headless-shell, which this omits, and the launch fails.
          # Restoring the shell, or adding a Firefox or WebKit project, means
          # `playwright-driver.selectBrowsers { ... }` with that engine left on,
          # and dropping the channel there.
          #
          playwrightBrowsers = pkgs.playwright-driver.browsers-chromium;

          # What it takes to install dependencies and drive the browser suite.
          # This is the whole of what CI needs, and the floor of what a
          # workstation needs. Keep it minimal: `.github/workflows/e2e.yml`
          # caches this closure on every push, so anything added here is paid
          # for on each run.
          coreTooling = with pkgs; [
            nodejs_latest
            pnpm
            playwright-driver
            playwrightBrowsers
          ];

          # ADR-0012: Playwright resolves its browsers out of the Nix store
          # rather than fetching them, so CI and a workstation drive the same
          # Chromium build. Both shells need this; neither works without it.
          playwrightEnv = ''
            export PLAYWRIGHT_BROWSERS_PATH=${playwrightBrowsers}
            export FONTCONFIG_FILE=${fontsConf}
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
            export PLAYWRIGHT_CLI_EXECUTABLE=${pkgs.playwright-driver}/bin/playwright
          '';
        in
        {
          # The shell you get from a bare `nix develop`: core tooling plus
          # everything an editor and a maintainer want on hand.
          devShells.default = pkgs.mkShell {
            packages =
              coreTooling
              ++ (with pkgs; [
                sqlite # CLI, for inspecting a ledger by hand
                gh # GitHub CLI (issue tracker operations)

                # Language servers (LSPs) for the project stack
                svelte-language-server # Svelte components
                typescript-language-server # TypeScript / JavaScript
                vscode-langservers-extracted # HTML, CSS, JSON, ESLint
                nil # Nix
                taplo # TOML (e.g. wrangler.toml)
                yaml-language-server # YAML
                bash-language-server # Bash (.husky hooks, shell scripts)
                marksman # Markdown (docs/, AGENTS.md, CONTEXT.md, ADRs)
              ]);

            shellHook = playwrightEnv + ''
              # `wrangler dev` runs the real workerd, which finds no CA bundle
              # on NixOS and fails every outbound HTTPS fetch with "unable to
              # get local issuer certificate". That surfaces as an opaque 500
              # from /api/proxy naming nothing about TLS, so it costs an hour
              # to diagnose twice. nixpkgs' bundle rather than /etc/ssl/certs,
              # so a non-NixOS host gets the same thing.
              export SSL_CERT_FILE="''${SSL_CERT_FILE:-${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt}"
              export NODE_EXTRA_CA_CERTS="''${NODE_EXTRA_CA_CERTS:-$SSL_CERT_FILE}"

              echo "=== Inventoria Dev Environment ==="
              echo "Node:   $(node --version)"
              echo "pnpm:   $(pnpm --version)"
              echo "SQLite: $(sqlite3 --version)"
              echo "LSPs:   svelte, typescript, css/html/json, nil, taplo, yaml, bash, marksman"
              echo "=================================="
            '';
          };

          # `nix develop .#ci` — core tooling only. No language servers, no
          # `gh`, no sqlite CLI: no workflow invokes them, and every one of them
          # would be fetched, cached, and restored on every push. No banner
          # either, so the logs carry test output rather than version numbers.
          devShells.ci = pkgs.mkShell {
            packages = coreTooling;
            shellHook = playwrightEnv;
          };
        };
    };
}
