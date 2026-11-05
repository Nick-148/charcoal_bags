import type { APIRoute } from 'astro';
import { jsonError, json } from '@/server/http';
import { WebhookSignatureError } from '@/server/payments/types';
import { orderDeps, requestLogger } from '@/server/runtime';
import { handlePaymentEvent } from '@/server/services/orders';

export const prerender = false;

const MAX_BODY_BYTES = 512 * 1024;

/**
 * Stripe webhook. Authenticity comes from the signature, not the origin, so this route is exempt from
 * CSRF checks by design (it is a JSON POST with a Stripe-Signature header).
 * Configure in Stripe: checkout.session.completed, .expired, .async_payment_succeeded,
 * .async_payment_failed, charge.refunded.
 */
export const POST: APIRoute = async ({ request }) => {
  const logger = requestLogger(request);
  const deps = orderDeps(request, logger);
  if (!deps) return jsonError(503, 'Payments not configured.');

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return jsonError(413, 'Payload too large.');

  let event;
  try {
    event = await deps.payments.parseWebhookEvent(raw, request.headers.get('stripe-signature'));
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      logger.warn('webhook.bad_signature');
      return jsonError(400, 'Invalid signature.');
    }
    throw error;
  }

  try {
    const outcome = await handlePaymentEvent(deps, event);
    logger.info('webhook.processed', { eventId: event.id, kind: event.kind, outcome });
    return json({ received: true, outcome });
  } catch (error) {
    // 500 makes Stripe retry with backoff; handlers are idempotent so retries are safe.
    logger.error('webhook.failed', error, { eventId: event.id, kind: event.kind });
    return jsonError(500, 'Processing failed.');
  }
};
