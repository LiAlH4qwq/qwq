# Derive the rendered config path, server URL and GUI environment from
# `services.qwq`, shared by the NixOS and Home Manager modules.
{ lib, pkgs }:
{ cfg }:
let
  voiceSettings = cfg.voice.settings // (
    lib.optionalAttrs (cfg.voice.power != null) { power = cfg.voice.power; }
  );

  settings =
    if cfg.voice.enable then
      lib.recursiveUpdate cfg.settings { voice = voiceSettings; }
    else
      cfg.settings;

  rendered = (pkgs.formats.yaml { }).generate "qwq.yaml" settings;
  configPath = if cfg.configFile != null then cfg.configFile else rendered;

  server = settings.server or { };
  host = server.host or "127.0.0.1";
  port = server.port or 8787;
  serverUrl = "ws://${host}:${toString port}";

  gui = settings.gui or { };
  guiEnv = [
    "QWQ_SERVER=${serverUrl}"
    "QWQ_GUI_POPUP_MS=${toString (gui.popupDurationMs or 10000)}"
    "QWQ_GUI_THEME=${gui.theme or "light"}"
    "QWQ_GUI_POPUP=${gui.popup or "voice"}"
  ];
in
{
  inherit configPath serverUrl guiEnv;
}
