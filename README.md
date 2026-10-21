# lazymicrowave

Converts a package's microwave time to your microwave's wattage:

    your time = package time × (package watts ÷ your watts)

Enter your microwave's wattage once (it's remembered), then enter a package's wattage and time to see how long to cook. Save packages to come back to them later. Choose Auto, Light or Dark with the toggle at the top (Auto follows your system). Everything is stored in the browser's `localStorage`, works offline, and installs to the iPhone Home Screen as a PWA.

## Develop

Needs Node 22.18 or newer and TypeScript.

    npm install                        # installs TypeScript (use `npm install -D typescript@latest` to bump it)
    npm test                           # unit tests (Node runs the .ts files directly)
    npm run typecheck
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
    LICENSE            MIT
    scripts/build.mjs  build + generates dist/precache-manifest.js
    test/              unit tests for calc and storage

The build hashes everything in `dist/` into the service worker's cache name. Any deploy that changes a file makes browsers fetch the new version and delete the old cache, so you never need to bump a version by hand.

## Put it on your iPhone

Service workers only run over HTTPS (or `localhost`), so a phone can't use the dev server on your LAN. Host the contents of `dist/` on any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages). All paths are relative, so it also works from a subfolder like `https://you.github.io/lazymicrowave/`.

Pushing to `main` deploys automatically: `.github/workflows/deploy.yml` typechecks, tests, builds, and publishes `dist/` to GitHub Pages. Enable it once under **Settings > Pages > Source: GitHub Actions**. The site is then at `https://<user>.github.io/lazymicrowave/`.

Then, in Safari on the iPhone: Share, then **Add to Home Screen**.

Things to know:

- Data lives on that device only. There is no sync between devices.
- The Home Screen app and Safari have **separate** storage on iOS. Packages saved in a Safari tab won't appear in the installed app, so add it to the Home Screen first and use it from there.
- Clearing Safari's website data deletes saved packages and your theme choice.
- Times are estimates. Stir if you can and make sure food is steaming hot all the way through.

## Container

The `Containerfile` builds the app in a Node stage and copies only `dist/` into an unprivileged nginx image (about 62 MB, port 8080):

    podman build -t lazymicrowave .
    podman run --rm -p 8080:8080 lazymicrowave

The nginx config marks `sw.js`, `precache-manifest.js`, `index.html` and the manifest `no-cache` so new deploys are picked up. Put the container behind an HTTPS proxy or host to use it from a phone.
