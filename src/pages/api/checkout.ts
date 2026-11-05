import type { APIRoute } from 'astro';
import { json, jsonError, readJson } from '@/server/http';
import { orderDeps, rateLimiter, requestLogger } from '@/server/runtime';
import { createCheckout } from '@/server/services/orders';
import { checkoutRequestSchema } from '@/server/validation';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const logger = requestLogger(request);

  if (!(await rateLimiter('CHECKOUT_RATE_LIMITER').allow(`checkout:${clientAddress}`))) {
    return jsonError(429, 'Too many checkout attempts. Wait a minute and try again.');
  }

  const parsed = checkoutRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, 'Your cart could not be read. Refresh the page and try again.');

  const deps = orderDeps(request, logger);
  if (!deps) {
    logger.error('checkout.unconfigured');
    return jsonError(503, 'Checkout is temporarily offline. Please try again soon.');
  }

  try {
    const result = await createCheckout(deps, parsed.data.items);
    if (!result.ok) return jsonError(result.status, result.error, { issues: result.issues });
    return json({ url: result.url, orderNumber: result.orderNumber });
  } catch (error) {
    logger.error('checkout.unhandled', error);
    return jsonError(500, 'Something went wrong on our side. Nothing was charged.');
  }
};
