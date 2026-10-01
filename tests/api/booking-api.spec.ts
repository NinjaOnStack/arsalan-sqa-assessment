import { test, expect } from '../../fixtures/apiFixtures';
import { validBookingPayload } from '../../fixtures/bookingPayload';
import { createBooking, requireEnv } from '../../utils/helpers';

test.describe('Auth Token', () => {
  test('POST /auth with valid credentials returns a token', { tag: '@smoke' }, async ({ request }) => {
    const res = await request.post('/auth', {
      data: { username: requireEnv('API_USERNAME'), password: requireEnv('API_PASSWORD') },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('token');
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
  });

  test('POST /auth with invalid credentials returns 200 with a Bad credentials reason', { tag: '@regression' }, async ({ request }) => {
    const res = await request.post('/auth', {
      data: { username: requireEnv('API_USERNAME'), password: 'wrong-password' },
    });

    // Auth failure returns 200, not 401/403 — the API only signals failure via `reason`.
    // Asserting the real 200 (not the 401 we'd prefer) pins the current contract, and
    // toEqual on the whole body (not just "no token") catches a change to either the
    // status or the error shape.
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ reason: 'Bad credentials' });
  });
});

test.describe('Create Booking', () => {
  test('POST /booking creates a booking and returns bookingid + full object', { tag: '@smoke' }, async ({ request, trackBookingId }) => {
    const payload = validBookingPayload();
    const res = await request.post('/booking', { data: payload });

    expect(res.status()).toBe(200);
    const body = await res.json();
    trackBookingId(body.bookingid);

    expect(body).toHaveProperty('bookingid');
    expect(typeof body.bookingid).toBe('number');
    expect(body.booking).toEqual(payload);
  });

  test('response body matches the exact booking structure and field types', { tag: '@regression' }, async ({ request, trackBookingId }) => {
    const { bookingId, booking } = await createBooking(request, {
      totalprice: 250,
      depositpaid: false,
      additionalneeds: 'Late checkout',
    });
    trackBookingId(bookingId);

    expect(booking).toEqual({
      firstname: expect.any(String),
      lastname: expect.any(String),
      totalprice: expect.any(Number),
      depositpaid: expect.any(Boolean),
      bookingdates: {
        checkin: expect.any(String),
        checkout: expect.any(String),
      },
      additionalneeds: expect.any(String),
    });
  });

  test('POST /booking with missing required field (firstname) — documents actual behaviour', { tag: '@regression' }, async ({ request }) => {
    const { firstname, ...payloadWithoutFirstname } = validBookingPayload();
    const res = await request.post('/booking', { data: payloadWithoutFirstname });

    // Missing firstname crashes with 500 instead of a 400 — see BUG-REPORT.md Bug 3.
    expect(res.status()).toBe(500);
  });
});

test.describe('Get Booking', () => {
  test('GET /booking/:id for a booking just created returns the correct data', { tag: '@smoke' }, async ({ request, trackBookingId }) => {
    const { bookingId, booking } = await createBooking(request);
    trackBookingId(bookingId);

    const res = await request.get(`/booking/${bookingId}`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual(booking);
  });

  test('GET /booking/:id for a non-existent ID returns 404', { tag: '@regression' }, async ({ request }) => {
    const res = await request.get('/booking/999999999');
    expect(res.status()).toBe(404);
  });
});

test.describe('Update Booking', () => {
  test('PUT /booking/:id with a valid token updates the record', { tag: '@smoke' }, async ({ request, authToken, trackBookingId }) => {
    const { bookingId } = await createBooking(request);
    trackBookingId(bookingId);

    const updatedPayload = validBookingPayload({
      firstname: 'James',
      totalprice: 999,
      depositpaid: false,
    });

    const res = await request.put(`/booking/${bookingId}`, {
      data: updatedPayload,
      headers: { Cookie: `token=${authToken}` },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual(updatedPayload);
  });

  test('PUT /booking/:id without an auth token returns 403', { tag: '@regression' }, async ({ request, trackBookingId }) => {
    const { bookingId } = await createBooking(request);
    trackBookingId(bookingId);

    const res = await request.put(`/booking/${bookingId}`, {
      data: validBookingPayload({ firstname: 'Unauthorized' }),
    });

    expect(res.status()).toBe(403);
  });
});

test.describe('Delete Booking', () => {
  test('DELETE /booking/:id with a valid token returns 201', { tag: '@smoke' }, async ({ request, authToken, trackBookingId }) => {
    const { bookingId } = await createBooking(request);
    trackBookingId(bookingId);

    const res = await request.delete(`/booking/${bookingId}`, {
      headers: { Cookie: `token=${authToken}` },
    });

    // 201 (not the conventional 200/204) is the documented contract — pinned so a
    // "fix" to 204 shows up here before it breaks clients coded against 201.
    expect(res.status()).toBe(201);
  });

  test('GET /booking/:id after deletion confirms the record is gone', { tag: '@regression' }, async ({ request, authToken, trackBookingId }) => {
    const { bookingId } = await createBooking(request);
    trackBookingId(bookingId);

    await request.delete(`/booking/${bookingId}`, {
      headers: { Cookie: `token=${authToken}` },
    });

    const res = await request.get(`/booking/${bookingId}`);
    expect(res.status()).toBe(404);
  });
});

test.describe('Your Choice (Bonus)', () => {
  // The coverage matrix has a "Partial Update" row but the brief never spells
  // out PATCH steps the way it does for PUT/DELETE — this closes that gap,
  // and checks that a partial update doesn't clobber fields it wasn't given.
  test('PATCH /booking/:id partially updates one field and preserves the rest', { tag: '@regression' }, async ({ request, authToken, trackBookingId }) => {
    const { bookingId, booking } = await createBooking(request);
    trackBookingId(bookingId);

    const res = await request.patch(`/booking/${bookingId}`, {
      data: { totalprice: 555 },
      headers: { Cookie: `token=${authToken}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ...booking, totalprice: 555 });
  });

  // Found during exploratory testing: the API accepts a negative totalprice
  // with no validation. Pinning it here so the test fails loudly if that
  // ever gets fixed, instead of the gap just quietly persisting.
  test('POST /booking currently accepts a negative totalprice (documents validation gap)', { tag: '@regression' }, async ({ request, trackBookingId }) => {
    const { bookingId, booking } = await createBooking(request, { totalprice: -500 });
    trackBookingId(bookingId);

    expect(booking.totalprice).toBe(-500);
  });
});
