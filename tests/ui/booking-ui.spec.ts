import { test, expect } from '@playwright/test';
import { ContactFormPage } from '../../pages/ContactFormPage';
import { AdminLoginPage } from '../../pages/AdminLoginPage';
import { validContactMessage } from '../../fixtures/contactMessages';
import { requireEnv } from '../../utils/helpers';

test.describe('Contact Form — Happy Path', () => {
  test('a visitor can submit a valid enquiry and sees a confirmation', { tag: '@smoke' }, async ({ page }) => {
    const contactForm = new ContactFormPage(page);
    await contactForm.goto();

    const message = validContactMessage();
    await contactForm.fill(message);
    await contactForm.submit();

    await contactForm.expectSuccessMessage(message.name, message.subject);
  });
});

test.describe('Contact Form — Validation', () => {
  let contactForm: ContactFormPage;

  test.beforeEach(async ({ page }) => {
    contactForm = new ContactFormPage(page);
    await contactForm.goto();
  });

  test('submitting an empty form shows a validation error per required field', { tag: '@regression' }, async () => {
    await contactForm.submit();

    const errors = await contactForm.getValidationErrors();
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Name may not be blank'),
        expect.stringContaining('Email may not be blank'),
        expect.stringContaining('Phone may not be blank'),
        expect.stringContaining('Subject may not be blank'),
        expect.stringContaining('Message may not be blank'),
      ]),
    );
  });

  test('an invalid email format is rejected with a specific message', { tag: '@regression' }, async () => {
    await contactForm.fill(
      validContactMessage({
        name: 'Bad Email Tester',
        email: 'not-an-email',
        subject: 'Testing invalid email',
        description: 'This message body is long enough to pass the length validation rule.',
      }),
    );
    await contactForm.submit();

    const errors = await contactForm.getValidationErrors();
    expect(errors).toEqual(
      expect.arrayContaining([expect.stringContaining('must be a well-formed email address')]),
    );
  });
});

test.describe('Admin Login', () => {
  let adminLogin: AdminLoginPage;

  test.beforeEach(async ({ page }) => {
    adminLogin = new AdminLoginPage(page);
    await adminLogin.goto();
  });

  test('admin logs in with valid credentials and reaches the rooms dashboard', { tag: '@smoke' }, async () => {
    await adminLogin.login(requireEnv('UI_ADMIN_USERNAME'), requireEnv('UI_ADMIN_PASSWORD'));

    await adminLogin.expectLoggedIn();
  });

  test('admin login with an invalid password is rejected', { tag: '@smoke' }, async () => {
    await adminLogin.login(requireEnv('UI_ADMIN_USERNAME'), 'wrong-password');

    await adminLogin.expectLoginFailed();
  });
});

test.describe('Your Choice — Unauthenticated access to the admin message inbox', () => {
  // Chose this because exploratory testing (BUG-REPORT.md Bug 1) found the
  // /api/message endpoint leaks data with no auth. That's an API-layer bug,
  // but this checks whether the UI's own route guard has the same hole —
  // it doesn't, which is worth locking in as a regression check.
  test('navigating directly to the admin messages route while logged out redirects to login', { tag: '@regression' }, async ({ page }) => {
    const adminLogin = new AdminLoginPage(page);

    await page.goto('/admin/message');

    await expect(page).toHaveURL(/\/admin$/);
    await expect(adminLogin.usernameInput).toBeVisible();
    await expect(adminLogin.passwordInput).toBeVisible();
  });
});
