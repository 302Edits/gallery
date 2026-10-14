# Backend discovery — 2026-09-17

Reconstructed from confirmed conversation answers and the capacity brief when
the earlier temporary log was no longer present. This is a requirements record,
not a benchmark, deployed feature, or final hosting/provider decision.

## Confirmed answers

1. Workload: "roughly 500 photos per month averaging about 20mbs and visitors
   in the morning and evening hours"; "about 50-60 views per gallery". The
   view-count period and simultaneous traffic remain unspecified. Decimal
   planning forecast: 10 GB new originals monthly and 120 GB after one year
   retaining every original. No deletion policy has been approved.
2. Ownership: "just me as the uploader". One owner manages a public archive;
   separate photographer accounts are not requested.
3. Processing: "yes" to progress-tracked preparation and publishing while
   existing published albums remain available. No queue/provider selected.
4. Public access: "fully public". Published albums and full-quality downloads
   require no viewer login. Owner management and drafts must remain private.
   Actual image/EXIF sensitivity and publication permissions are unverified;
   never silently alter original bytes.
5. Publishing device: "uploads will only be from computer". Mobile visitor
   browsing/downloads remain in scope; phone uploads do not. A simple modular
   application and private local owner tool are proposals. Do not infer an
   engineering-team size from the single-uploader answer.

6. Backup/recovery: "yes" to separate copies of originals, gallery-settings
   backups after publishing, and a best-effort restoration target of 24 hours,
   not a guarantee. Original-loss target is zero conditional on verified
   independent backups; published metadata is recoverable to the latest
   verified post-publication export. Daily draft-metadata backup / RPO ≤ 24h
   remains an implementation proposal, not an independently confirmed cadence.
   This supersedes the earlier unapproved four-hour recovery proposal. No
   copies or restore procedures have been verified.

## Confirmed final gate

7. Reliability/accountability: "yes" to cached-resource first-byte latency
   p50 ≤ 150 ms, p95 ≤ 500 ms, p99 ≤ 750 ms in a defined test environment,
   plus 99% successful public browse/download requests over rolling 30 days
   with owner accountability. Original transfer completion is separate and
   network-dependent. Targets are confirmed goals, not measured results.
   Recommend prioritizing repair/rollback over new publishing or feature work
   if the 1% request-error budget is exhausted. The site owner is the proposed
   accountable consumer, not an assumed paid on-call team or provider promise.

## Explicit stress-test assumptions

Named scenario: 60-viewer album-launch burst with one year of retained uploads.
Assume 60 sessions within ten seconds, 24 previews plus six app/data resources
per session: 180 requests/second, rounded to a 200-request/second test envelope.
This is not observed traffic or a p99 forecast. A maximum 60:1 photo-read/upload
ratio assumes every viewer requests every photo; it is not an API/DB ratio.

## Sources and next step

- Capacity facts and provisional performance targets: `hosting-capacity.md`.
- Simplicity rationale: https://martinfowler.com/bliki/MonolithFirst.html
- Recovery objectives: https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_planning_for_recovery_objective_defined_recovery.html

All seven discovery stages have been discussed. Zero-cost hosting remains a
requirement; no paid services or public deployment have been created.
Rationale: https://sre.google/workbook/implementing-slos/

## Decision-engine scenario, not fabricated evidence

Ran the required engine using the documented 200 req/s stress envelope and
60:1 maximum photo-read ratio, with a conservative PII sensitivity assumption,
single-owner tenancy, modular application preference, and assumed owner-led
maintenance capacity of one. The language tool has no JavaScript option;
TypeScript was used only as its closest Node-family scoring input. These inputs
do not claim a measured p99, confirmed engineering headcount, or language change.
It ranked node-express 84% and fastapi-python 82%, with a tenancy mismatch.

The SaaS profile's paid-capable Postgres/auth/tracing and stricter recovery/SLO
defaults do not fit this personal zero-cost archive and do not override the
owner's requirements. Implement JavaScript/Express and existing local SQLite
for the private computer manager; export published galleries to a static public
site with original files and locally generated previews. No public upload API,
paid object storage, domain purchase, or cloud function is needed for this path.
Preflight every export against provider limits; never shrink originals or
silently expire albums to fit. Real deployment and year-size transfer validation
remain outstanding.
