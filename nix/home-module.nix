# Home Manager module: `services.qwq`.
#
# All three long-running components are user services: the server
# (`systemd.user.services.qwq`), the voice frontend and the GUI. `cli`, `tui`
# and `gui` are added to `home.packages`; `gui` also installs a desktop entry.
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
    systemd.user.services.qwq = lib.mkIf cfg.server.enable {
      Unit = {
        Description = "qwq - a local-first AI companion server";
        After = [ "network-online.target" ];
      };
      Service = {
        ExecStart = "${cfg.package}/bin/qwq serve --config ${settings.configPath}";
        Restart = "on-failure";
        WorkingDirectory = "%h";
        EnvironmentFile = lib.mkIf (cfg.environmentFile != null) [
          cfg.environmentFile
        ];
      };
      Install.WantedBy = [ "default.target" ];
    };

    systemd.user.services.qwq-voice = lib.mkIf cfg.voice.enable {
      Unit = {
        Description = "qwq - Chinese voice frontend";
        After = [ "qwq.service" "graphical-session.target" ];
        Requires = [ "qwq.service" ];
        PartOf = [ "graphical-session.target" ];
      };
      Service = {
        ExecStart = "${cfg.voice.package}/bin/qwq-voice --config ${settings.configPath}";
        Restart = "on-failure";
        WorkingDirectory = "%h";
        Environment = [ "PATH=${voicePath}" ];
      };
      Install.WantedBy = [ "graphical-session.target" ];
    };

    systemd.user.services.qwq-gui = lib.mkIf cfg.gui.enable {
      Unit = {
        Description = "qwq - Electron desktop frontend";
        After = [ "qwq.service" "graphical-session.target" ];
        Requires = [ "qwq.service" ];
        PartOf = [ "graphical-session.target" ];
      };
      Service = {
        ExecStart = "${cfg.gui.package}/bin/qwq-gui";
        Restart = "on-failure";
        Environment = settings.guiEnv;
      };
      Install.WantedBy = [ "graphical-session.target" ];
    };

    home.packages =
      (lib.optional cfg.cli.enable cfg.cli.package)
      ++ (lib.optional cfg.tui.enable cfg.tui.package)
      ++ (lib.optional cfg.gui.enable cfg.gui.package)
      ++ (lib.optional cfg.gui.enable desktopItem);
  };
}
