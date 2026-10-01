# SoftAims SQA Assessment — Restful-Booker

Playwright test suite covering the API (`restful-booker.herokuapp.com`) and
UI (`automationintesting.online`) layers of Restful-Booker, plus the test
plan and exploratory bug report requested by the assessment brief.

## Setup

Requires Node.js 18+.

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env   # then fill in the values — see "Test data / credentials" below
```

`npm install` only pulls `@playwright/test`, `@types/node`, `typescript`,
and `dotenv` — no other dependencies — so it should run cleanly on a fresh
checkout. The tests will fail fast with a clear error naming the missing
variable if `.env` isn't set up.

## Running the tests

```bash
npm test                # everything (API + UI)
npm run test:api        # API only, no browser launched
npm run test:ui         # UI only, real Chromium
npm run test:smoke      # anything tagged @smoke, across both projects (8 tests)
npm run test:regression # anything tagged @regression, across both projects (11 tests)
npm run typecheck       # tsc --noEmit — strict-mode type check, no test run
npm run report          # open the last HTML report
```

A GitHub Actions workflow (`.github/workflows/playwright.yml`) runs
`typecheck` + `test:smoke` on every push/PR as a fast must-pass gate, then
`test:regression` as a second job once smoke is green — see
`TEST-PLAN.md` §1.4 (Exit Criteria) for what "done" means for a given build.
There's no `.env` file in CI, so the workflow supplies the same four
variables from repository secrets (Settings → Secrets and variables →
Actions) — `API_USERNAME`, `API_PASSWORD`, `UI_ADMIN_USERNAME`,
`UI_ADMIN_PASSWORD` — which must be configured there before the workflow
will pass.

Both suites run against the **live public servers** — there's no local
environment to stand up. Expect network-dependent flakiness typical of a
shared, free-tier-hosted sandbox (occasional cold-start latency on Heroku).

## Important: a credential discrepancy from the assessment brief

The brief states the `/auth` endpoint and UI admin panel share the
credential `admin` / `password`. Verified against both live servers on
2026-09-10, that's only true for the **UI** admin login
(`automationintesting.online/admin`). The separate **API**
(`restful-booker.herokuapp.com/auth`) rejects `password` and only accepts
`admin` / `password123`:

```bash
$ curl -s -X POST https://restful-booker.herokuapp.com/auth \
    -H "Content-Type: application/json" -d '{"username":"admin","password":"password"}'
{"reason":"Bad credentials"}

$ curl -s -X POST https://restful-booker.herokuapp.com/auth \
    -H "Content-Type: application/json" -d '{"username":"admin","password":"password123"}'
{"token":"..."}
```

This makes sense once you notice the API and the UI are two independent
backends (confirmed: a booking created via the API never appears in the
UI's room/booking data, and vice versa) with separate credential stores —
the brief's single credential line just doesn't hold for both. This is
**not** listed as an application bug in `BUG-REPORT.md` since it's a
documentation mismatch in the assessment brief, not a defect in either
system under test.

## Test data / credentials

No credential value is committed anywhere in this repo, and there's no
dedicated credentials module either — both spec files read
`API_USERNAME` / `API_PASSWORD` / `UI_ADMIN_USERNAME` / `UI_ADMIN_PASSWORD`
straight from `process.env` at the point they're needed, via a shared
`requireEnv(name)` guard in `utils/helpers.ts`. It throws immediately,
naming the missing variable, if it isn't set — there's no hardcoded
fallback to fall back to.

Those variables are supplied via a git-ignored `.env` file, loaded in
`playwright.config.ts` via `dotenv.config(...)` before any spec file runs.
`.env.example` is the committed template — copy it to `.env` and fill in
the four values described in "credential discrepancy" above
(`admin`/`password123` for the API, `admin`/`password` for the UI).
Restful-Booker's demo credentials aren't sensitive in themselves, but the
mechanism is the same one you'd want for a real project's actual secrets:
nothing sensitive lives in a file that gets committed, full stop, rather
than relying on judgment calls about which specific values are "safe
enough" to hardcode.

## Test data cleanup

Every API test that creates a booking calls the `trackBookingId` fixture
(`fixtures/apiFixtures.ts`) with the returned `bookingid` immediately after
creation. In its teardown that fixture calls `deleteBookings()`
(`utils/cleanup.ts`), which deletes every tracked booking regardless of
whether the test passed or failed, so nothing is permanently
left behind in the shared public sandbox on a normal run. The same file also
provides an `authToken` fixture so tests that need a token get it once from
Playwright's fixture system instead of each calling `getAuthToken(request)`
independently.

## Structure

```
tests/
  api/
    booking-api.spec.ts   # Section 2 — request-only, native { tag } options
  ui/
    booking-ui.spec.ts    # Section 3 — real browser, Page Object Model
pages/
  ContactFormPage.ts       # Page Object for the public contact form
  AdminLoginPage.ts        # Page Object for the admin login screen
utils/
  helpers.ts                # requireEnv(), getAuthToken(), createBooking() — actual helper logic
  cleanup.ts                # deleteBookings() — teardown for bookings created during a test
fixtures/
  apiFixtures.ts             # Playwright test.extend fixtures: authToken, trackBookingId
  bookingPayload.ts          # validBookingPayload() test data builder
  contactMessages.ts         # validContactMessage() test data builder
.github/workflows/
  playwright.yml            # CI: typecheck + smoke gate, then full regression
.env.example                 # committed template — copy to .env, fill in, never commit .env
tsconfig.json                # strict-mode TypeScript config
TEST-PLAN.md               # Section 1 (includes 1.4 Exit Criteria)
BUG-REPORT.md               # Section 4
```

Deviations from the benchmark structure: `utils/` holds actual helper
functions (`requireEnv`, `getAuthToken`, `createBooking`) so they're not
duplicated across ~13 API tests or between the API and UI specs; `fixtures/`
holds everything that's reusable test setup or test data — Playwright's own
`test.extend()` fixtures alongside the booking and contact-message data
builders — kept separate from `utils/` since data/fixtures and behavior
helpers are different things; and `.github/workflows/` was added for CI
even though the brief doesn't require it. All are small enough that
inlining them would have been fine too for a suite this size — judgment
calls, not load-bearing abstractions.

## Design notes / judgment calls

- **Tags over separate files**: `@smoke`/`@regression` are applied via
  Playwright's native `test(title, { tag: '@smoke' }, fn)` option rather
  than splitting into separate spec files (or embedding the tag in the title
  string) — `--grep @smoke` still matches these, since Playwright includes
  native tags in the string used for grep matching, so `npm run test:smoke`
  still runs both API and UI smoke tests together.
- **Two Playwright "projects"** (`api`, `ui`) are defined in
  `playwright.config.ts` instead of a single global `baseURL`, since the two
  backends live at different hosts and only one project needs a real browser.
  Each project's `baseURL` reads from an env var first (`API_BASE_URL`,
  `UI_BASE_URL`), falling back to the live sandbox URLs — unlike
  credentials, base URLs aren't sensitive, so a safe hardcoded fallback is
  fine here rather than requiring the env var.
- **Assertions document actual behavior, not "should be" behavior**, per the
  brief's explicit instruction for the auth-quirk and missing-field cases —
  several tests intentionally pin currently-buggy behavior (see comments in
  `booking-api.spec.ts`) so the suite fails loudly if/when that behavior
  changes, rather than silently drifting out of date with `BUG-REPORT.md`.
- Selectors in the Page Objects (`data-testid` where the app provides one,
  falling back to `#id` or role/text) were taken directly from the live DOM,
  not guessed.
