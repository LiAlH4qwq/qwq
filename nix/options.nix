# Shared `services.qwq` options for the NixOS and Home Manager modules.
{ withSystem }:
{
  lib,
  pkgs,
  ...
}:
let
  packageOf =
    name: defaultText:
    lib.mkOption {
      type = lib.types.package;
      default = withSystem pkgs.stdenv.hostPlatform.system (
        ps: ps.config.packages.${name}
      );
      defaultText = lib.literalExpression defaultText;
      description = "The ${name} package to use.";
    };
in
{
  options.services.qwq = {
    enable = lib.mkEnableOption "qwq, a local-first AI companion";

    package = packageOf "qwq" "pkgs.qwq";

    settings = lib.mkOption {
      type = lib.types.attrs;
      default = { };
      description = ''
        qwq configuration, rendered to YAML. `api`, `sessions`, `envAccess` and
        `server` are the fields documented in config.example.yaml.
      '';
    };

    configFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Path to an existing YAML configuration file; overrides `settings`.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = ''
        Environment file used to resolve `api.keyEnv` and keep API tokens out
        of the Nix store.
      '';
    };

    server = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Run the qwq server as a systemd service.";
      };
    };

    voice = {
      enable = lib.mkEnableOption "the voice frontend (requires a session audio server)";

      package = packageOf "qwq-voice" "pkgs.qwq-voice";

      kwsPackage = packageOf "qwq-kws" "pkgs.qwq-kws";

      settings = lib.mkOption {
        type = lib.types.attrs;
        default = { };
        description = ''
          Voice configuration merged into the generated configuration file under
          the `voice` key. `wakeWord.modelDir`, `wakeWord.keywordsFile` and
          `asr.modelDir` must point at models available on the host.
        '';
      };

      power = lib.mkOption {
        type = lib.types.nullOr (
          lib.types.enum [
            "battery"
            "balanced"
            "performance"
          ]
        );
        default = null;
        description = ''
          Voice power profile written under `voice.power`. `null` leaves
          `settings` untouched. When running on battery the frontend forces
          `battery` at runtime regardless (see docs/performance.md).
        '';
      };
    };

    gui = {
      enable = lib.mkEnableOption "the Electron desktop frontend (service + desktop entry)";

      package = packageOf "qwq-gui" "pkgs.qwq-gui";
    };

    cli = {
      enable = lib.mkEnableOption "the qwq CLI, added to PATH";

      package = packageOf "qwq-cli" "pkgs.qwq-cli";
    };

    tui = {
      enable = lib.mkEnableOption "the qwq TUI, added to PATH";

      package = packageOf "qwq-tui" "pkgs.qwq-tui";
    };
  };
}
