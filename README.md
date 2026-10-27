# Paperplane Studio

A browser-based image and PDF utility. Convert images into a PDF, resize images, scan pictures for editable text, and reorder, rotate, or remove PDF pages.

## Run it

Open `index.html` in a modern browser for a quick preview. To test Chrome installation or the service worker locally, serve this folder over `localhost` with any static file server, for example:

```sh
npx serve .
```

The app does not have a backend. Image resizing and PDF editing happen locally in your browser. PDF conversion, OCR, and PDF page previews load their libraries from CDNs, so those features need an internet connection.

## Publish it

This is a static website; it can be hosted on GitHub Pages, Netlify, or any static HTTPS host. For GitHub Pages:

1. Create a GitHub repository and upload these project files.
2. In the repository, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select the default branch and its root folder, then save.
4. Open the published HTTPS address in Chrome.

On a supported Chrome desktop version, use the **Install app** button when it appears, or choose **Install Paperplane Studio** from Chrome's menu. On mobile Chrome, use the menu's **Add to Home screen** option. Installation and service workers require HTTPS (except when testing on `localhost`).

The service worker caches the app shell and checks for fresh HTML during page navigation, falling back to the cached homepage when offline. It does not cache the external PDF/OCR libraries or OCR language data, so those tools still need internet access.

## Search engines

The site includes a canonical URL, a sitemap, a `robots.txt`, and WebApplication structured data. After deployment, add the site as a URL-prefix property in [Google Search Console](https://search.google.com/search-console/), complete Google's ownership verification, and submit `https://kushalmenariya.github.io/paperplane-studio/sitemap.xml`. Request indexing for the homepage from URL Inspection. Google decides whether and when to index or show the site; these steps do not guarantee a particular ranking or appearance for broad searches such as “Paperplane.”

## Tools

- **Image to PDF:** Combine multiple images in order, choose A4 or US Letter paper, orientation, and margins, or fit each page to its image.
- **Resize images:** Enter output dimensions, preserve or unlock the aspect ratio, choose JPG/PNG/WEBP, and set quality.
- **Text scanner:** Extract text from an image with OCR, edit the result, copy it, or download a `.txt` file.
- **PDF editor:** Drag pages to reorder them, rotate pages, remove pages, and download the edited PDF.

Files are processed in the browser and are not sent to an application server. External libraries and OCR language data are downloaded from their respective CDNs.
