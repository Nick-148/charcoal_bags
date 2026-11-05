/**
 * Payment gateway port. Stripe is the production adapter; the fake adapter powers local development
 * and tests without a Stripe account. Business logic depends only on this interface.
 */

export interface CheckoutLineItem {
  sku: string;
  name: string;
  description?: string | undefined;
  unitAmountCents: number;
  quantity: number;
}

export interface CreateCheckoutInput {
  orderId: string;
  orderNumber: string;
  lineItems: CheckoutLineItem[];
  shippingCents: number;
  shippingLabel: string;
  allowedCountries: readonly string[];
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
  /** Shown above the pay button, e.g. the pre-order ship-by promise. */
  submitMessage?: string;
}

export interface CreatedCheckout {
  sessionId: string;
  url: string;
  expiresAt: Date;
}

export interface Address {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface CheckoutSessionSnapshot {
  sessionId: string;
  orderId: string | null;
  status: 'open' | 'complete' | 'expired';
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  paymentIntentId: string | null;
  amountTotalCents: number | null;
  customer: { email: string | null; name: string | null; phone: string | null } | null;
  shipping: { name: string | null; address: Address } | null;
}

export interface RefundSnapshot {
  paymentIntentId: string;
  amountCents: number;
  amountRefundedCents: number;
}

export type PaymentEvent =
  | { id: string; kind: 'checkout_completed'; session: CheckoutSessionSnapshot }
  | { id: string; kind: 'checkout_expired'; session: CheckoutSessionSnapshot }
  | { id: string; kind: 'async_payment_succeeded'; session: CheckoutSessionSnapshot }
  | { id: string; kind: 'async_payment_failed'; session: CheckoutSessionSnapshot }
  | { id: string; kind: 'charge_refunded'; refund: RefundSnapshot }
  | { id: string; kind: 'ignored'; type: string };

export class WebhookSignatureError extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export class PaymentGatewayError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PaymentGatewayError';
  }
}

export interface PaymentGateway {
  readonly name: 'stripe' | 'fake';
  createCheckoutSession(input: CreateCheckoutInput): Promise<CreatedCheckout>;
  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionSnapshot>;
  /** Verifies the signature and normalises the event. Throws WebhookSignatureError when invalid. */
  parseWebhookEvent(rawBody: string, signatureHeader: string | null): Promise<PaymentEvent>;
  refund(paymentIntentId: string, idempotencyKey: string): Promise<RefundSnapshot>;
}
