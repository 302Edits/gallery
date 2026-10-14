# Gallery threat model and security review

Status: **scoped local verification complete; public launch conditional**,
not a blanket security sign-off.
Scope: the private computer-only manager, preparation/storage, deliberate static
publication and public viewing/downloads. No provider deployment, production
telemetry, permissions audit, independent backup or live SLO is asserted here.
The owner confirmed public access, not the publication rights of each image.

Only `backend/tests/security.test.js`, this document and `security-review.json`
were created by this branch. Application source, existing photos and databases
were not changed. Tests create real local apps and SQLite databases under exact
disposable `mkdtemp` paths; importing the application does not open the owner DB.
Port 5001 is the current manager default; tests use ephemeral loopback ports.

## Assets, actors and boundaries

Protect unchanged originals, draft photos, local paths, album settings, the
in-memory owner token, backups and publication integrity. Public photo copies
and deliberately published descriptive metadata are intentionally downloadable.
GPS and other embedded EXIF can remain in original bytes; public access is not
an assertion that the content is non-personal or safe to publish.

The owner, owner computer/OS, installed software and selected publishing
account are trusted. Hostile web pages, remote visitors and uploaded file bytes
are untrusted. A process or browser extension already controlling the computer
can call the local session endpoint: this is a local capability boundary, not
proof of a human identity or a substitute for OS security.

```text
Owner browser
  -> [loopback + Host/Origin/Fetch Metadata boundary]
  -> Express local process -- bearer-gated API --> SQLite settings
            |                                  local originals/previews/backups
            +-- deliberate publish + checksum + metadata backup
                    -> static export (published selection only)
                    -> [publishing-account / public HTTPS boundary, unverified]
                    -> public manifest + photos -> visitor browser
```

API reads and writes are bearer-gated except session bootstrap. Local `/media`
is protected by loopback/Host/Origin/Fetch Metadata checks, **not bearer auth**;
known local photo IDs can be read by trusted local clients. Never expose or
proxy the manager onto a public interface. A public export must not contain
drafts, the DB/backups, tokens or a working management API.

## STRIDE / DREAD register

Scores are prioritization estimates, **not measured exploit probabilities**.
The vector is Damage / Reproducibility / Exploitability / Affected users /
Discoverability, each 1–10; the score is its mean **before controls**. “Backend
maintainer” means the implementer of this local application; “Site owner” means
the sole uploader/operator. Every score ≥7 has an owner and verification or an
explicit outstanding check. No unverified residual risk is marked accepted.

