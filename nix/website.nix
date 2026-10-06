{
  perSystem =
    { pkgs, ... }:
    let
      landing = pkgs.writeText "index.html" ''
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>qwq</title>
            <style>
              :root { color-scheme: light dark; }
              body {
                margin: 0;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
                align-items: center;
                justify-content: center;
                font-family: system-ui, sans-serif;
              }
              h1 { margin: 0; font-size: 2.5rem; }
              p { margin: 0; opacity: 0.75; }
              nav { display: flex; gap: 1rem; }
              a {
                padding: 0.6rem 1.2rem;
                border: 1px solid currentColor;
                border-radius: 0.5rem;
                text-decoration: none;
                color: inherit;
              }
            </style>
          </head>
          <body>
            <h1>qwq</h1>
            <p>A local-first AI companion with CLI and Chinese voice frontends</p>
            <nav>
              <a href="en/">English</a>
              <a href="zh/">&#x7B80;&#x4F53;&#x4E2D;&#x6587;</a>
            </nav>
          </body>
        </html>
      '';
    in
    {
      packages.website =
        pkgs.runCommandLocal "qwq-website"
          {
            nativeBuildInputs = [ pkgs.mdbook ];
          }
          ''
            mdbook build ${../docs} -d $out/en
            mdbook build ${../docs}/zh -d $out/zh
            cp ${landing} $out/index.html
          '';
    };
}
