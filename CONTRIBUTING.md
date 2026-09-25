# Contributing an example

New examples are welcome: a realistic page that shows one Stand Chat integration well.

1. Copy the template. The folder name becomes the URL, so keep it short and lowercase-kebab-case.

   ```sh
   cp -r _template my-example
   ```

2. Fill in the `<head>` of `my-example/index.html`. Those tags are your entry on the front page and your social card:

   | Tag | Used for |
   | --- | --- |
   | `<title>` | Example name |
   | `<meta name="description">` | One or two sentences on what it shows |
   | `<meta name="author">` | Your name |
   | `<link rel="author" href="…">` | Optional: your GitHub, website or company |
   | `<meta name="keywords">` | Optional tags, for example `stand-card, spotlight` |
   | `og:title`, `og:description`, `og:image`, `twitter:card` | Social previews. Point `og:image` at `https://examples.stand.chat/my-example/og.png`, or keep the default. |

3. Build the demo and its "How it works" section. Run `npm start` and open http://localhost:3000/my-example/. `npm run build` fails with a clear message if a required tag is missing.

4. Capture the social image, so every example's card looks alike:

   ```sh
   npm run og -- my-example
   ```

   This takes a 1200×630 screenshot of your live page with Chrome and saves it as `my-example/og.png`. Two optional attributes shape the picture: `data-og-focus` scrolls an element into the middle of the frame, and `data-og-hide` leaves one out.

5. Open a pull request that changes only your folder. Vercel adds a preview link to it.

## Rules

- **Everything lives in your folder.** Don't edit shared files in an example PR.
- **No build step and no `npm install`.** Use plain HTML, CSS and JavaScript. Load any library as an ES module from a CDN such as `https://esm.sh/` instead of copying it in.
- **It works when copied.** Someone should be able to copy your folder into their own site. `/_shared/` is only the site's chrome.
- **Keep the template's Stand script.** It uses `data-stand-id="demo"`, Stand Chat's shared demo site, which answers on any domain, including localhost and preview deployments. Add `?preview` to the URL to see Stand elements that stay hidden while nobody is available.
- **Invent your businesses.** Demos use fictional companies and people, not real brands or logos.
- **Public domain.** By contributing, you release your work under the [Unlicense](LICENSE). Only include code, images and text that you made yourself or that are already in the public domain.
