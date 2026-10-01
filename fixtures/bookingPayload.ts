export function validBookingPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    firstname: 'Jim',
    lastname: 'Brown',
    totalprice: 111,
    depositpaid: true,
    bookingdates: {
      checkin: '2024-01-01',
      checkout: '2024-01-05',
    },
    additionalneeds: 'Breakfast',
    ...overrides,
  };
}
