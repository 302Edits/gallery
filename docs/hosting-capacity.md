# Hosting capacity discovery

Status: confirmed forecast and acceptance goals; implemented local SQLite/file
manager and static public export. Cloudflare Pages Free Direct Upload is the
documented hosting path, conditional on actual file quotas. No provider account
or deployment has been tested and no paid service has been authorized.

## Confirmed forecast

Owner estimate: 500 photos uploaded monthly, approximately 20 MB each.
Visitor activity concentrates in mornings and evenings, with approximately
50–60 views per gallery. The owner has not specified whether that count is
hourly, daily, or lifetime; do not describe it as 60 concurrent users.

For planning, use 60 views within a single hour and a separate conservative
60-session launch burst over 10 seconds. With 24 initial preview requests,
one album-data request, and five app resources per session, that test scenario
produces 180 requests/second. A rounded 200-request/second test envelope is
provisional, not a measured p99. The photo-level read/upload ratio is up to
60:1 if every viewer requests every image; API and database ratios remain
dependent on actual browse depth, caching, and the delivery design. These
explicit hypotheses must be verified rather than presented as user research.

Using decimal MB, retaining every original, and starting from an empty archive:

| Time | Original photos | Stored originals, before derivatives |
| --- | ---: | ---: |
| 1 month | 500 | 10 GB |
| 6 months | 3,000 | 60 GB |
| 12 months | 6,000 | 120 GB |

This is a forecast, not observed upload or traffic data. Do not silently
expire albums, lower original resolution, strip original metadata, or
compress original downloads to make the estimates fit a free allowance.

## Verified provider facts — checked 2026-09-17

### Object-storage allowance

Cloudflare R2 Standard includes 10 GB-month of storage, one million Class A
operations, and ten million Class B operations monthly, with free direct
R2 egress. Retaining this year's originals would exceed that storage
allowance. At 120 GB continuously stored for a full month, the illustrative
storage-only charge is (120 − 10) × $0.015 = $1.65, before derivative files,
operation overages, other services, tax, and daily-peak averaging effects.
This is not a quotation or a recommendation to pay for storage.

Source: https://developers.cloudflare.com/r2/pricing/

### Static assets: a separate potentially free capacity envelope

Cloudflare documents free, unlimited requests to Workers static assets and
no additional cost for storing those assets. Pages similarly advertises a
free plan with unlimited requests and bandwidth. These are static delivery
facts, not unlimited dynamic API or remotely writable storage allowances.

Sources:
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://www.cloudflare.com/en-gb/developer-platform/products/pages/

Pages Free limits a site to 20,000 files and each individual asset to 25 MiB
(26,214,400 bytes). The 20 MB average original fits the per-file ceiling,
but an average cannot establish that every original fits it. A year with
6,000 originals plus two derivatives per image would use 18,000 image
files, before application files, metadata, covers, and other assets. This
is an arithmetic example, not an approved derivative count or deployment
design. Retained growth would eventually reach the file-count limit.

The documented limits do not state a 10 GB total storage allowance for
Pages static assets; do not incorrectly apply R2's allowance to Pages.
Conversely, documentation alone is not proof that a 120 GB publishing
workflow has been tested successfully.

Source: https://developers.cloudflare.com/pages/platform/limits/

## Unresolved before choosing or implementing hosting

Publishing ownership is now confirmed: only the site owner uploads and
manages albums (user answer: "just me as the uploader"). Separate photographer
accounts and independently owned galleries are not in scope. This records
a requirement; it does not claim upload authentication has been implemented.

- Whether the 50–60 gallery views share a peak hour, concurrent gallery
  launches, actual browse depth, and expected original-download activity.
- Actual original size distribution, particularly files above 25 MiB.
- Computer-only owner uploads are confirmed. The progress-tracked
  prepare/publish workflow is approved; a local owner tool remains a proposal,
  not a completed implementation or final hosting selection.
- Permission to publish each actual photo, original sensitive EXIF review,
  and protection of owner credentials. Published albums are confirmed public;
  password-protected published albums are not requested.
- Long-term retention policy; no deletion policy is approved.
- Latency p50/p95/p99, availability objective, recovery-point and recovery-time
  targets, and an accountable owner, as required by the selected backend skill.
- A provider-account test of the real upload, update, and download workflow,
  including quota enforcement, rollback, browser behavior, and transfer sizes.

## Q3 confirmed processing workflow

The owner answered "yes" to the progress-tracked prepare/publish workflow.
This confirms the requirement, not completed implementation or deployment.

Visitor browsing and downloads use straightforward request/response.
Photo-preview generation and batch publishing use a progress-tracked owner
preparation step; retain existing published galleries while the next batch
is being prepared. The goal is to separate heavy preparation from browsing
without adopting an event bus or paid queue. No hosting/storage implementation
has been selected and no new batch-processing code has been written.

This is an inference for this archive, informed by Fowler's distinction
between asynchronous processing and event architectures and his warnings
about hidden control flow, not a claim that his article specifies a photo
gallery implementation.
Source: https://martinfowler.com/articles/201701-event-driven.html

