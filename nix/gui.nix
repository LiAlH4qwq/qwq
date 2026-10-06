{
  lib,
  stdenv,
  fetchPnpmDeps,
  pnpmConfigHook,
  pnpmBuildHook,
  makeWrapper,
  nodejs,
  pnpm,
  electron,
  src,
}:

let
  # Same pnpm store as the main package; see nix/package.nix.
  pnpmDepsHash = "sha256-qM4Nrm7Rb6u7tfr4idva/MZyLSB1GXzFJI5ELZQY/ds=";

  version = (builtins.fromJSON (builtins.readFile (src + "/package.json"))).version;
in

stdenv.mkDerivation (finalAttrs: {
  pname = "qwq-gui";
  inherit version;

  src = lib.cleanSourceWith {
    src = src;
    filter =
      path: _type:
      !(builtins.elem (baseNameOf (toString path)) [
        "node_modules"
        "dist"
        "result"
        ".direnv"
        ".pnpm-store"
      ]);
  };

  __structuredAttrs = true;
  strictDeps = true;

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 4;
    hash = pnpmDepsHash;
    prePnpmInstall = ''
      pnpm config set fetch-retries 20
      pnpm config set fetch-retry-mintimeout 2000
      pnpm config set fetch-retry-maxtimeout 30000
      pnpm config set fetch-timeout 600000
      pnpm config set network-concurrency 2
    '';
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
    pnpmBuildHook
    makeWrapper
  ];

  pnpmBuildScript = "build:gui";

  env.CI = "true";

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/qwq-gui $out/bin
    cp -r packages/gui/dist packages/gui/index.html packages/gui/package.json $out/lib/qwq-gui/

    makeWrapper ${lib.getExe electron} $out/bin/qwq-gui \
      --add-flags "$out/lib/qwq-gui"

    runHook postInstall
  '';

  meta = {
    description = "Electron desktop frontend for qwq (reply popup and chat)";
    license = lib.licenses.mit;
    mainProgram = "qwq-gui";
    platforms = lib.platforms.linux;
  };
})
