# Local validation — 2026-09-25

Implementation is a working local owner studio plus static public exporter,
not a deployed provider account or a promise of unlimited zero-cost storage.

## Verified

- Public frontend production build succeeds: main JavaScript approximately
  250 kB / 79 kB gzipped; upload dialog is a separate lazy-loaded chunk.
- Frontend lint passes with no warnings.
- 61 backend checks pass using disposable files, real local HTTP, image
  preparation and SQLite, never the owner's catalog.
- 22 Chromium browser scenarios passed across phone and desktop projects;
  layout is checked at 360, 390, 768 and 1440 CSS pixels.
- Real 20 MiB synthetic JPEG fixture is unchanged across upload, original
  download and static export (SHA-256 equality).
- Multiple-photo ZIP files contain unchanged originals and distinct entries
  when original filenames repeat.
- Public builds make no owner API/session requests. Theme changes do not
  refetch album data or clear selections; appearance persists across reloads.
- A 500-photo synthetic metadata set initially renders 36 photo cards;
  selection includes all 500 and additional rendering is deliberate.
- Light/dark presets maintain at least 4.5:1 text, muted-text and button
  contrast in the tested tokens, even with a white custom decorative accent.
  Reduced-motion preference disables tested transitions.
- Viewer navigation, Escape, focus restoration and visible phone controls
  work; desktop batch inspection/uploads save drafts without auto-publication.
- Zonerama collections validate an official public HTTPS link, publish without
  copying photo files, export only the curated link, and present a tested
  phone/desktop handoff into the live hosted gallery.
- Public export excludes later draft photos, private albums and draft covers,
  local paths, DB/backups and owner tokens. Embedded EXIF stays in originals;
  separate preview files omit it.
- Invalid/spoofed image formats, foreign Host/Origin/fetch context, unauthenticated
  API access, invalid dates/fields/covers and unknown media variants are rejected.
- Export limits (25 MiB/file and 20,000 files) and missing/modified originals
  are checked before replacing the prior artifact. Re-export retains a
  recoverable previous artifact rather than deleting it.
- Prototype database upgrades preserve records and create a backup. A verified
  post-publication SQLite snapshot restores the published original hash/record
  in an isolated drill. This is not a full operator or independent-backup drill.
- Installed workspace dependency audit reports zero known vulnerabilities.

## Qualified automated reviews

Local synthetic warmed-static benchmark: 1,000 HTML/JS/CSS/album-manifest
requests scheduled at 200/second for five seconds; zero failures. First-byte
latencies were p50 0.90 ms, p95 1.98 ms, p99 2.99 ms. The 500-photo synthetic
manifest was 155,451 bytes. These localhost measurements exclude original
transfers, browser rendering, provider/CDN networking and rolling-30-day SLO;
they are not production or Cloudflare performance claims. Reproduce with
`npm run benchmark` after a public build.

The SLO review has zero failures and one warning: the accepted 99% target is
low. It is a cost-conscious starting point, operationally provisional until
measured, not a provider SLA.

The API review is qualified: convention lint has zero errors/warnings; generic
scorecard D (67.65) fails its B gate. It penalizes intentionally local HTTP,
full-album lists and other contract choices. Its empty-baseline authentication
notice does not prove compatibility with external clients. See `api-review.md`;
do not convert these results into a clean sign-off.

Security threat-model/source scans are scoped, not a blanket production
security certification. See `threat-model.md` for untested cases and boundaries.

## Still required outside local implementation

Real provider account deployment, HTTPS/header/cache checks on that provider,
representative 120 GB/year publishing transfers and actual photo-size
distribution; independent verified original backups and a full owner recovery
drill; real image-publication/EXIF review; intended-user phone usability sessions
and real-network performance/SLO measurements. No telemetry history, survey
results, publication permissions or provider guarantees are fabricated.
