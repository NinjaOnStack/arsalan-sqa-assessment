# Exploratory Testing — Bug Report

### Bug 1: Contact-form messages (name, email, phone, enquiry text) are readable by anyone with no authentication

**Severity:** Critical
**Severity Justification:** Not High, because it isn't a misconfiguration with a partial mitigating factor — there is a complete absence of authentication on an endpoint whose sibling (`POST /api/room`) already has it, and the data exposed (name, email, phone, full message text) is unredacted PII rather than metadata. Nothing ranks above Critical on this scale, so this is the ceiling.
**Layer:** API (the UI's own client-side route guard is *not* affected — see below)
**Environment:** `GET https://automationintesting.online/api/message` and `/api/message/:id`

**Steps to Reproduce:**
1. Send `GET https://automationintesting.online/api/message` with no `Authorization` header, no cookie, no admin session of any kind.
2. Observe the response lists every submitted contact-form message (id, name, subject).
3. Send `GET https://automationintesting.online/api/message/1` (still with zero auth).
4. Observe the full record, including the sender's email and phone number, is returned.

**Expected Result:**
Both endpoints should require the same admin authentication that protects the equivalent `POST /api/room` endpoint (confirmed: that one correctly returns `401 {"errors":["Authentication required"]}` with no token) — i.e. `401 Unauthorized`.

**Actual Result:**
```
$ curl -s https://automationintesting.online/api/message
{"messages":[{"id":1,"name":"James Dean","read":false,"subject":"Booking enquiry"}, ...]}

$ curl -s https://automationintesting.online/api/message/1
{"description":"I would like to book a room at your place","email":"james@email.com","messageid":1,"name":"James Dean","phone":"01402 619211","subject":"Booking enquiry"}
```
Both return `HTTP 200` with the full record.

Note for scope accuracy: I also checked whether the UI itself exposes this — navigating a signed-out browser session directly to `/admin/message` correctly redirects to the login page (the client-side route guard works). The vulnerability is confined to calling the API directly; it isn't reachable through normal UI navigation. This distinction is captured as a passing regression test in `tests/ui/booking-ui.spec.ts` ("Your Choice" scenario).

**Why This Matters:**
Anyone who discovers the endpoint URL — no credentials, no browser, a single unauthenticated `curl` request — can harvest every customer's name, email address, phone number, and full enquiry text; this is a real personal-data exposure (GDPR-relevant) and is more severe than a typical UI bug precisely because it requires no interaction with the site at all.

---

### Bug 2: Booking an already-reserved room crashes the entire page instead of showing an error

**Severity:** High
**Severity Justification:** Not Critical, because no data is exposed or corrupted — the backend correctly rejects the duplicate booking; the failure is entirely a broken user experience (a crashed page), not a security or data-integrity issue. Not Medium, because it requires no exploit, malformed input, or unusual navigation to trigger — it's reachable through completely normal, expected use of the site (the calendar's failure to mark dates as booked means an ordinary second visitor hits it) and results in a fully broken page rather than a cosmetic defect.
**Layer:** UI (root cause is missing error handling in the frontend; the backend itself behaves correctly)
**Environment:** `https://automationintesting.online/reservation/:roomId`, Chromium 153 (Playwright)

**Steps to Reproduce:**
1. Book Room 1 for a given date range (e.g. 2027-01-10 to 2027-01-12) through the normal flow: open the room page, click "Reserve Now", fill in firstname/lastname/email/phone, submit. Confirm "Booking Confirmed" is shown.
2. Reload the same room page and check the availability calendar for those same dates.
3. Attempt to book **the same room for the same dates again** (a second visitor, or the same visitor navigating back) through the identical flow.

**Expected Result:**
Step 2: the calendar should show 2027-01-10–11 as unavailable/disabled, since the room is already booked.
Step 3: if a duplicate booking is nonetheless attempted, the UI should show a user-facing error (e.g. "These dates are no longer available") and let the user pick different dates.

**Actual Result:**
Step 2 — the calendar does **not** reflect the existing booking at all: inspecting the day-button elements for the 9th–13th after the room 1 booking exists shows every day still `disabled: false` with no "booked" styling. A real user has no way to know the dates are taken before trying.

Step 3 — the backend does correctly reject the duplicate (`409` from `POST /api/booking`, confirmed via network log), but the frontend does not handle that response:
```
Network:  409 https://automationintesting.online/api/booking
Console:  Failed to load resource: the server responded with a status of 409 ()
PageError: Cannot read properties of undefined (reading 'length')
```
The unhandled exception crashes the page render entirely — Chromium shows its own "This page couldn't load / Reload to try again, or go back" error screen in place of the app. This was reproduced twice, on two different rooms/date ranges, with 100% repro rate. Screenshot: `bug-evidence/duplicate-booking-crash.png`.

