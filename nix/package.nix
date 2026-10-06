{
  lib,
  stdenv,
  fetchPnpmDeps,
  pnpmConfigHook,
  pnpmBuildHook,
  makeWrapper,
  nodejs,
  pnpm,
  root,
}:

let
  # `fetchPnpmDeps` runs `pnpm install --force`, fetching dependencies for every
  # platform, so its output is usually identical across systems and `default`
  # covers them.
  #
  # To regenerate: set the value to `lib.fakeHash`, run `nix build .#qwq`, and
  # copy the `got: sha256-…` value. Redo this whenever the pnpm major changes,
  # since its store format is not stable across majors.
  pnpmDepsHashes = {
    default = "sha256-qM4Nrm7Rb6u7tfr4idva/MZyLSB1GXzFJI5ELZQY/ds=";
  };

  system = stdenv.hostPlatform.system;

  pnpmDepsHash = pnpmDepsHashes.${system} or pnpmDepsHashes.default;

  # Single source of truth for the version: the root package.json.
  version = (builtins.fromJSON (builtins.readFile (root + "/package.json"))).version;
in

stdenv.mkDerivation (finalAttrs: {
  pname = "qwq";
  inherit version;

  src = lib.cleanSourceWith {
    src = root;
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
    # The fetcher downloads every platform's optional dependency; keep the
    # concurrency low and the retries high so a flaky connection still finishes.
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

  pnpmBuildScript = "build";

  env.CI = "true";

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/qwq $out/bin

    for spec in server:qwq command:qwq-command cli:qwq-cli tui:qwq-tui voice:qwq-voice; do
      pkg="''${spec%%:*}"
      bin="''${spec##*:}"
      cp packages/$pkg/dist/$bin.js $out/lib/qwq/
      if [ -f packages/$pkg/dist/$bin.js.map ]; then
        cp packages/$pkg/dist/$bin.js.map $out/lib/qwq/
      fi
    done

    for bin in qwq qwq-command qwq-cli qwq-tui qwq-voice; do
      makeWrapper ${lib.getExe' nodejs "node"} $out/bin/$bin \
        --add-flags "$out/lib/qwq/$bin.js"
    done

    runHook postInstall
  '';

  meta = {
    description = "A local-first AI companion server with CLI and Chinese voice frontends";
    license = lib.licenses.mit;
    mainProgram = "qwq";
    platforms = lib.platforms.linux;
  };
})
