import Stripe from 'stripe';
import {
  PaymentGatewayError,
  WebhookSignatureError,
  type CheckoutSessionSnapshot,
  type CreateCheckoutInput,
  type CreatedCheckout,
  type PaymentEvent,
  type PaymentGateway,
  type RefundSnapshot,
} from './types';

type Session = Stripe.Checkout.Session;

const SESSION_STATUSES = ['open', 'complete', 'expired'] as const;
const PAYMENT_STATUSES = ['paid', 'unpaid', 'no_payment_required'] as const;

function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

export function snapshotFromStripeSession(session: Session): CheckoutSessionSnapshot {
  const shipping = session.collected_information?.shipping_details ?? null;
  const details = session.customer_details;
  return {
    sessionId: session.id,
    orderId: session.client_reference_id ?? session.metadata?.['order_id'] ?? null,
    status: oneOf(session.status, SESSION_STATUSES, 'open'),
    // Unknown future statuses are treated as unpaid so they can never mark an order paid.
    paymentStatus: oneOf(session.payment_status, PAYMENT_STATUSES, 'unpaid'),
    paymentIntentId: idOf(session.payment_intent),
    amountTotalCents: session.amount_total,
    customer: details ? { email: details.email, name: details.name, phone: details.phone } : null,
    shipping: shipping
      ? {
          name: shipping.name,
          address: {
            line1: shipping.address.line1,
            line2: shipping.address.line2,
            city: shipping.address.city,
            state: shipping.address.state,
            postalCode: shipping.address.postal_code,
            country: shipping.address.country,
          },
        }
      : null,
  };
}

export class StripePaymentGateway implements PaymentGateway {
  readonly name = 'stripe' as const;
  private readonly stripe: Stripe;
  private readonly cryptoProvider = Stripe.createSubtleCryptoProvider();

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey, {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
      timeout: 15_000,
      appInfo: { name: 'charcoal-bags' },
    });
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CreatedCheckout> {
    const metadata = { order_id: input.orderId, order_number: input.orderNumber };
    try {
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          client_reference_id: input.orderId,
          metadata,
          line_items: input.lineItems.map((item) => ({
            quantity: item.quantity,
            price_data: {
              currency: 'usd',
              unit_amount: item.unitAmountCents,
              product_data: {
                name: item.name,
                ...(item.description ? { description: item.description } : {}),
                metadata: { sku: item.sku },
              },
            },
          })),
          shipping_address_collection: {
            allowed_countries: [
              ...input.allowedCountries,
            ] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
          },
          shipping_options: [
            {
              shipping_rate_data: {
                type: 'fixed_amount',
                display_name: input.shippingLabel,
                fixed_amount: { amount: input.shippingCents, currency: 'usd' },
              },
            },
          ],
          payment_intent_data: {
            description: `Order ${input.orderNumber}`,
            metadata,
          },
          ...(input.submitMessage ? { custom_text: { submit: { message: input.submitMessage } } } : {}),
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        },
        { idempotencyKey: `checkout-${input.orderId}` },
      );
      if (!session.url) throw new PaymentGatewayError('Stripe returned a Checkout Session without a URL.');
      return {
        sessionId: session.id,
        url: session.url,
        expiresAt: new Date(session.expires_at * 1000),
      };
    } catch (error) {
      if (error instanceof PaymentGatewayError) throw error;
      throw new PaymentGatewayError('Failed to create Stripe Checkout Session.', { cause: error });
    }
  }

  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionSnapshot> {
    try {
      return snapshotFromStripeSession(await this.stripe.checkout.sessions.retrieve(sessionId));
    } catch (error) {
      throw new PaymentGatewayError('Failed to retrieve Stripe Checkout Session.', { cause: error });
    }
  }

  async parseWebhookEvent(rawBody: string, signatureHeader: string | null): Promise<PaymentEvent> {
    if (!signatureHeader) throw new WebhookSignatureError('Missing Stripe-Signature header');
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(
        rawBody,
        signatureHeader,
        this.webhookSecret,
        undefined,
        this.cryptoProvider,
      );
    } catch (error) {
      throw new WebhookSignatureError(error instanceof Error ? error.message : undefined);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        return {
          id: event.id,
          kind: 'checkout_completed',
          session: snapshotFromStripeSession(event.data.object),
        };
      case 'checkout.session.expired':
        return {
          id: event.id,
          kind: 'checkout_expired',
          session: snapshotFromStripeSession(event.data.object),
        };
      case 'checkout.session.async_payment_succeeded':
        return {
          id: event.id,
          kind: 'async_payment_succeeded',
          session: snapshotFromStripeSession(event.data.object),
        };
      case 'checkout.session.async_payment_failed':
        return {
          id: event.id,
          kind: 'async_payment_failed',
          session: snapshotFromStripeSession(event.data.object),
        };
      case 'charge.refunded': {
        const charge = event.data.object;
        const paymentIntentId = idOf(charge.payment_intent);
        if (!paymentIntentId) return { id: event.id, kind: 'ignored', type: event.type };
        return {
          id: event.id,
          kind: 'charge_refunded',
          refund: {
            paymentIntentId,
            amountCents: charge.amount,
            amountRefundedCents: charge.amount_refunded,
          },
        };
      }
      default:
        return { id: event.id, kind: 'ignored', type: event.type };
    }
  }

  async refund(paymentIntentId: string, idempotencyKey: string): Promise<RefundSnapshot> {
    try {
      const refund = await this.stripe.refunds.create(
        { payment_intent: paymentIntentId },
        { idempotencyKey },
      );
      const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge'],
      });
      const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
      return {
        paymentIntentId,
        amountCents: intent.amount_received,
        amountRefundedCents: charge?.amount_refunded ?? refund.amount,
      };
    } catch (error) {
      throw new PaymentGatewayError('Stripe refund failed.', { cause: error });
    }
  }
}