**Why This Matters:**
Because the calendar never shows a room as booked, this isn't a rare edge case reachable only by API tampering — any two visitors interested in the same popular dates will hit this through completely normal use of the site, and the second one gets a fully broken page instead of "please pick another date," which for a real hotel would mean a lost booking and a visitor who can't tell if their card was charged.

---

### Bug 3: Creating a booking with a missing required field crashes the server (500) instead of returning a validation error

**Severity:** High
**Severity Justification:** Not Critical, because it doesn't expose data or bypass any access control — the failure mode is a crash, not a leak or an unauthorized action. Not Medium, because an unhandled 500 on trivially-reachable, ordinary user input (simply omitting one field) is a stability risk: a client that retries on 5xx by default would turn a single bad request into repeated load on the server, and the missing error handling here suggests the same gap likely exists for other malformed-input cases not yet tested.
**Layer:** API
**Environment:** `POST https://restful-booker.herokuapp.com/booking`

**Steps to Reproduce:**
1. Send `POST /booking` with a JSON body identical to a valid booking payload but with the `firstname` field omitted entirely (`lastname`, `totalprice`, `depositpaid`, `bookingdates`, `additionalneeds` all present and valid).
2. Observe the response.

**Expected Result:**
`400 Bad Request` with a message indicating `firstname` is required.

**Actual Result:**
```
$ curl -i -X POST https://restful-booker.herokuapp.com/booking -H "Content-Type: application/json" \
  -d '{"lastname":"Brown","totalprice":111,"depositpaid":true,"bookingdates":{"checkin":"2024-01-01","checkout":"2024-01-05"},"additionalneeds":"Breakfast"}'

HTTP/1.1 500 Internal Server Error
Internal Server Error
```
No JSON body, no error detail — an unhandled server-side exception, not a handled validation failure.

**Why This Matters:**
An unhandled exception on ordinary, easily-triggered user input is a stability risk, not just a UX one — a client library that retries on 5xx (a common default) would hammer the server on what is really a 400-class client error, and in less locked-down environments a raw 500 can leak stack traces or internal implementation details.

---

### Bug 4: Booking-form validation errors don't say which field they're about

**Severity:** Medium
**Severity Justification:** Not High, because it degrades usability without ever blocking the booking flow entirely — a user can still eventually satisfy every rule through trial and error, and no data is exposed or lost. Not Low, because it isn't a rare edge case: it affects every single submission where more than one field is invalid at once, which given five required fields is a common, not rare, occurrence.
**Layer:** UI
**Environment:** `https://automationintesting.online/reservation/:roomId` — guest details form (Firstname/Lastname/Email/Phone), Chromium 153 (Playwright)

**Steps to Reproduce:**
1. Open a room's reservation page and click "Reserve Now" to reveal the guest-details form.
2. Leave every field empty (or fill only some) and click "Reserve Now" again to submit.
3. Read the list of validation error messages shown.

**Expected Result:**
Every validation message should identify the field it applies to, consistently, e.g. "Email must be a well-formed email address."

**Actual Result:**
Submitting the form fully empty shows this exact, unlabeled mix:
```
must not be empty
Lastname should not be blank
Firstname should not be blank
size must be between 3 and 30
size must be between 11 and 21
must not be empty
size must be between 3 and 18
```
Only the Firstname/Lastname errors name their field. The rest — almost certainly Email and Phone's rules — give a bound or "must not be empty" with no field name at all. Confirmed further with only the email field invalid (valid firstname/lastname/phone): the single error shown is just `must be a well-formed email address`, again with no "Email" prefix.

**Why This Matters:**
With more than one field wrong at once, a user has no way to tell which of the two unlabeled messages belongs to Email versus Phone — they're left guessing or trial-and-erroring the form, which is exactly the kind of friction that makes people abandon a booking.

---

## Blocker Note

None encountered — both target servers (`restful-booker.herokuapp.com` and `automationintesting.online`) were reachable and responsive throughout both sessions, aside from one apparent transient blip on the very first `/auth` call (see README.md for the credential discrepancy this surfaced, which is a documentation issue in the assessment brief rather than an application bug). Had a genuine outage occurred, the approach would have been to: capture the exact timestamp, status code/timeout, and request; retry with backoff to distinguish a transient blip from a real outage; and if unresolved, document the blocker explicitly in this report (endpoint, error, timestamps) rather than fabricating a result, and continue with whatever parts of the suite don't depend on the unavailable service.
