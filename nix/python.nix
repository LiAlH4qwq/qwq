{ writers, python3Packages }:

# The thin Python streaming keyword-spotter worker. It is the only Python in
# the project; everything else is TypeScript.
writers.writePython3Bin "qwq-kws"
  {
    libraries = [
      python3Packages.sherpa-onnx
      python3Packages.numpy
    ];
    # The worker is a long-form documented script; keep the writer's linter
    # quiet about line length and module-docstring style.
    flakeIgnore = [
      "E265"
      "E501"
    ];
  }
  (builtins.readFile ../python/qwq_kws_worker.py)
