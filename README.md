# 302 Edits

A quiet, mobile-friendly sports photography archive. JavaScript throughout:
React for the gallery, Express and SQLite for your private desktop studio.
The public homepage reads the 302 Edits Zonerama archive through a read-only
adapter. The GitHub Pages deployment refreshes its public snapshot every hour.
Visitors
need no account. Collections and photographs open inside this site, with an adaptive photo grid,
full-screen viewer, zoom, swipe and keyboard navigation, and direct downloads.

## Start on your computer

Install a current supported Node.js release, then run from this folder:

```sh
npm install
npm run build
npm run dev
```

Open **http://127.0.0.1:5173** for the live gallery. The existing private studio
is at **http://127.0.0.1:5173/?studio=1** and is accessible only on your computer.
The photo service uses port 5001 to avoid macOS AirPlay's usual port 5000.
Do not expose the studio through a tunnel or deploy the backend.

## Add an event

1. Choose **New album**. Enter a name, date, sport and location; choose a theme
   preset or custom accent. Both light and dark appearances stay readable.
2. Choose **Add photos** and select or drop multiple files. Review each photo's
   camera date and metadata. Individual dates override explicitly applied
   batch dates. File-modified fallback is optional, not a capture-time guarantee.
3. **Save as drafts**. Successful files stay saved if another file fails.
   Failed files can be retried; cancelled/uncertain uploads tell you to check
   the gallery first. Uploading does not publish photographs.
4. Choose **Review & publish**, confirm publication rights and public access
   to unchanged originals, then **Export public site**.

### Automatic Zonerama updates

The homepage is connected to https://eu.zonerama.com/302Edits/2037673.
Publish or change public albums there; GitHub Actions picks up the changes on its
next hourly run, or immediately when the publish workflow is run manually.
The adapter paginates Zonerama's public collection feed, excludes advertising,
and caches successful results for five minutes when run locally. Search,
sport filters, source ordering, oldest-first and alphabetical sorting work locally.
Album cards open shareable `?collection=...` pages inside the site. Justified rows
preserve each photograph’s aspect ratio, with comfortable/compact layouts and
progressive loading as visitors scroll. Click a photograph for the expanded viewer;
use arrow keys or swipe to navigate, zoom for detail, and Escape to return to the
same position. Download controls save the unchanged file through a streaming
same-origin endpoint locally. On GitHub Pages, downloads use Zonerama's public
original-download URL. Zonerama download permissions remain authoritative.
Original photos are not stored in GitHub; previews and downloads load from Zonerama.

The feed is Zonerama's public website endpoint, not a guaranteed third-party API.
If its markup changes, the adapter may need updating. Temporary errors display a
retry control and retain the current page's last loaded collections. A warm server
also retains its last successful response; this is not durable offline storage.

Manual local albums and publication controls remain available in the studio.
Existing `?album=...` links continue to open the original local-photo gallery.

Supported initially: JPEG, PNG, WebP, AVIF, TIFF (first frame). HEIC, RAW, GIF
and SVG are not supported. Local upload ceiling is 100 MiB per file.
TIFF originals can be downloaded; their WebP previews work in browsers.

## GitHub Pages hosting

The repository includes `.github/workflows/pages.yml`. Every push to `master`
and an hourly schedule fetches the public Zonerama archive, builds the site for
the repository's Pages subpath and deploys it with GitHub's official Pages
actions. The generated snapshot is a deployment artifact and is intentionally
not committed. A temporary Zonerama failure is retried; an unavailable album is
excluded from that run instead of breaking the whole website.

The public repository does not contain the SQLite database, locally uploaded
photographs, environment files, generated snapshots or the private studio data.
The deployed site contains metadata for public Zonerama albums; the photographs
themselves continue to load from Zonerama.

To refresh immediately, open the repository's **Actions** tab, choose
**Publish gallery**, and run the workflow. GitHub's scheduled workflows can be
delayed during busy periods, so the hourly time is a target rather than a strict
service guarantee.

### Important free-plan limits

Pages permits **25 MiB (26,214,400 bytes) per file** and **20,000 files total**
with Wrangler; dashboard drag-and-drop permits only 1,000 files. Export checks
actual sizes, file count, missing originals and original hashes, and stops
visibly when a limit is exceeded. It never shrinks originals or deletes albums
to fit. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/),
[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

At your estimate of 500 × 20 MB each month, retained originals grow by about
10 GB/month. Each photo currently produces one original and two previews:
6,000 photos after a year use about 18,000 image files plus the application
and album manifests. **This is not unlimited free storage.** Growth eventually
reaches the file-count limit, and a 20 MB average does not prove every original
is below 25 MiB. Oversized originals cannot use this hosting path unchanged;
the studio keeps them private until you decide on another delivery option.

Cloudflare advertises free static requests/bandwidth; the 120 GB/year workflow
has not been uploaded to a real provider account or load-tested on its network.
No zero-cost-forever or availability guarantee is claimed.
[Pages Free](https://www.cloudflare.com/en-gb/developer-platform/products/pages/).

## Visitor experience

Albums have shareable links, sport/search filters, date groups and ordering.
Phone layouts feature generous touch controls, a full-screen viewer and a
safe-area-aware selection tray. Appearance respects the device initially and
remembers light/dark/system preference. Reduced-motion settings are respected.
Preview generation happens once on your computer; originals are not rewritten.

Select photos → **Save originals**. Desktop browsers supporting a save-file
picker stream a ZIP to disk. Other browsers use ZIP parts containing at most
64 MiB of originals; click **Save part…** for each remaining part. Transfers
are sequential, cancellable and retryable. Duplicate names stay distinct inside
the archive. Only previews are used for browsing; downloads contain originals.

## Backups and recovery

Keep a separate, verified copy of **every original** before publishing.
Local originals live in `backend/data/originals/`; the catalog remains in
`backend/gallery.db`. SQLite snapshots are saved to `backend/data/backups/`
after publication; a snapshot is also made before upgrading an existing
prototype database. These same-computer snapshots are **not independent backups**.
Copy snapshots and originals to an independent destination you already own.

Keep multiple dated copies rather than overwriting your only backup. Drafts
change between publications: make additional settings backups when you need
them (a daily draft backup is recommended, not automatically scheduled).

For recovery, stop the studio, retain the damaged files for investigation,
restore a verified SQLite snapshot as `backend/gallery.db` and restore the
original/preview files at their recorded paths. SQLite WAL/SHM files must not
be mixed with a different restored snapshot. Restart, review albums, rebuild,
export and redeploy. Restoring on another computer requires preserving the
recorded photo paths or a deliberate path migration; relocation is not automated.
Target: best-effort restoration within 24 hours, not a provider guarantee.
Full publication/metadata recovery and original hash preservation are tested
using disposable local fixtures; your actual independent backups need a drill.

Re-export keeps the previous artifact in a dated `site-output-previous-*`
directory for recovery. These artifacts may share immutable image files using
hard links to save disk space: do not edit any original/export image in place.
No cleanup/expiry policy runs automatically.

## Verify

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests use disposable catalogs and generated fixture images, never your
archive. They need ports 5001, 5173 and 4173 free; stop `npm run dev` first.
`npm run preview` shows a prepared public export at http://127.0.0.1:4173.

The owner-accepted reliability goals are documented in `docs/reliability.md`.
They are not measured production results, a free-provider SLA, or active
monitoring. Real-user usability sessions are still needed; no user research
results have been invented.
