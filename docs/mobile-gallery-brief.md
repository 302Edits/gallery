# Mobile-first gallery design brief

Status: implementation brief, not a completed redesign or research report.
Source: the owner's requirements and inspection of the current code.
No interviews, analytics, participant quotations, or user preference scores
have been collected. The visitor and owner journeys below are hypotheses to
validate, not research-backed personas.

## Intended experience

A quiet, curated sports-photography archive. Photographs take precedence over
interface decoration. An album should feel like an exhibition rather than a
file picker. Phone usage is the primary design context; desktop visitors
retain equally complete browse and download controls.

## Visitor journey hypothesis

Scope: an athlete, family member, or fan arrives from a shared album link and
saves a small group of photos. Intended duration: under two minutes, excluding
network-dependent transfers.

| Stage | Action and touchpoint | Hypothesized feeling / concern | Design opportunity | Validation target |
| --- | --- | --- | --- | --- |
| Discover | Open an album link or the collection index | Wants confirmation of the event | Prominent cover, album title, date, sport, and location | Identify the event in 10 seconds |
| Browse | Scroll photographs and use filters | Wants their photos without losing place | Simple date/sport filters, clear empty states, preserved scroll position | Find a relevant photo within 30 seconds |
| Inspect | Open a photograph and move to adjacent photos | Wants detail and predictable controls | Full-screen viewer, visible next/previous buttons, optional swipe, keyboard support | Navigate and return without losing position |
| Select | Choose several photographs | Worries about losing a selection | Explicit selection mode, selected count, deselect action, persistent tray | Select three photos without assistance |
| Save | Download original files | Needs assurance that quality is retained | Clearly labeled original-quality downloads, size estimate, progress and retry | Save the intended originals, not previews |

## Owner journey hypothesis

Create or edit an album, choose a cover and theme, select multiple files,
review detected metadata, correct individual dates or apply explicit batch
overrides, publish, and copy the album link. Publishing success must describe
what was actually saved; partial failures must stay visible and retryable.
Hosting and upload permissions remain unresolved until backend discovery.

## Interaction requirements

- Album links should open the correct collection directly and support browser
  Back/Forward navigation.
- Primary touch controls should be at least 44 by 44 CSS pixels. Do not rely
  on hover, swipe gestures, color alone, or unlabeled icons to expose actions.
- Use a safe-area-aware sticky download tray when photos are selected; it
  must not obscure the final grid row or mobile keyboard.
- Use a two-column phone grid when content and viewport permit, with an
  intentional one-column treatment for feature photos and narrow screens.
  Desktop spacing should expand without stretching captions excessively.
- The viewer must offer visible close and navigation controls, focus
  management, Escape and arrow-key support, and scroll locking.
- Keep date, sport, and location readable in light and dark themes. Use a
  restrained typographic hierarchy and generous image-focused spacing.
- Theme preferences should persist on the current device and initially
  respect the device appearance setting. Album themes should be editable
  after creation; existing albums need a safe default.
- Album presets and custom accents should use accessible foreground colors.
  Theme changes must also update upload dialogs, empty/error states, filters,
  and selection controls, not only the page background.
- Animate opacity and transforms sparingly. Honor reduced-motion settings;
  never hold interaction or image visibility behind an animation.
- Show explicit loading, offline/error, empty-album, upload failure, and
  download failure states. Avoid alert dialogs for routine feedback.

## Image-quality and performance acceptance requirements

These are implementation requirements, not measured results or a chosen
hosting architecture.

- Original downloads must match the uploaded original bytes; verify hashes.
- Browsing must use appropriately sized derivatives when available, not
  original full-resolution files as every grid thumbnail.
- Reserve image space using known dimensions to avoid content jumps.
- Lazy-load below-the-fold images and decode asynchronously. Prioritize only
  the genuinely visible hero/cover; avoid downloading every album up front.
- Do not re-fetch album data merely because a theme, selection, or viewer
  state changes. Cancel superseded requests and prevent stale responses from
  replacing a newer album.
- Bound rendered content and photo-transfer concurrency for large albums;
  batch downloads must not exhaust a phone's memory.
- Test at 360, 390, 768, and 1440 CSS pixels, with throttled networking and
  reduced-motion settings. Target no horizontal overflow or unexpected grid
  shifts. Measure actual performance before claiming the site does not lag.
- Hosting quotas, latency percentiles, uptime objective, backup cadence, and
  recovery-time targets remain pending the backend discovery gate.

## Usability validation plan

Conduct one pilot, then five moderated sessions with intended visitors using
their own phones where feasible, plus an owner workflow session. Obtain
consent before recording. Ask participants to think aloud; do not direct them
to particular controls or colors. Automated browser checks supplement rather
than replace participant testing.

| Scenario | Success condition | Target |
| --- | --- | --- |
| Someone shares photos from your event | Find the relevant album without help | At least 4 of 5 visitors; under 30 seconds |
| You want a closer look at an action shot | View adjacent photos and return to the same scroll position | At least 4 of 5; under 20 seconds |
| You want three photos for printing | Select and initiate the correct original downloads | At least 4 of 5; under 60 seconds excluding transfers |
| You prefer a different appearance | Change appearance without losing album or selection | At least 4 of 5; under 15 seconds |
| Your connection drops during a transfer | Understand the error and retry without lost selection | No unrecoverable failure |
| The owner adds a new event | Publish an album and batch of photos with correct dates and theme | Complete without developer intervention after setup |

Collect completion rate, time on task, assistance, errors, and a 1–5 ease
rating. Target fewer than 15% task errors and average ease above 4/5.
Classify observed issues as critical (blocks task), major (substantial
friction), minor (recoverable hesitation), or cosmetic. Do not invent
participant frequencies; record them only after actual sessions.
