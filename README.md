# lazymicrowave

Converts a package's microwave time to your microwave's wattage:

    your time = package time × (package watts ÷ your watts)

Enter your microwave's wattage once (it's remembered), then enter a package's wattage and time to see how long to cook. Save packages to come back to them later. Choose Auto, Light or Dark with the toggle at the top (Auto follows your system). Everything is stored in the browser's `localStorage`.

This is a Progressive Web App (PWA). It works in any modern browser.

## Things to know

- Data lives in the browser you use the app in. There is no sync between devices.
- Times are estimates. Stir if you can and make sure food is steaming hot all the way through.

## Develop

Needs Node 22.18 or newer and TypeScript.

    npm install                        # installs TypeScript (use `npm install -D typescript@latest` to bump it)
    npm test                           # unit tests (Node runs the .ts files directly)
    npm run typecheck                  # type-checks src/ and the service worker
    npm run build                      # compiles to dist/
    npm start                          # serves dist/ at http://127.0.0.1:8080

If you have [just](https://just.systems), the same tasks are `just install`, `just build`, `just clean`, `just lint` (the typecheck; there is no separate linter), `just test`, `just run` (builds, then serves), `just image` (builds the container image) and `just serve` (builds the image, then runs it).

Built and tested with TypeScript 7.0.2 and Node 22.22. There is no bundler: `tsc` compiles `src/` to plain ES modules and `scripts/build.mjs` copies `public/` next to them.

## Layout

    src/calc.ts        the conversion maths (pure functions, unit tested)
    src/storage.ts     localStorage-backed store for your wattage, saved packages and theme
    src/main.ts        the UI: reads the form, renders the result and the saved list
    src/sw.ts          service worker (offline support), compiled separately
    public/            index.html, styles.css, theme.js, manifest, icons
    deploy/nginx.conf  nginx config used by the container image
    Containerfile      two-stage image: build with Node, serve dist/ with nginx
    Justfile           build, clean, lint, test, run, image, serve
    scripts/build.mjs  build + generates dist/precache-manifest.js
    test/              unit tests for calc and storage
    .github/           GitHub Pages deploy workflow and Dependabot config
    LICENSE            MIT

The build hashes everything in `dist/` into the service worker's cache name. Any deploy that changes a file makes browsers fetch the new version and delete the old cache, so you never need to bump a version by hand.

## Publishing

Pushing to `main` deploys automatically: `.github/workflows/deploy.yml` typechecks, tests, builds, and publishes `dist/` to GitHub Pages. Enable it once under **Settings > Pages > Source: GitHub Actions**. The site is then at `https://ak9999.github.io/lazymicrowave/`.

## Container

The `Containerfile` is there for convenience, for hosting the app on a local NAS or home server. It builds the app in a Node stage and copies only `dist/` into an unprivileged nginx image (about 62 MB, port 8080):

    podman build -t lazymicrowave .
    podman run --rm -p 8080:8080 lazymicrowave

The nginx config marks `sw.js`, `precache-manifest.js`, `index.html` and the manifest `no-cache` so new deploys are picked up.

Service workers only run over HTTPS (or `localhost`), so offline support and installing the app need the container to be behind an HTTPS proxy.
