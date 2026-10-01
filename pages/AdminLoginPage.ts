import { Page, Locator, expect } from '@playwright/test';

export class AdminLoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('#username');
    this.passwordInput = page.locator('#password');
    this.loginButton = page.locator('#doLogin');
    this.errorMessage = page.getByText('Invalid credentials');
  }

  async goto() {
    await this.page.goto('/admin');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  /** A successful login redirects from /admin to /admin/rooms and shows the room dashboard. */
  async expectLoggedIn() {
    await expect(this.page).toHaveURL(/\/admin\/rooms/);
    await expect(this.page.getByRole('button', { name: 'Logout' })).toBeVisible();
  }

  async expectLoginFailed() {
    await expect(this.page).toHaveURL(/\/admin$/);
    await expect(this.errorMessage).toBeVisible();
  }
}
