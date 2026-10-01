export function validContactMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Playwright Explorer',
    email: 'explorer@example.com',
    phone: '01234567890',
    subject: 'Exploring the contact form',
    description: 'This is a sufficiently long test message body for validation purposes.',
    ...overrides,
  };
}
