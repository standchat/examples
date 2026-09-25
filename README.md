# Stand Chat examples

Small, working examples of integrating [Stand Chat](https://stand.chat/). Browse them at **https://examples.stand.chat/**.

Each example is one folder of plain HTML, CSS and JavaScript, with no build step and no framework. The folder name is the URL: `stand-card/` is served at `https://examples.stand.chat/stand-card/`.

## Run locally

```sh
npm start
```

This builds the example list and serves the site at http://localhost:3000. It needs Node 18 or newer and installs nothing.

The examples load Stand with `data-stand-id="demo"`, Stand Chat's shared demo site. It answers on any domain, including localhost, through Stand Chat's demo Stand-in. The status pill in each example's top bar shows what Stand sees. Add `?preview` to a URL to show hidden Stand elements while you work on layout.

## Copy an example

```sh
npx degit standchat/examples/stand-card my-stand-card
```

Then replace its Stand `<script>` tag with the installation snippet from **Sites** in Stand, which carries your own Site ID.

## How the site works

- `index.html` is the front page. It lists `examples.json`, which `build.mjs` generates from each example's `<head>`.
- `_shared/` holds the example pages' top bar and "How it works" styles. The examples work without it.
- `_template/` is the starting point for a new example. See [CONTRIBUTING.md](CONTRIBUTING.md).
- Social images (`og.png`) are committed. The build only checks that they are 1200×630; it never regenerates them. To recapture with Chrome, run `npm run og` for all of them or `npm run og -- <folder>` for one (`og.mjs`).
- Vercel runs `node build.mjs` and serves the repository as it is (`vercel.json`).

## License

Public domain under the [Unlicense](LICENSE). Copy anything.

Stand Chat's name, logo and mascot aren't covered by it.
