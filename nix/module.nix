# NixOS module: `services.qwq`.
#
# - `server` runs as a system service (`systemd.services.qwq`).
# - `voice` and `gui` run as user services attached to the graphical session
#   (they need the user's audio server / display).
# - `cli`, `tui` and `gui` are added to `environment.systemPackages`; `gui` also
#   installs a desktop entry.
{ withSystem }:
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.qwq;
  settings = import ./settings.nix { inherit lib pkgs; } { inherit cfg; };

  voicePath = lib.makeBinPath (
    [
      cfg.voice.kwsPackage
      pkgs.sherpa-onnx
      pkgs.piper-tts
      pkgs.pipewire
    ]
    ++ [ pkgs.bash ]
  );

  desktopItem = pkgs.makeDesktopItem {
    name = "qwq-gui";
    desktopName = "qwq";
    comment = "qwq 桌面前端";
    exec = "env ${lib.concatStringsSep " " settings.guiEnv} ${cfg.gui.package}/bin/qwq-gui";
    icon = "utilities-terminal";
    categories = [ "Utility" ];
    type = "Application";
  };
in
{
  imports = [ (import ./options.nix { inherit withSystem; }) ];

  config = lib.mkIf cfg.enable {
    systemd.services.qwq = lib.mkIf cfg.server.enable {
      description = "qwq - a local-first AI companion server";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];

      serviceConfig = {
        ExecStart = "${cfg.package}/bin/qwq serve --config ${settings.configPath}";
        Restart = "on-failure";
        DynamicUser = true;
        StateDirectory = "qwq";
        WorkingDirectory = "/var/lib/qwq";
        EnvironmentFile = lib.mkIf (cfg.environmentFile != null) [
          cfg.environmentFile
        ];
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        NoNewPrivileges = true;
        RestrictAddressFamilies = [
          "AF_INET"
          "AF_INET6"
          "AF_UNIX"
          "AF_NETLINK"
        ];
      };
    };

    systemd.user.services.qwq-voice = lib.mkIf cfg.voice.enable {
      description = "qwq - Chinese voice frontend";
      after = [ "graphical-session.target" ];
      partOf = [ "graphical-session.target" ];
      wantedBy = [ "graphical-session.target" ];
      serviceConfig = {
        ExecStart = "${cfg.voice.package}/bin/qwq-voice --config ${settings.configPath}";
        Restart = "on-failure";
        Environment = [ "PATH=${voicePath}" ];
      };
    };

    systemd.user.services.qwq-gui = lib.mkIf cfg.gui.enable {
      description = "qwq - Electron desktop frontend";
      after = [ "graphical-session.target" ];
      partOf = [ "graphical-session.target" ];
      wantedBy = [ "graphical-session.target" ];
      serviceConfig = {
        ExecStart = "${cfg.gui.package}/bin/qwq-gui";
        Restart = "on-failure";
        Environment = settings.guiEnv;
      };
    };

    environment.systemPackages =
      (lib.optional cfg.cli.enable cfg.cli.package)
      ++ (lib.optional cfg.tui.enable cfg.tui.package)
      ++ (lib.optional cfg.gui.enable cfg.gui.package)
      ++ (lib.optional cfg.gui.enable desktopItem);
  };
}
