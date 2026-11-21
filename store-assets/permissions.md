# Chrome Web Store permission justifications

Two permissions in `manifest.json` need a written justification in the Chrome Web Store
dashboard. The **short** block is what to paste into the dashboard field; the **long**
block is the internal reference with the code evidence a reviewer can check.

Neither permission shows an install warning to the user (`sidePanel` and `unlimitedStorage`
are not in Chrome's permission-warning list).

---

## `sidePanel`

### Short (paste into the dashboard)

> PocketResume's whole workflow happens next to the job posting. The user opens the side
> panel from the toolbar, reads the posting, corrects the job details in the review
> dialog, generates a resume and a cover letter, and then drags the finished PDF onto an
> application form's file input. A browser popup closes the moment the user clicks the
> page, which would end the panel before the drag could start, so the panel has to stay
> open while the user works. The `sidePanel` permission is what lets the toolbar button
> open a panel that persists alongside the tab
> (`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`).
>
> The permission is used for nothing else. The panel is the extension's own page
> (`sidebar.html`), served from the extension origin; no other extension UI is opened, no
> other tab is read or modified, and the API is called in exactly one place — when the
> extension is installed and when Chrome starts.

### Long version

**User-facing benefit.** The toolbar button opens a panel that stays open next to the page.
The user reads the posting in the tab and generates in the panel, side by side, without
switching windows. The generated PDF is dragged from the panel straight onto a file input
on the page, which a popup cannot support (a popup closes when focus leaves it, and the
drag would be cancelled mid-gesture).

**Where the API is used (2 call sites, both ours).**

| What | Where |
| --- | --- |
| `"sidePanel"` permission + `"side_panel": { "default_path": "sidebar.html" }` | `manifest.json:14`, `manifest.json:31` |
| `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` | `background.js:450-455`, called on install and on startup (`background.js:486-499`) |
| The panel UI itself | `sidebar.html` / `sidebar.js` (extension pages, extension origin) |

**Why the minimum Chrome version is 114.** The `chrome.sidePanel` API ships in Chrome 114,
so `manifest.json` declares `"minimum_chrome_version": "114"` rather than silently
failing on older browsers.

**Why not a popup.** `manifest.json` deliberately has **no** `action.default_popup`. The
popup was replaced by the panel in v10.12 because of the drag-out flow above; a popup also
closes on every click outside it, which interrupts the review dialog, the file shelf and
the delete zone.

**What it does not give us.** The panel is an extension page. It has no extra access to
other pages, no access to other extensions' UI, and it is not used to read tab contents —
page text comes from the content script under `activeTab`.

---

## `unlimitedStorage`

### Short (paste into the dashboard)

> The files PocketResume generates stay on the user's device. It renders a resume and a
> cover letter to PDF and keeps them in `chrome.storage.local` so they survive closing the
> panel and can be dragged onto a page's file input as a real file — Chrome blocks blob
> URLs in drags, so the bytes have to be stored locally. A single generated PDF can be up
> to 25 MB, base64 encoding adds about a third on top, and the shelf keeps the files for
> the posting the user is on (a resume and a cover letter). The default
> `chrome.storage.local` quota is 10 MB for everything the extension stores, so without
> `unlimitedStorage` a photo-heavy resume fails to save — the write is rejected outright
> and the PDF is lost.
>
> Nothing is uploaded. The stored bytes are only read back by the extension, are replaced
> when the user generates for a different posting, and are deleted when the user deletes a
> file, clears the shelf, or uninstalls the extension. The extension never stores browsing
> history, page content, or anything about the pages the user visits.

### Long version

**What the quota covers.** Only what the extension itself produces and stores locally:

| Data | Size | Where |
| --- | --- | --- |
| Generated PDF bytes (base64 data URL) | up to 25 MB per file, ×2 (resume + cover letter) | `pdf-store.js:7` (`MAX_PDF_BYTES`), written at `pdf-store.js:101` |
| Skill vocabulary (O*NET terms, compact rows) | ~1 MB | `chrome.storage.local` key `skillLexicon` |
| Bundled/updated company, job-title and location lists | ~2.3 MB total when downloaded | `chrome.storage.local` keys `*DirectoryGlobal` (bundled copies live in `libs/`) |
| Resume profiles, cover letters, Form Filler answers, Job Tracker cards, settings | tens of KB | `chrome.storage.local` |

**Why the default quota is not enough.**

- `chrome.storage.local` has a `QUOTA_BYTES` of **10,485,760 bytes (10 MB)** for *everything*
  the extension stores. Chrome's docs state the value "will be ignored if the extension
  has the `unlimitedStorage` permission".
- One PDF is allowed up to **25 MB** (`pdf-store.js:7`), and base64 adds ~33% — so a
  single file can be ~33 MB of stored string. The shelf holds one posting's files: a
  resume and a cover letter.
- The realistic trigger is a photo-heavy resume: a 7 MB PDF becomes ~9.3 MB of base64,
  and the ~1 MB skill vocabulary plus the saved resume profiles and tracker cards sit in
  the same 10 MB quota.
- Exceeding the quota is a **hard failure**: the `set()` is rejected with a quota error
  and the file is lost — the user has to regenerate.

**Why the alternatives do not work.**

1. *Upload the file to a server.* That is exactly what this extension refuses to do. The
   product promise is that resumes, job postings and generated files never leave the
   device — the PDFs are stored locally so they can be dragged onto a page, and the
   privacy policy says so. An upload would also add a server to the extension's data
   path.
2. *Keep the file in a separate binary store (OPFS / IndexedDB).* Possible, but it splits
   the user's data across two storage systems with two deletion paths. Today one
   `chrome.storage.local` record holds the shelf, so one *Clear* (or an uninstall) removes
   everything. `unlimitedStorage` also lifts the IndexedDB / Cache Storage / OPFS quotas,
   so the extension can move the bytes if that trade-off ever changes.
3. *Cap the file size instead.* The cap would have to drop to roughly 4 MB, which refuses
   legitimate photo-heavy resumes — the exact files a user is most likely to want back.

**Data minimisation — why the quota is not a licence to hoard.**

- The shelf holds **one posting at a time** (`planStore` in `pdf-store.js:27`): generating
  for a new posting drops the previous set, so the stored bytes do not grow with use.
- A hard per-file ceiling of **25 MB** (`pdf-store.js:7`) bounds a single item; files over
  it are refused with a console warning instead of being stored.
- The user can delete a single file (× on the card), clear the whole shelf (*Clear* in
  the Files header), or drag a card onto the delete zone at the bottom of the panel.
- Nothing about the pages the user visits is stored. The one optional exception is the
  address of the current page, and only when the user ticks *Include the page I'm on* in
  the feedback box and presses *Send feedback* — that message goes to the developer's own
  server and is never written to local storage.
- Uninstalling the extension removes `chrome.storage.local` entirely.

---

## `https://pocket-resume.xyz/*` (host permission — company, job-title and location directory refresh)

### Short (paste into the dashboard)

> PocketResume recognizes employers, job titles and locations. It ships with read-only
> lists of well-known companies (canonical names, legal names, aliases and domains),
> O*NET job titles and a GeoNames city list, and it keeps private lists of the entries
> the user corrects on their own device.
>
> The host permission is used for exactly one thing: downloading updated copies of those
> public lists from the extension's own website, once a day, so new entries are
> recognized without a new version of the extension. The requests carry no personal
> data — no resume, no job posting, no correction, no browsing history, no identifier.
> A successful list is cached in local browser storage; a failed or malformed download
> keeps the previous list, and the copies bundled with the extension always work with no
> network at all.
>
> The user's own corrections are never uploaded and never synced. Every match happens
> locally in the browser.

### Long version

**What the permission is used for (3 fetches, once a day).**

| What | Where |
| --- | --- |
| `"https://pocket-resume.xyz/*"` in `host_permissions` | `manifest.json:20` |
| Company list URL | `company-directory-store.js:23` (`GLOBAL_DIRECTORY_SOURCE_URL`) |
| Title list URL | `job-title-directory-store.js:22` (`TITLE_DIRECTORY_SOURCE_URL`) |
| Location list URL | `job-location-directory-store.js:22` (`LOCATION_DIRECTORY_SOURCE_URL`) |
| The fetch | `directory-store.js:103` (shared `refreshGlobal`), `company-directory-store.js:273` |
| Daily alarms + startup/install trigger | `background.js:476-485` |
| Silent refresh messages | `background.js:1069` (`ENSURE_COMPANY_DIRECTORY`), `background.js:1078` (`ENSURE_TITLE_DIRECTORY`), `background.js:1087` (`ENSURE_LOCATION_DIRECTORY`) |
| The bundled offline copies | `libs/company-directory-global.js`, `libs/title-directory-global.js`, `libs/location-directory-global.js` |

**What the requests contain.** Plain `GET`s with no body, no query string and no custom
headers. They cannot carry resume content, a job posting, a correction or a URL, because
none of those are ever read into them.

**What is stored.** The downloaded lists in `chrome.storage.local` under
`companyDirectoryGlobal`, `jobTitleDirectoryGlobal` and `jobLocationDirectoryGlobal`,
plus small `*Meta` records with the version, the fetch time and the last error.

**Failure behaviour.** The last good copy is kept on any error, a malformed payload is
rejected before it can replace a working list, and the bundled lists in `libs/` are used
whenever storage is empty or broken.

**The user's own data never leaves the device.** Corrections are written to
`chrome.storage.local` under `companyDirectory`, `jobTitleDirectory` and
`jobLocationDirectory` by the extension itself. Nothing in the directory code path sends
them anywhere.

---

## Reviewer checklist

| Claim | Where to verify |
| --- | --- |
| The toolbar button opens a persistent panel | `background.js:450-455`, `manifest.json:31` |
| There is no popup | `manifest.json` — no `action.default_popup` |
| PDFs are stored locally, never uploaded | `pdf-store.js:76-104`; `sidebar.js:229` is the only write path |
| The shelf holds one posting at a time | `pdf-store.js:27-42` (`planStore`) |
| Per-file ceiling of 25 MB | `pdf-store.js:7` |
| The default quota is 10 MB | Chrome `chrome.storage` docs (`local.QUOTA_BYTES`) |
| Drag-out needs stored bytes, not a blob URL | `sidebar.js:400-422`, `pdf-store.js:132` |
| Nothing is stored about visited pages | no write to `chrome.storage.local` outside `pdf-store.js` / `options.js` / `tracker.js` |
| The directory refresh sends no personal data | `directory-store.js:103` / `company-directory-store.js:273` — bare `GET`s of static files |
| The user's corrections never leave the device | directory stores write only to `chrome.storage.local` |
