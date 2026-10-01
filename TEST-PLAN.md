# Test Plan — Booking CRUD (Restful-Booker)

## 1.1 Scope & Objectives

**What is being tested and why**

This plan covers the Booking CRUD feature of the Restful-Booker API
(`https://restful-booker.herokuapp.com`): `POST /booking`, `GET /booking/:id`,
`PUT /booking/:id`, `PATCH /booking/:id`, and `DELETE /booking/:id`, plus the
`POST /auth` endpoint that gates the write operations. Booking CRUD is the
core value-delivering path of the product — every other feature (search,
reporting, the UI booking flow) depends on booking records being created,
read, and modified correctly. Its risk profile is dominated by two things:
loose input validation (confirmed during exploratory testing — see
`BUG-REPORT.md`) and an auth model built on a single shared, non-expiring
token rather than per-user sessions.

**Explicitly out of scope**

- The web UI (`automationintesting.online`) — covered separately in
  Section 3 / `tests/ui/`, and it runs against a different backend entirely
  (confirmed during exploration: different credential store, different data
  store — a booking created via the API is not visible in the UI's rooms
  demo, and vice versa).
- The `/room` and `/message` (contact form) resources — different feature
  areas, only referenced here where they affect Booking CRUD's auth model.
- Non-functional testing: load/performance, and true concurrency testing
  (racing two clients against the same booking ID). Restful-Booker is a
  shared public sandbox with no test-isolation mechanism (no per-run
  namespace, no reset endpoint scoped to a single client), so a concurrency
  test would create bookings and side effects visible to every other
  candidate/user hitting the same instance, and results would be unreliable
  on a Heroku free-tier dyno subject to cold starts. On a real project this
  would be tested in an isolated environment instead of skipped.
- Token lifecycle/expiry testing — the API does not document or expose a
  token TTL, and tokens observed during testing did not expire within the
  session, so expiry can't be exercised without internal access to the
  service.

## 1.2 Risk-Based Test Coverage

| # | Risk | Testing Approach |
|---|------|-------------------|
| 1 | **Broken write-access control** — `PUT`/`PATCH`/`DELETE` succeeding without a valid token, or with a malformed/garbage token, would let any anonymous caller tamper with or destroy bookings. | Would run negative-path tests on every write endpoint: no `Cookie` header, an empty token, and a syntactically-invalid token, each asserting `403`/`404` as appropriate. Currently automated: `PUT` without a token returns `403` (`tests/api/booking-api.spec.ts` — "PUT /booking/:id without an auth token returns 403"). |
| 2 | **Weak input validation on write operations** — the API is confirmed (exploratory testing) to accept a missing required field with an unhandled `500` instead of a `400`, and to accept a negative `totalprice` and an inverted `checkin`/`checkout` range with no rejection at all. Bad data persisted here can corrupt anything downstream that trusts the record (reporting, invoicing). | Would run boundary/negative-value tests for `POST`/`PUT`: missing required fields, negative/zero/huge `totalprice`, non-boolean `depositpaid`, `checkout` before `checkin`, and a string where a number is expected, each asserting and documenting the API's *actual* response rather than the response we'd prefer, per Section 2.2's instruction. Currently automated: missing `firstname` (`500`, `BUG-REPORT.md` Bug 3) and negative `totalprice` (accepted), both pinned in `tests/api/booking-api.spec.ts`. |
| 3 | **Resource-lifecycle handling on IDs** — non-existent, already-deleted, or malformed (`non-numeric`) booking IDs could either crash the server or leak information about which IDs exist (enumeration). | Would run negative tests for `GET`/`PUT`/`DELETE` against a non-existent ID (`999999999`), a non-numeric ID (`abc`), and an ID that existed but was just deleted. Checked manually: `GET` returns `404` for all three, consistent and non-leaky. Currently automated: `GET` on a non-existent ID and on a just-deleted ID. |
| 4 | **Response schema drift** — Restful-Booker is a third-party sandbox outside our control; a field rename, a type change (e.g. `totalprice` becoming a string), or `bookingdates` being flattened would silently break any consumer that deserializes the response loosely. | A dedicated regression test asserts the *exact* shape and field types of a created booking (`expect.any(String/Number/Boolean)` per field, not just "the object exists"), so a schema change fails loudly instead of passing an overly-permissive assertion. |
| 5 | **Non-standard status codes being "fixed" without notice** — the API deliberately (or as a bug) returns `200` for a failed login and `201` for a successful delete, both unusual for REST. If a future deploy "corrects" these to `401`/`204`, any client coded against the current contract breaks silently. | Tests explicitly assert the *current* quirky codes (`200` + `{"reason":"Bad credentials"}` on bad auth; `201` on delete) with an inline comment explaining why, so a change to conventional codes is caught by CI rather than discovered by a consumer in production. |

