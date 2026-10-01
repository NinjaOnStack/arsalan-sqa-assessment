import { APIRequestContext, expect } from '@playwright/test';
import { validBookingPayload } from '../fixtures/bookingPayload';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill in the values — see README.md ("Test data / credentials").`,
    );
  }
  return value;
}

export async function getAuthToken(request: APIRequestContext): Promise<string> {
  const res = await request.post('/auth', {
    data: { username: requireEnv('API_USERNAME'), password: requireEnv('API_PASSWORD') },
  });
  expect(res.status(), 'auth endpoint should return 200 even for the token-issuing case').toBe(200);
  const body = await res.json();
  expect(body.token, 'expected a token in the auth response').toBeTruthy();
  return body.token;
}

export async function createBooking(request: APIRequestContext, overrides: Partial<Record<string, unknown>> = {}) {
  const payload = validBookingPayload(overrides);
  const res = await request.post('/booking', { data: payload });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return { bookingId: body.bookingid, booking: body.booking };
}
