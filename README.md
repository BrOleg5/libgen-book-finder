# LibGen Book Finder

LibGen Book Finder is a Firefox extension that detects the book or article described by the current page and opens a matching search in Library Genesis. It is designed for publisher pages, bookshops, catalogues, Google Books, Goodreads, Open Library, WorldCat, and other pages that expose an ISBN, DOI, or structured book metadata.

The extension opens a search-results page. It does not scrape Library Genesis results or download files.

## For users

### Features

- Detects ISBN-10 and ISBN-13 in metadata, JSON-LD, URLs, links, and visible page text.
- Validates ISBN checksums and normalizes valid identifiers to ISBN-13.
- Detects DOI metadata and links, including common book DOI formats containing an ISBN.
- Can use Crossref to resolve a book DOI to its ISBN before searching.
- Falls back to the page title when the page is explicitly identified as a book.
- Shows an address-bar action only when one unambiguous book or article is detected.
- Accepts a manually entered ISBN, DOI, or title through the toolbar popup.
- Searches identifiers and arbitrary selected text from the Firefox context menu.
- Supports the `li` and `classic` LibGen mirror families, custom mirrors, and basic availability checks.

### Using the extension

When a single book or article is detected, a book icon appears in the Firefox address bar. Select it to open the corresponding Library Genesis search.

You can also:

- open the toolbar popup to review or enter an ISBN, DOI, or title;
- press `Ctrl+Shift+U` to search for the item detected on the current page;
- right-click an ISBN/DOI link or selected identifier;
- select arbitrary text and search for it as a title or phrase.

The keyboard shortcut can be changed under **Add-ons Manager → gear icon → Manage Extension Shortcuts**.

If a page contains several identifiers and none is clearly the page's primary item, the page is treated as ambiguous and the address-bar action remains hidden.

### Detection rules

Detection is deliberately ordered to avoid guessing:

1. ISBN in page metadata or the canonical/current URL.
2. DOI in page metadata or URL. An ISBN embedded in the DOI takes precedence.
3. Exactly one ISBN found in links or visible text.
4. Exactly one DOI found in links or visible text.
5. The title of a page explicitly marked as a book by Open Graph or JSON-LD.

ISBN always has priority over DOI. ISBN-10 is checksum-validated and converted to ISBN-13. A bare ISBN-10 in general page text is ignored because ten-digit numbers produce too many false positives; labelled values such as `ISBN-10: 0-306-40615-2` are accepted.

Crossref resolution is enabled by default and is used only when a DOI contains no valid ISBN. Requests time out after six seconds. A network, response, or classification failure falls back to a normal DOI search. The option can be disabled in the popup.

### Mirrors and limitations

The built-in mirror list starts with `libgen.li` and also contains `libgen.gl`, `libgen.vg`, `libgen.la`, `libgen.bz`, `libgen.is`, `libgen.rs`, and `libgen.st`. Mirrors use one of two search URL families:

- `li`: `/index.php?req=...`
- `classic`: `/search.php` for books and `/scimag/` for DOI searches

Mirror domains and their URL formats can change or be blocked. The popup can probe basic reachability, edit the mirror list, and assign `li` or `classic` to a custom mirror. A successful reachability check does not guarantee that search is available.

Availability and permitted use of Library Genesis, Crossref, and other third-party services depend on your location and their terms.

## For developers

### Requirements and setup

- Firefox 142 or newer
- Node.js 22 or newer
- npm

Install the exact dependency versions recorded in `package-lock.json`:

```sh
npm ci
```

### Development commands

Start Firefox with the extension loaded temporarily:

```sh
npm start
```

Run the dependency-free ISBN and LibGen unit tests:

```sh
npm test
```

Validate the extension manifest and packaged files:

```sh
npm run lint
```

Build the XPI package:

```sh
npm run build
```

The resulting file is written to `web-ext-artifacts/libgen-book-finder.xpi`.

### Manual loading

To load the working directory without `web-ext`:

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Choose this repository's `manifest.json`.

Reload the temporary extension from the same page after changing background scripts, the manifest, or extension pages. Reload the tested web page as well after changing content scripts.

### Icon generation

The committed PNG icons are generated using Windows PowerShell 5.1 or newer:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\make-icons.ps1
```

### Project layout

```text
background/   Context menus, tabs, badges, and Crossref lookup
content/      Page detection and primary-query selection
lib/          ISBN, DOI, mirror URL, and settings modules
popup/        Toolbar popup and options UI
_locales/     English and Russian messages
icons/        Generated extension icons
tools/        Icon generator
test/         Dependency-free Node.js unit tests
```

The extension uses Manifest V2 and plain IIFE modules exposed through `globalThis`; it has no bundling or transpilation step.