As required by the selected backend skill, associated preliminary acceptance
proposals are explicit but uncommitted:

- Cached visitor-resource first-byte latency: p50 ≤ 150 ms, p95 ≤ 500 ms,
  p99 ≤ 750 ms in a documented test environment. Full 20 MB original transfer
  completion is measured separately and depends on the visitor's connection.
- Availability objective: 99% successful public browse/download requests
  over a rolling 30 days; accountability proposed to the owner.
- Original-photo RPO: zero original loss, conditional on the owner retaining
  an independently verified copy before publishing. Metadata RPO: ≤ 24 hours.
- RTO: the earlier preliminary four-hour target is superseded by a proposed
  best-effort 24-hour restore/republication target confirmed at Q6. A disposable
  SQLite snapshot restore has been tested, but independent owner backups and
  full operator recovery remain unverified; no recovery guarantee is given.

Q6 recovery and Q7 reliability goals are confirmed. They are objectives, not
provider promises or measured production compliance.

## Q4 confirmed public access

The owner answered "fully public". Published albums and full-quality
downloads should be publicly accessible without visitor accounts. This
does not make drafts, uploading, editing, or publishing publicly writable.

Recommendation: drafts stay private and an owner deliberately publishes
each album. Do not add password-protected published albums without a new
request. An unlisted URL or client-side-only password screen cannot protect
drafts or owner operations.

Public publishing does not by itself establish that photos, embedded
metadata, or publishing credentials are nonsensitive. Content and EXIF
inspection and owner publishing permission remain unverified. Do not silently
modify full-quality original files to address metadata privacy concerns.

This archive-specific recommendation is informed by CISA's secure-default
principle, not a claim that CISA prescribes a particular gallery implementation.
Source: https://www.cisa.gov/news-events/news/applying-secure-design-thinking-events-news

Associated latency, availability, RPO, and RTO proposals above remain
provisional; no reliability commitment is approved through the privacy answer.

## Q5 confirmed publishing device; simplicity proposal

Recommend one modular application with a private owner manager and clear
gallery, metadata, processing, and publishing boundaries. This is a proposal
for an owner-managed personal archive, not a final backend profile selection.
Owner-led maintenance is an explicit planning assumption; a single uploader
does not establish the size of any engineering team.

The owner answered "uploads will only be from computer". Do not build a
phone-upload service. Visitors must still have complete phone and desktop
viewing/download experiences. Computer-only publishing permits investigation
of local processing and static public delivery, but does not itself select a
provider, establish the engineering-team size, or confirm a reliability target.

This proposal applies the small-system simplicity argument in Fowler's
Monolith First, rather than claiming he specifies a photo-gallery deployment.
Source: https://martinfowler.com/bliki/MonolithFirst.html

Latency and availability goals are confirmed at Q7. Q6's separate original
copies, post-publication settings backup, and best-effort 24-hour restoration
target are confirmed. Local manager/static export is implemented; real hosting
validation remains outstanding.

## Q6 confirmed backup and recovery target

The owner answered "yes" to keeping separate original copies, backing up
gallery settings after publishing, and targeting restoration within 24 hours,
explicitly not a guarantee. No independent copy or restore has been verified.
The daily draft-backup cadence below remains an implementation proposal rather
than a separately confirmed requirement.

Recommend an independent retained copy of every original before publication;
export gallery metadata after each publish and back up draft changes at least
daily. Target zero original loss conditional on verified independent copies,
no lost published metadata after a verified export, and at most 24 hours of
unpublished metadata changes. Target a best-effort restore within 24 hours
after a hosting failure, subject to working backups, owner availability,
network capacity, and a usable hosting endpoint. This relaxes the earlier
unapproved four-hour proposal; it is not a provider uptime or recovery promise.
No independent backup or restore has been verified.

The distinction between acceptable data loss and recovery duration is informed
by AWS's recovery-objectives guidance; AWS is not being selected as a provider.
Source: https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_planning_for_recovery_objective_defined_recovery.html

## Q7 confirmed reliability and accountability goals

The owner answered "yes" to the reliability plan: the latency percentiles,
99% successful public requests over 30 days, and owner responsibility. The
error-budget repair/rollback policy formalizes that plan; monitoring is not
deployed or automatically scheduled. See `reliability.md` for precise SLIs.

Recommend 99% successful public browse/download requests over rolling 30 days,
with the site owner accountable for the 1% request-error budget. If that budget
is exhausted, prioritize repair or rollback ahead of new publishing/features.
Cached-resource first-byte test targets remain p50 ≤ 150 ms, p95 ≤ 500 ms,
p99 ≤ 750 ms in a documented environment. These are service/test objectives,
not provider promises, measured production results, or full-original transfer
time limits. Retained originals and published settings use the confirmed
independent-copy/post-publication backup plan and best-effort 24-hour restore
target. Draft metadata RPO ≤ 24h is still an implementation proposal.

This is an archive-specific starting proposal informed by Google's user-focused
SLO and accountable-owner guidance; Google does not prescribe these percentages
for this site. Source: https://sre.google/workbook/implementing-slos/
