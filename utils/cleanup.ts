import { APIRequestContext } from '@playwright/test';
import { getAuthToken } from './helpers';

// Best-effort: a failed delete shouldn't fail the test that created the booking.
export async function deleteBookings(request: APIRequestContext, ids: number[]) {
  if (ids.length === 0) return;
  const token = await getAuthToken(request);
  await Promise.all(
    ids.map((id) =>
      request.delete(`/booking/${id}`, { headers: { Cookie: `token=${token}` } }).catch(() => {}),
    ),
  );
}
