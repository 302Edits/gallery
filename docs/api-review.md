# Local-owner API review

Status: **qualified, not a clean sign-off**. This branch changes documentation
only. The proposed contract is [openapi.json](openapi.json); final unabridged
tool outputs, exit codes, comparison baseline and reviewed source hashes are
attached in [api-review-results.json](api-review-results.json).

## Scope and trust boundary

Reviewed `docs/app-contract.md` and `frontend/src/utils/api.js`.
The contract contains nine operations across eight versioned paths:

| Path | Methods | Successful response |
| --- | --- | --- |
| /api/v1/session | GET | 200, private opaque token |
| /api/v1/galleries | GET, POST | 200 array; 201 saved gallery |
| /api/v1/galleries/{id} | PATCH | 200 saved gallery |
| /api/v1/galleries/{id}/photos | GET | 200 complete album array |
| /api/v1/galleries/{id}/publication | POST | 200 publication snapshot gallery |
| /api/v1/photos | POST | 201 prepared draft photo |
| /api/v1/metadata-inspections | POST | 200 transient metadata inspection |
| /api/v1/exports | POST | 200 completed local export summary |

Express is loopback-only at `127.0.0.1:5000`. The local manager is private:
all gallery/photo reads and mutations require the owner bearer token.
Only session bootstrap is bearer-exempt; it is still guarded. This is a
trusted-desktop ownership model, not a public account-login system.

`strictOriginGuard` must check the actual socket peer, exact allowed Host,
and configured local Origin/fetch-context policy on every route. Never derive
ownership from arbitrary forwarded headers, wildcard localhost origin matches,
CORS alone, or the presence of a gallery ID. Reject foreign/null Origins and
cross-site browser requests. Same-origin browser GETs often omit Origin, so
the missing-Origin exception requires an explicitly constrained policy.
Loopback HTTP is intentional, not suitable for LAN/public deployment.
It does not defend against someone already controlling the owner computer.

The session token stays in frontend memory; responses require `no-store`.
Local `/media` reads need their own effective private guard, including image
requests that cannot attach a bearer header automatically. This asset surface
is outside the listed API spec and remains an integration test requirement.

Public mode makes no owner API/session request. It reads
`/data/galleries.json` and `/data/albums/{id}.json`, plus immutable photo assets.
Published output must exclude owner credentials, database, raw EXIF JSON,
draft originals and derivatives, and covers pointing to draft photos.
Original embedded EXIF is unchanged and may be publicly downloadable;
`acknowledgePublicOriginals:true` is required before a local-photo publication
snapshot. A Zonerama-backed gallery instead requires
`acknowledgeExternalGallery:true` and publishes no local photo IDs.

## Error and upload contract

Every application JSON error uses `{error:{code,message}}`, not a string,
HTML error page, flattened wrapper or HTTP 200 failure.

| Status | Meaning |
| --- | --- |
| 400 | Invalid fields, malformed JSON, missing file, wrong multipart shape |
| 401 | Missing/invalid bearer token on protected owner operations |
| 403 | Rejected loopback peer, Host, Origin or fetch context |
| 404 | Missing gallery/photo/resource |
| 413 | Per-file upload limit exceeded |
| 422 | Unsupported/undecodable image |
| 409 | Export original/file-count constraint prevents safe output |
| 503 | Required public frontend build is missing |
| 500 | Unexpected local processing/storage failure, without internal diagnostics |

`uploadPhoto` sends one multipart `photo` field per request. Desktop batching
must bound concurrent preparation and expose per-file progress/cancellation.
Supported decoders are JPEG, PNG, WebP, AVIF and TIFF, first frame initially;
SVG/GIF/HEIC/RAW are unsupported. File maximum is 100 MiB. Static export has
a separate 25 MiB original-file ceiling and 20,000 total-output-file ceiling.
Reject violations visibly; never resize an original or silently omit photos.

An explicit single-file `date` is resolved by the manager from individual
override before explicit batch override; otherwise preserve that image's EXIF,
then its own last-modified fallback. Missing dates must not copy another
image's date. EXIF without a timezone does not justify inventing UTC.
No automatic visual sport inference, GPS reverse-geocoding or complete
privacy audit is promised.

