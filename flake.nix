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
            ];

            shellHook = ''
              echo "=== Inventoria Dev Environment ==="
              echo "Node:   $(node --version)"
              echo "pnpm:   $(pnpm --version)"
              echo "SQLite: $(sqlite3 --version)"
              echo "=================================="
            '';
          };
        };
    };
}
