## v2.3.6 — 2026-11-07

Your routes use the airline route layout; created routes draw a blue line on the globe and are kept; routes and flight numbers seen live are added to the airline page with their date.

## v2.3.5 — 2026-11-07

Radar range 250 nm per airport; light global sweep every 5 minutes for new flights; flights expire at estimated landing or shortly after last sighting near the destination.
Notifications request sound; What’s new notice on the home screen in the user language, always ending with bug fixes.

## v2.3.0 — 2026-11-03

- Add official Star Alliance, SkyTeam and oneworld logos, and smooth page transitions.
- Show the hub in yellow and arrival airports as white dots on airline pages.
- Restrict the explorable globe to flights, the home screen, routes and airline/airport pages; show national airlines first on airports, then other airlines landing there.
- Add a per-version "What's new" screen on the home page in all five languages, always ending with bug fixes, and a first-visit notifications prompt.
- Add community airlines: create (shape, initials, colors, hub, routes), publish, save, report, and show the airline on the profile and invite card.

## v2.2.5 — 2026-11-01

- Add optional Web Push for scheduled flights with per-device alert preferences, native permission prompts and a test notification.
- Add authenticated subscription endpoints, VAPID sending, a push-only service worker, account isolation and sign-out cleanup.
- Add server dispatch with current-booking validation, database delivery leases, retry handling, expired-subscription cleanup and scheduler health status.
- Add a service-only Supabase migration and a separate Vault/pg_cron scheduler script; production credentials and activation remain operator setup.
- Explain iPhone/iPad Home Screen requirements, denied permissions and delivery limits in all five interface languages.
- Preserve v2.2.4 features and replace the old profile version label with the current release. See `docs/v2.2.5.md` for activation.

## v2.2.4 — 2026-11-01

- Correct scheduled preflight detection and persist cancellation after three hours without takeoff; guard stale automatic schedule updates.
- Reschedule saved departures with a new date/time and fresh reminder lifecycle; explain browser notification and closed-site limits.
- Apply Departure Dots to airport/airline lists, airline pages and operated-route boards.
- Search/filter live transatlantic and transcontinental routes, including main search shortcuts.
- Add compact alliance links below favourite airlines and translated alliance/member pages.
- Import Volanta JSON/CSV data and MSFS share links alongside PLN, with route selection and explicit authenticated-Planner fallback.
- Preserve the existing mobile dialogs, live discovery, radar and catalog changes. See `docs/v2.2.4.md` for formats and limitations.

# Changelog

## v2.2.3 — bug fix 1 — 2026-10-31

- Prioritize global live discovery, move supplemental site scans after the response, refresh known flights cheaply, and replace shrinking-list pagination with a stable aircraft cursor. Bound route-provider concurrency and respect rate-limit backoff.

- Recognize older timestamp-based completion logs, saved summaries and terminal checklists before offering a device handoff. Migrate local terminal records that older clients never queued.
- Renew active owner sessions with a heartbeat; expire abandoned handoff sessions after their inactivity/flight-duration grace without creating completed trip logs.
- Add an account-scoped “This flight has already ended” action to close a stale run on every device, with compare-and-swap protection for newer runs.
- Use new black-on-white favicon, Apple, install and branding asset filenames, plus a versioned manifest, to bypass old icon cache entries.
- Expose the deployed release and Vercel commit at `/api/version`; preserve the v2.2.3 package version.

## v2.2.3 — 2026-10-31

- Use a locally bundled OFL Doto dot-matrix font for flight boards, trips and flight history.
- Mark missed departures delayed and auto-cancel after three hours; send check-in, doors, overdue/disembark and cancellation reminders while the app is open. Opening preflight no longer counts as takeoff.
- Expand radar-only sampling with active OurAirports airfields and heliports, without adding them to commercial airport lists.
- Add the user-provided Brasileirinho profile: one F33A Bonanza, PS-BZR, 24 historical itinerary legs through 30 October, registration-only live tracking and optional Cessna simulation substitutions.
- Retain observed route flight numbers and aircraft types on the device for 180 days independently of live-position expiry.
- Show estimated arrivals, last-position context and transatlantic route labels; keep estimates anchored to observations and source timetables.

## v2.2.2 — 2026-10-31

- Separate home discovery from route paths and replace country fill with subtle white boundaries.
- Rotate radar sampling across every source airport coordinate, including airports absent from the visible catalog. Keep provider requests bounded and preserve route endpoint assignment.
- Show the MyRoster emblem in black on white in the app, install icons and sharing metadata, with refreshed icon URLs.
- Persist terminal flight updates across navigation/offline periods, reject stale completion prompts, repair older active records using log/trip evidence, and stop timers when the remote run ends or disappears.

## v2.2.1 — 2026-10-31

- Discover countries and clickable airport markers while exploring the globe on the home page.
- Inspect airport and airline descriptions, country directories, operating airlines and hubs before opening their pages.
- Keep discovery layers, data fetching and selection panels disabled on route and flight pages.
- Bundle low-resolution Natural Earth country boundaries locally; airport and airline descriptions use the existing sanitized reference catalog.

## v2.2.0 — 2026-10-31

- Use the supplied MyRoster logo as a monochrome transparent PNG in the app and a black mark on a white background for PWA, Apple and favicon icons.
- Keep the same globe rotation speed in airport browsing and the home view. Enable drag and zoom during flights, with a mobile-friendly exploration mode, zoom buttons and a recenter control.
- Back controls return to the previous internal page. Deep links have a safe fallback, and search queries stay in the history entry so Back restores the results.
- Offer commercial flight numbers observed on the exact airline and direction, including recent device history. Keep the selected or manually entered number through planning and flight. Do not infer a commercial number from an alphanumeric operational callsign or invent a number for a static catalog route.

Flight-number availability still depends on observed provider data; the historical route catalog does not contain schedules or flight numbers. User-entered numbers belong to simulation plans.