| ID / DFD element | STRIDE threat | DREAD vector / mean | Owner; mitigation and evidence |
| --- | --- | --- | --- |
| T01 Owner browser / loopback flow | S, T, E: hostile webpage bootstraps a session via DNS rebinding or cross-site access | 9/9/7/8/8 = **8.2** | Backend maintainer: exact loopback Host and configured Origin allowlists, remote-address check, Fetch Metadata rejection, no wildcard CORS. `session and authenticated API reject rebinding and cross-site browser requests` passes; non-loopback remote-address denial is code-inspected, not LAN-tested. |
| T02 Loopback process | S, E, I: leaked or forged owner token grants management access | 9/8/7/8/7 = **7.8** | Backend maintainer: random 32-byte per-process capability, constant-time comparison, no-store session response, no token in export. `owner API reads and writes require a valid process-scoped bearer token` passes, including cross-instance token rejection. Site owner: trust only their OS/browser/local software. No session timeout, individual user login or protection from local malware is claimed. |
| T03 Filesystem / upload flow | T, E, I: active SVG or a false JPEG MIME declaration is treated as a photo | 8/10/8/8/9 = **8.6** | Backend maintainer: inspect decoded format, reject unsupported SVG/text, preserve originals only after inspection, generate separate WebP previews, clean failed staging. `actual image decoding rejects SVG and spoofed JPEG; rejected files are cleaned up` passes for both upload and inspection routes. This is not a sandbox or comprehensive decoder-fuzzing result. |
| T04 Public manifest | I, T: drafts, local paths or credentials enter the public export | 9/9/7/8/8 = **8.2** | Backend maintainer: explicit publication snapshot and public-field allowlist, static-only build marker, private-file screening. `public export excludes drafts, local paths, owner token and private database` passes with an isolated exporter fixture. Real production build inspection and provider deployment remain required; the fixture is not proof of emitted JS contents or CDN access policy. |
| T05 Publishing flow | I, T: public unchanged originals expose GPS, identifiable athletes or content without publishing permission | 8/10/8/8/9 = **8.6** | Site owner: review each photo and embedded metadata and publish only permitted material. Backend maintainer: explicit boolean acknowledgement before publication; `publication requires explicit public-original acknowledgement` passes. Owner UI warnings and actual rights/content review are unverified. Acknowledgement does not prove consent or legal compliance; never silently strip bytes or call the originals private. |
| T06 SQLite / API flow | T, E, I: user text changes SQL meaning or invalid dates/fields corrupt settings | 9/8/6/8/7 = **7.6** | Backend maintainer: parameterized SQL, bounded typed fields and calendar validation. `SQL-looking user text stays data and does not widen photo queries`, field-validation tests and photo-edit tests pass. DB access is additionally subject to trusted local filesystem permissions; arbitrary local DB edits are not prevented. |
| T07 SQLite + filesystem stores | D, T, I: originals/settings are lost or backups expose drafts | 10/7/5/8/8 = **7.6** | Site owner: keep separate verified originals and private settings backups; restore target is best-effort 24h, not guaranteed. Backend maintainer: post-publication SQLite backup and integrity checks. The exporter fixture verifies a local backup file is produced; that is **not an independent backup or restore test**. Main-owned backup/restore tests and an operator restore drill are separate; no evidence of original backup copies exists here. |
| T08 Loopback media process | T, D: inherited object names bypass a media variant allowlist and cause 500 errors | 3/10/7/2/8 = **6.0** | Backend maintainer: main added `Object.hasOwn` to media selection. After the fix, `media variant allowlist and storage boundary never expose arbitrary files` passes: `__proto__`, `constructor`, `toString` and other unknown variants return 404. Outside-root and sibling-prefix paths also return 404. No arbitrary-file disclosure was observed. |
| T09 SQLite gallery write | T: creation accepts an invalid cover reference without reporting rejection | 3/10/8/2/7 = **6.0** | Backend maintainer: main now rejects nonempty cover references on creation with 400; owners select covers after uploading. `invalid covers on album creation are not silently accepted` now passes; PATCH continues to reject invalid covers. The initial data-integrity/validation defect is resolved, not evidence of a prior unauthorized-access exploit. |
| T10 Loopback preparation process | D: excessive multipart/image work exhausts RAM, CPU or disk | 5/8/6/2/7 = **5.6** | Backend maintainer: one file/request, bounded field sizes, 100 MiB/file, 60M input pixels and two processing lanes; these are implementation controls, not a capacity guarantee. Count/field-size rejection and staging cleanup pass. A 100+ MiB transfer, pixel-bomb rejection, disconnect/concurrency stress and disk-full recovery were not exercised in this branch. |
| T11 Owner entity / SQLite | R: owner cannot reconstruct who edited or published material | 4/6/3/2/5 = **4.0** | Site owner: maintain publishing records; publication timestamps and snapshots aid recovery, not non-repudiation. No tamper-evident audit log or multi-user attribution exists. Do not describe settings backups as security audit logs. |
| T12 Public delivery / manifest flow | D, T: abuse, quotas, missing files or provider failure make downloads unavailable | 5/8/6/8/8 = **7.0** | Site owner: review quotas and the reliability plan, retain known-good exports and separate backups, check representative downloads after deployment, repair/rollback when needed. Backend maintainer: static-only delivery and export preflight. Main-owned quota tests are separate. CDN abuse controls, real transfer scale, provider SLA and live 99% compliance are unverified, not promises. |
| T13 Filesystem / media + export | T, I: local symlink/DB tampering escapes a lexical root check or hard-linked exports mutate after verification | 9/4/4/2/4 = **4.6** | Site owner: trusted local storage; never edit managed originals or exported hard links in place. Backend maintainer: consider realpath/regular-file validation and post-copy integrity checks if local untrusted writers enter scope. Lexical outside-root tests pass; symlink races and local compromise are not tested or ruled out. |