## Final automated results

| Check | Result | Exit |
| --- | --- | --- |
| Provided convention linter | 9 operations; 0 errors, 0 warnings, 3 informational notices; 99.67 | 0 |
| Provided breaking detector, empty baseline | 0 definite, 1 potentially breaking change; 22 additions | 1 |
| Provided scorecard, minimum B | **D, 67.65**; below requested gate | 1 |
| Additional structural check | JSON parses, 68 local refs resolve, unique operation IDs, required path parameters and bearer contract present | 0 |

The three lint notices call 413 on upload/inspection and 503 on export
“uncommon”; retain these requested, meaningful error semantics.
Examples were added and tools rerun; the scorecard improved from 64.87 to
67.65, but still fails B. No tool failures were suppressed.

The breaking detector's retained medium-severity finding is the new bearer
scheme, even against an empty baseline. This is recorded as a new `/api/v1`
contract replacing the unpublished, unversioned prototype. No external clients
have been verified; that is not proof none exist. No existing OpenAPI baseline
was found, so the empty baseline does **not** reconstruct legacy endpoints or
prove compatibility. Future v1 changes should compare against the actual
released v1 spec rather than reuse this empty baseline.

The generic scorecard penalizes local HTTP, absent server pagination/filtering,
single-file POSTs and no hypermedia. Those are intentional contract choices,
not newly implemented features. Full-album metadata is returned once; public
album manifests are cached and the requested frontend initially renders a
36-photo window. That rendering window is **not** server pagination, a hard
album-size cap, or measured evidence that large manifests cannot lag.
Measure manifest byte size, parse time and large-album DOM work before release.

Tool limitations: response-description/schema checks do not resolve `$ref`;
the detailed-error heuristic expects two flat properties, not the specified
nested error envelope; security coverage counts `security:[]` as secured.
Presence of `Cache-Control:no-store` is scored as a caching indication but
does not mean local private responses are publicly cacheable. A letter grade
is not an authorization/security test. We have not invented OAuth, HTTPS,
pagination, flat error fields or unsupported routes to improve the grade.

## Integration checks still required

At review time the inspected backend entry point was still the unversioned
prototype; main is implementing its replacement concurrently. This spec is a
design contract, not a claim that the old backend already enforces it.

- Test hostile Host/Origin, cross-site/missing-Origin bootstrap, non-loopback
  binding and unauthorized reads/writes/media; ensure guards precede file
  parsing and errors keep the envelope.
- Confirm exact field validation, null/empty semantics, presets,
  `metadataSource` vocabulary, URL spelling and status/code values against
  the completed server. All examples are placeholders.
- Fix/verify client startup races: protected reads must await session.
  `getSession()` currently memoizes a failed bootstrap and has no refresh
  after restart. Invalid success JSON must not masquerade as an empty object
  or a successful owner session with a missing token.
- Verify uploads and publication/export preserve SHA-256 original bytes and
  exclude draft IDs/cover images. Avoid leaking stacks or internal metadata.
- POST retries are not guaranteed idempotent. An aborted upload or lost
  response may already have saved; inspect the album before retrying.
- `exportSite()` waits for completed copying and returns no job handle.
  Long exports need measured timeout/concurrency/cancellation behavior and
  actionable recovery; no async job API or remote deployment is promised.
- Re-run contract checks after source integration. No deployed telemetry,
  original-download proof, privacy audit or user usability test is claimed.

## Reproduce the provided tool checks

Run from the project root in Bash or zsh; the breaking check extracts the
preserved empty baseline in memory rather than treating the composite result
document as an old API specification.

```bash
api_review_tools=/Users/shailpatel/.agents/skills/engineering/skills/api-design-reviewer/scripts
python3 "$api_review_tools/api_linter.py" docs/openapi.json --format json
python3 "$api_review_tools/breaking_change_detector.py" \
  <(node -e 'process.stdout.write(JSON.stringify(require("./docs/api-review-results.json").baseline))') \
  docs/openapi.json --format json --exit-on-breaking
python3 "$api_review_tools/api_scorecard.py" docs/openapi.json --format json --min-grade B
```

Expected retained exit codes are 0, 1, 1 respectively. No commits were made.
