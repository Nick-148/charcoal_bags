import { expect, test } from '@playwright/test';

test('home page sells the product and links to every purchase path', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/mini cornhole bags/i);
  await expect(page.getByRole('link', { name: /shop the single/i })).toHaveAttribute(
    'href',
    '/shop/the-single',
  );
  await expect(page.getByRole('link', { name: /tailgate pair — \$18/i })).toHaveAttribute(
    'href',
    '/shop/tailgate-pair',
  );
  await expect(page.getByRole('link', { name: /bulk & team orders/i }).first()).toHaveAttribute(
    'href',
    '/bulk',
  );
  await expect(page.getByText(/recharge protocol/i).first()).toBeVisible();
});

test('product page shows price, pre-order date, and the recharge indicator', async ({ page }) => {
  await page.goto('/shop/the-single');
  await expect(page.getByRole('heading', { level: 1, name: 'The Single' })).toBeVisible();
  await expect(page.getByText('$9').first()).toBeVisible();
  await expect(page.locator('#availability-note')).toContainText(/ships by dec 11, 2026/i);
  await expect(page.getByText(/1–2 hrs of direct sun/i)).toBeVisible();
});

test('FAQ explains how charcoal works and how to recharge', async ({ page }) => {
  await page.goto('/the-vibe#faq');
  await page.getByText('How do I recharge it?').click();
  await expect(page.getByText(/direct sunlight for 1–2 hours/i)).toBeVisible();
});

test('contact and bulk forms render with bot protection fields', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.locator('input[name="website"]')).toBeHidden();
  await page.goto('/bulk');
  await expect(page.getByText('$6.50')).toBeVisible();
  await expect(page.getByLabel('How many bags?')).toBeVisible();
});

test('unknown pages 404', async ({ page }) => {
  const response = await page.goto('/definitely-not-here');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /missed the board/i })).toBeVisible();
});
