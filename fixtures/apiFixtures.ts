import { test as base, expect } from '@playwright/test';
import { getAuthToken } from '../utils/helpers';
import { deleteBookings } from '../utils/cleanup';

export const test = base.extend<{
  authToken: string;
  trackBookingId: (id: number) => void;
}>({
  authToken: async ({ request }, use) => {
    await use(await getAuthToken(request));
  },

  trackBookingId: async ({ request }, use) => {
    const createdIds: number[] = [];
    await use((id: number) => {
      createdIds.push(id);
    });

    await deleteBookings(request, createdIds);
  },
});

export { expect };
