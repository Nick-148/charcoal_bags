/**
 * Local stand-in for Stripe Checkout (development + tests only; refused in production by config).
 *
 * Sessions are encoded in their id so no shared state is needed across Worker isolates:
 *   fake_cs_<orderId>_<expiresAtMs>
 * The /checkout/fake page plays the role of the hosted Stripe page and posts the simulated
 * outcome to /api/dev/fake-payment, which feeds it through the same code path as real webhooks.
 */
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

const PREFIX = 'fake_cs_';

export function encodeFakeSessionId(orderId: string, expiresAt: Date): string {
  return `${PREFIX}${orderId}_${expiresAt.getTime()}`;
}

export function decodeFakeSessionId(sessionId: string): { orderId: string; expiresAt: Date } | null {
  if (!sessionId.startsWith(PREFIX)) return null;
  const rest = sessionId.slice(PREFIX.length);
  const sep = rest.lastIndexOf('_');
  if (sep <= 0) return null;
  const orderId = rest.slice(0, sep);
  const ms = Number(rest.slice(sep + 1));
  if (!/^[0-9a-f-]{36}$/.test(orderId) || !Number.isFinite(ms)) return null;
  return { orderId, expiresAt: new Date(ms) };
}

export interface FakeGatewayOptions {
  /** Origin used to build the fake hosted-checkout URL. */
  origin: string;
  now?: () => Date;
}

export class FakePaymentGateway implements PaymentGateway {
  readonly name = 'fake' as const;
  readonly created: CreateCheckoutInput[] = [];
  readonly refunds: string[] = [];
  /** Test hook: make the next createCheckoutSession call fail. */
  failNextCreate = false;

  constructor(private readonly options: FakeGatewayOptions) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CreatedCheckout> {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new PaymentGatewayError('Simulated gateway failure.');
    }
    this.created.push(input);
    const sessionId = encodeFakeSessionId(input.orderId, input.expiresAt);
    const url = new URL('/checkout/fake', this.options.origin);
    url.searchParams.set('session_id', sessionId);
    return { sessionId, url: url.toString(), expiresAt: input.expiresAt };
  }

  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionSnapshot> {
    const decoded = decodeFakeSessionId(sessionId);
    if (!decoded) throw new PaymentGatewayError('Unknown fake session.');
    const expired = decoded.expiresAt.getTime() <= this.now().getTime();
    return {
      sessionId,
      orderId: decoded.orderId,
      status: expired ? 'expired' : 'open',
      paymentStatus: 'unpaid',
      paymentIntentId: null,
      amountTotalCents: null,
      customer: null,
      shipping: null,
    };
  }

  async parseWebhookEvent(): Promise<PaymentEvent> {
    // The fake gateway never receives signed webhooks; simulated outcomes go through /api/dev/fake-payment.
    throw new WebhookSignatureError('The fake payment gateway does not accept webhooks.');
  }

  async refund(paymentIntentId: string): Promise<RefundSnapshot> {
    this.refunds.push(paymentIntentId);
    return { paymentIntentId, amountCents: 0, amountRefundedCents: 0 };
  }
}

/** Builds the snapshot a completed fake checkout reports. */
export function fakeCompletedSession(
  sessionId: string,
  orderId: string,
  totalCents: number,
  customer: { email: string; name: string },
  address: { line1: string; city: string; state: string; postalCode: string },
): CheckoutSessionSnapshot {
  return {
    sessionId,
    orderId,
    status: 'complete',
    paymentStatus: 'paid',
    paymentIntentId: `fake_pi_${orderId}`,
    amountTotalCents: totalCents,
    customer: { email: customer.email, name: customer.name, phone: null },
    shipping: {
      name: customer.name,
      address: { ...address, line2: null, country: 'US' },
    },
  };
}
