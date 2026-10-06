{
  description = "qwq - a local-first AI companion server with CLI and Chinese voice frontends";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";
    systems.url = "github:nix-systems/default";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } (
      {
        config,
        withSystem,
        ...
      }:
      {
        systems = import inputs.systems;

        imports = [
          # Development tooling (workflow generation, git hooks, the website)
          # lives in the `dev` partition so it never reaches a consumer's lock
          # file. See `dev/flake.nix`.
          inputs.flake-parts.flakeModules.partitions
          ./nix/website.nix
        ];

        partitionedAttrs = {
          devShells = "dev";
          apps = "dev";
          checks = "dev";
        };

        partitions.dev = {
          extraInputsFlake = ./dev;
          module.imports = [ ./dev/flake-module.nix ];
        };

        perSystem =
          {
            config,
            pkgs,
            root,
            ...
          }:
          let
            qwq = pkgs.callPackage (root + "/nix/package.nix") {
              nodejs = pkgs.nodejs_26 or pkgs.nodejs;
              # Pin the pnpm major: its store format changes between majors,
              # which changes the fetchPnpmDeps hash. See nix/package.nix.
              pnpm = pkgs.pnpm_12 or pkgs.pnpm;
              inherit root;
            };

            # A single pnpm/rolldown build produces every Node bundle; per
            # component packages just expose one binary from it, so the pnpm
            # dependencies are fetched once.
            client =
              { pname, bin }:
              pkgs.runCommand pname { } ''
                mkdir -p $out/bin $out/lib
                ln -s ${qwq}/lib/qwq $out/lib/qwq
                ln -s ${qwq}/bin/${bin} $out/bin/${bin}
              '';
          in
          {
            # The repository root, injected through the module system so
            # package.nix can reach files without relying on `self`.
            _module.args.root = ./.;

            packages.qwq = qwq;
            packages.default = config.packages.qwq;

            packages.qwq-cli = client {
              pname = "qwq-cli";
              bin = "qwq-cli";
            };
            packages.qwq-tui = client {
              pname = "qwq-tui";
              bin = "qwq-tui";
            };
            packages.qwq-voice = client {
              pname = "qwq-voice";
              bin = "qwq-voice";
            };
            packages.qwq-command = client {
              pname = "qwq-command";
              bin = "qwq-command";
            };

            # The thin Python streaming keyword-spotter worker.
            packages.qwq-kws = pkgs.callPackage (root + "/nix/python.nix") { };

            # The Electron desktop frontend.
            packages.qwq-gui = pkgs.callPackage (root + "/nix/gui.nix") {
              src = root;
            };

            formatter = pkgs.nixfmt;
          };

        flake.overlays.qwq = final: _prev: {
          qwq = withSystem final.stdenv.hostPlatform.system (
            ps: ps.config.packages.qwq
          );
          qwq-cli = withSystem final.stdenv.hostPlatform.system (
            ps: ps.config.packages.qwq-cli
          );
          qwq-tui = withSystem final.stdenv.hostPlatform.system (
            ps: ps.config.packages.qwq-tui
          );
          qwq-voice = withSystem final.stdenv.hostPlatform.system (
            ps: ps.config.packages.qwq-voice
          );
          qwq-command = withSystem final.stdenv.hostPlatform.system (
            ps: ps.config.packages.qwq-command
          );
          qwq-kws = withSystem final.stdenv.hostPlatform.system (
            ps: ps.config.packages.qwq-kws
          );
          qwq-gui = withSystem final.stdenv.hostPlatform.system (
            ps: ps.config.packages.qwq-gui
          );
        };

        flake.overlays.default = config.flake.overlays.qwq;

        flake.nixosModules.qwq = (import ./nix/module.nix) { inherit withSystem; };
        flake.nixosModules.default = config.flake.nixosModules.qwq;

        flake.homeModules.qwq = (import ./nix/home-module.nix) { inherit withSystem; };
        flake.homeModules.default = config.flake.homeModules.qwq;
      }
    );
}