## Required tool runs and applicability

The senior-security skill's `threat_modeler.py` was run for all six requested
DFD components. Its keyword database produced 22 generic suggestions. Three
component/threat entries score ≥7: Credential Theft 8.2 (owner browser), API Key
Impersonation 7.2 (loopback process and publishing flow). They map to **T01/T02**,
with backend-maintainer controls and the site-owner trusted-computer obligation.
The tool's score is heuristic; generic password/JWT/MFA suggestions are not
evidence that this app uses passwords/JWTs, and enterprise tooling is not a
requirement for this local capability design. `--assets` was supplied, but the
script does not use that option to specialize threats; this register supplies
the actual asset-specific analysis. No automated “secure” verdict is inferred.

The supplied `secret_scanner.py` was run at minimum severity **high**, one file
at a time across 20 active backend/frontend/config/launcher sources. All exit
codes were 0 with **zero high/critical matches**. Dependencies, generated builds,
photo assets, live databases/backups, environment secrets and the unused nested
legacy scaffold were deliberately excluded. This is a targeted pattern sweep,
not a whole-repository/history scan or proof that no secret exists. Finding
values are omitted from the retained report, even if the scanner masks them.
The stock tool ignores `.jsx` and `.mjs` extensions: eight affected files were
re-scanned by loading the supplied scanner with `runpy` and adding those two
extensions to its pattern allowlists **in memory only**. Its regexes and CLI
entry point were unchanged; no skill files were edited. Fresh results and
source SHA-256 snapshots cover all 20 files, with zero high/critical matches.

Full tool outputs, exact scanned paths and review status are retained in
`security-review.json`. Both tools were re-run after main's T08/T09 fixes:
all six model runs and all 20 targeted secret scans exit 0, with no high/critical
secret matches. Every DFD component has STRIDE coverage and every DREAD ≥7
entry has a named mitigation owner. The senior-security skill's **scoped local
test-and-tool gate is complete**; deployment and operator checks below remain
unverified. The threat-model tool's exit 0 itself is not a security verdict.

## Test result and handoff

Initial security run: **51 tests, 46 passing, 5 failing**, including one failed
media parent and its three failed leaf cases. Four failed assertions identified
two source defects (T08/T09). Main fixed both, leaving all regressions enabled.

Verified final rerun: `npm test` in `backend` reports **59 tests, 59 passing,
0 failing, 0 skipped**: this branch's 51 counted cases plus eight main-owned
integration tests. Both source fixes were also inspected. Tests remained
isolated from the owner's real database and photo collection.
The full 59-test suite passed again after exported originals moved to
`/originals/{id}.{extension}`; security tests resolve the original URL from the
manifest rather than assuming an image-folder path. Both security tools and
source snapshots were refreshed after that exporter change.

The current main suite reports 20 passing Playwright scenarios across phone and
desktop, including public-no-owner-API, theme/no-refetch/selection, viewer focus,
multi-photo ZIP hashes with duplicate filenames, desktop batch upload, bounded
large-download grouping and recovery from bootstrap/archive failures. This
security review branch did not produce that browser evidence independently.

Before public launch: inspect the actual static artifact and HTTPS/provider
behavior, verify owner-only local binding, complete per-image publication
review and validate independent original backups and an operator restore drill.
No commit, provider account, paid service or public deployment was created by
this branch. An API scorecard warning is separate from this security gate and
must not be presented as an API-review pass.
