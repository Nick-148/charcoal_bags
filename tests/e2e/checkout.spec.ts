import { expect, test } from '@playwright/test';

test('buy a bulk-priced order end to end, then fulfil it in the admin', async ({ page }) => {
  // Product page → add 6 Tailgate Pairs (12 bags = team pricing).
  await page.goto('/shop/tailgate-pair');
  await page.getByText('Field Mix (Blackout + Olive)', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Quantity' }).fill('6');
  await page.getByRole('button', { name: /add to cart/i }).click();
  await expect(page.getByText(/added\./i)).toBeVisible();
  await expect(page.getByRole('link', { name: /cart, 6 items/i })).toBeVisible();

  // Cart totals are computed with bulk pricing and free shipping.
  await page.goto('/cart');
  const summary = page.getByRole('complementary', { name: 'Order summary' });
  await expect(summary).toContainText('Team pricing');
  await expect(summary).toContainText('$90.00');
  await expect(summary).toContainText('Free');

  // Checkout → local fake gateway → simulated payment.
  await page.getByRole('button', { name: /secure checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout\/fake\?session_id=/);
  await page.getByRole('button', { name: /simulate successful payment/i }).click();

  await expect(page).toHaveURL(/\/checkout\/success/);
  const orderNumber = (await page.locator('.font-mono.text-2xl').textContent())?.trim() ?? '';
  expect(orderNumber).toMatch(/^BB-[A-Z0-9]{6}$/);
  await expect(page.getByText(/founder’s pre-order/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /cart, empty/i })).toBeVisible();

  // Admin (localhost dev-bypass) sees the paid order and ships it.
  await page.goto('/admin/orders');
  await page.getByRole('link', { name: orderNumber }).click();
  await expect(page.getByText('paid', { exact: true })).toBeVisible();
  await expect(page.getByText('Concord NH 03301')).toBeVisible();

  await page.getByLabel('Status').selectOption('shipped');
  await page.getByRole('button', { name: /save fulfillment/i }).click();
  await expect(page.getByRole('alert')).toContainText(/tracking number/i);

  await page.getByLabel('Tracking number').fill('9400 1000 0000 0000 0000 00');
  await page.getByRole('button', { name: /save fulfillment/i }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await expect(page.getByLabel('Status')).toHaveValue('shipped');
  await expect(page.locator('span', { hasText: /^shipped$/ })).toBeVisible();
});

test('abandoned checkout returns the reservation', async ({ page, request }) => {
  const before = await (await request.get('/api/availability?skus=SGL-BNE')).json();
  await page.goto('/shop/the-single');
  await page.getByText('Bone', { exact: true }).click();
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.goto('/cart');
  await page.getByRole('button', { name: /secure checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout\/fake/);

  const during = await (await request.get('/api/availability?skus=SGL-BNE')).json();
  expect(during.availability[0].remaining).toBe(before.availability[0].remaining - 1);

  await page.getByRole('button', { name: /expire session/i }).click();
  await expect(page).toHaveURL(/\/cart\?checkout=canceled/);
  await expect(page.getByText(/checkout canceled/i)).toBeVisible();
  const after = await (await request.get('/api/availability?skus=SGL-BNE')).json();
  expect(after.availability[0].remaining).toBe(before.availability[0].remaining);
});

test('admin can sell out a SKU and the storefront reflects it', async ({ page }) => {
  await page.goto('/admin/inventory');
  const row = page.locator('form').filter({ hasText: 'PR-KFT' });
  await row.getByLabel('Available').fill('0');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('PR-KFT saved');

  await page.goto('/shop/tailgate-pair');
  await page.getByText('Kraft ×2', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sold out' })).toBeDisabled();
});

test('checkout API rejects tampered carts', async ({ request }) => {
  const bad = await request.post('/api/checkout', { data: { items: [{ sku: 'SGL-BLK', quantity: 9999 }] } });
  expect(bad.status()).toBe(400);
  const unknown = await request.post('/api/checkout', {
    data: { items: [{ sku: 'FREE-STUFF', quantity: 1 }] },
  });
  expect(unknown.status()).toBe(400);
});
