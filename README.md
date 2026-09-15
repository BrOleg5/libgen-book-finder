# LibGen Book Finder

A Firefox extension that detects a book on the current page and opens a Library Genesis search in a new tab. It is useful on publisher pages, bookshops, catalogues, Google Books, Goodreads, Open Library, WorldCat, and pages containing reading lists.

## Features

- Detects ISBN-10 and ISBN-13 in metadata, JSON-LD, URLs, links, and visible page text.
- Validates ISBN checksums and normalizes every valid ISBN to ISBN-13.
- Detects DOI metadata and DOI links. For common book DOI formats, it extracts the embedded ISBN.
- Optionally asks Crossref whether an otherwise bare DOI belongs to a book and uses the returned ISBN.
- Falls back to the page title only when metadata identifies the page as a book.
- Shows a selection window when a list page contains several books.
- Searches selected text from Firefox's context menu.
- Supports both major LibGen mirror families and custom mirrors.
- Includes English and Russian interfaces.

The extension opens a search-results page; it does not scrape results or download files. Availability and permitted use of third-party services depend on your location and their terms.

## Install for development

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Choose **Load Temporary Add-on**.
3. Select this repository's `manifest.json`.

Alternatively, with Node.js and `web-ext` available:

```sh
npx web-ext run
```

The default keyboard shortcut is `Ctrl+Shift+U`. It can be changed under **Add-ons Manager → gear icon → Manage Extension Shortcuts**.

## How detection works

Detection is deliberately ordered to avoid guessing:

1. ISBN in page metadata or the canonical/current URL.
2. DOI in page metadata or URL. An ISBN embedded in the DOI wins.
3. Exactly one ISBN found in links or visible text.
4. Exactly one DOI found in links or visible text.
5. The title of a page explicitly marked as a book by Open Graph or JSON-LD.

Several identifiers without a trusted page-level identifier are treated as a list page. The address-bar action then opens a picker instead of choosing one silently.

ISBN always has priority over DOI. ISBN-10 is checksum-validated and converted to ISBN-13. A bare ISBN-10 in general page text is ignored because ten-digit numbers produce too many false positives; labelled values such as `ISBN-10: 0-306-40615-2` are accepted.

Crossref resolution is enabled by default and is used only for a DOI that contains no valid ISBN. Requests time out after six seconds. Any network, response, or classification failure falls back to a normal DOI search.

## Mirrors

The built-in list starts with `libgen.li` and includes `libgen.gl`, `libgen.vg`, `libgen.la`, `libgen.bz`, `libgen.is`, `libgen.rs`, and `libgen.st`. Mirrors are tagged with one of two URL families:

- `li`: `/index.php?req=...`
- `classic`: `/search.php` for books and `/scimag/` for DOI searches

Mirror domains and their URL formats can change or be blocked. The popup can probe basic reachability, edit the mirror list, and assign `li` or `classic` to a custom mirror. A successful reachability probe does not guarantee that a search will work.

## Tests

The core libraries have dependency-free Node.js tests:

```sh
node test/isbn.test.js
node test/libgen.test.js
npx web-ext lint --ignore-files "test/**" --ignore-files "tools/**"
```

The icon generator requires Windows PowerShell 5.1 or newer:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\make-icons.ps1
```

## Project layout

```text
background/   Context menus, tabs, badges, Crossref lookup
content/      Page detection and list-item titles
lib/          ISBN, DOI, mirror URL, and settings modules
popup/        Toolbar popup and options UI
select/       Multi-book selection window
_locales/     English and Russian messages
icons/        Generated extension icons
tools/        Icon generator
test/         Plain Node.js unit tests
```
