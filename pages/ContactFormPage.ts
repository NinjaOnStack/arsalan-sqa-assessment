import { Page, Locator, expect } from '@playwright/test';

export class ContactFormPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly subjectInput: Locator;
  readonly descriptionInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.getByTestId('ContactName');
    this.emailInput = page.getByTestId('ContactEmail');
    this.phoneInput = page.getByTestId('ContactPhone');
    this.subjectInput = page.getByTestId('ContactSubject');
    this.descriptionInput = page.getByTestId('ContactDescription');
    this.submitButton = page.getByRole('button', { name: 'Submit' });
  }

  async goto() {
    await this.page.goto('/');
    await this.nameInput.scrollIntoViewIfNeeded();
  }

  async fill(data: { name?: string; email?: string; phone?: string; subject?: string; description?: string }) {
    if (data.name !== undefined) await this.nameInput.fill(data.name);
    if (data.email !== undefined) await this.emailInput.fill(data.email);
    if (data.phone !== undefined) await this.phoneInput.fill(data.phone);
    if (data.subject !== undefined) await this.subjectInput.fill(data.subject);
    if (data.description !== undefined) await this.descriptionInput.fill(data.description);
  }

  async submit() {
    await this.submitButton.click();
  }

  async expectSuccessMessage(name: string, subject: string) {
    await expect(this.page.getByText(`Thanks for getting in touch ${name}!`)).toBeVisible();
    await expect(this.page.getByText(subject)).toBeVisible();
  }

  async getValidationErrors(): Promise<string[]> {
    await this.page.getByText(/must be|may not be blank/i).first().waitFor();
    const allText = await this.page.locator('body').innerText();
    return allText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /must be|may not be blank/i.test(line));
  }
}