## 1.3 Test Coverage Matrix

| Operation | Smoke | Regression | Negative |
|---|---|---|---|
| Create Booking | Valid booking created, returns `bookingid` + full object | Exact response schema/types asserted; negative `totalprice` accepted (bonus test, pins validation gap) | Missing required field (`firstname`) → documents actual `500` behavior (Bug 3) |
| Get Booking | Fetch a just-created booking returns matching data | — | Non-existent ID → `404` |
| Update Booking | Valid `PUT` with token updates and returns new values | — | `PUT` without token → `403` |
| Partial Update | — | `PATCH` updates one field, leaves the rest unchanged (bonus test) | Not automated — see note below |
| Delete Booking | `DELETE` with valid token → `201` | Follow-up `GET` after `DELETE` confirms `404` | Not automated — see note below |

Every test in the Negative column is tagged `@regression` in code; the column
describes the kind of check, not a separate tag.

**Notes on blank cells:** "Partial Update / Negative" (e.g. `PATCH` without a
token, `PATCH` on a non-existent ID) and "Delete / Negative"
(e.g. deleting an already-deleted booking, confirmed live to return `405`)
are identified risks but were left unautomated to stay within the assessment's
time budget — `PUT`'s negative-auth case already exercises the same
underlying auth middleware that `PATCH`/`DELETE` share, so the marginal risk
reduction from testing all three separately is lower than for the cells that
are covered. On a real project these would be filled in before sign-off.

## 1.4 Exit Criteria

Booking CRUD testing for a given build is considered "done" when all of the
following hold:

1. **Every `@smoke` test passes** on the target build, with zero retries
   needed (`npm run test:smoke` — currently 8 tests). This is the must-pass
   gate for every commit.
2. **Every `@regression` test passes** (`npm run test:regression`) before
   that build is promoted past a feature branch — the full-suite gate, run
   less frequently than smoke but required before merge/release.
3. **No new `Critical` or `High` severity defect is open and unaccepted.**
   A defect at either severity blocks sign-off unless a stakeholder has
   explicitly accepted the risk in writing (e.g. Bug 1 and Bug 3 in
   `BUG-REPORT.md`, if still unfixed at release time, would each need this).
   `Medium`/`Low` defects (e.g. Bug 4) do not block, but must be logged.
4. **Every non-blank cell in the Section 1.3 coverage matrix has a
   corresponding passing automated test** — i.e. the matrix and the actual
   test suite haven't drifted apart. The cells explicitly marked "not
   automated" in the notes above are excluded from this check by design,
   not by oversight.
5. **`npm run typecheck` passes with zero errors.** Strict-mode TypeScript
   is a cheap, fast gate and a regression here (e.g. a widened `any`) is
   treated as a build-blocking failure, not a warning.
6. **No flakiness observed across 3 consecutive full-suite runs.** Since
   both systems under test are live public sandboxes rather than a
   controlled environment, a single green run isn't sufficient evidence of
   stability — 3 consecutive clean runs is the bar for calling a build's
   test results trustworthy rather than lucky.

These criteria are intentionally scoped to what's measurable from CI output
and the bug tracker alone — no criterion here requires subjective judgment
about "is it good enough," which is the property that makes exit criteria
useful as an actual gate rather than a discussion topic.
