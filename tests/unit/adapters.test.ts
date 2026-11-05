import { describe, expect, it, vi } from 'vitest';
import { TurnstileVerifier } from '@/server/captcha';
import { csvCell, toCsv } from '@/server/csv';
import { EmailDeliveryError, ResendEmailSender } from '@/server/email';
import { esc, newInquiryAlert, newOrderAlert } from '@/server/email/templates';
import { newOrderNumber } from '@/server/ids';
import { decodeFakeSessionId, encodeFakeSessionId, FakePaymentGateway } from '@/server/payments/fake';

describe('TurnstileVerifier', () => {
  it('posts the token and honours the success flag', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ success: true }));
    const verifier = new TurnstileVerifier('secret', fetchImpl as unknown as typeof fetch);
    expect(await verifier.verify('token', '1.2.3.4')).toBe(true);
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(body.get('secret')).toBe('secret');
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });

  it('rejects tokens minted for a different form action', async () => {
    const verifier = new TurnstileVerifier('s', (async () =>
      Response.json({ success: true, action: 'contact' })) as unknown as typeof fetch);
    expect(await verifier.verify('t', null, 'contact')).toBe(true);
    expect(await verifier.verify('t', null, 'bulk_quote')).toBe(false);
  });

  it('fails closed on missing tokens, failures, and network errors', async () => {
    const no = new TurnstileVerifier('s', (async () =>
      Response.json({ success: false })) as unknown as typeof fetch);
    expect(await no.verify('t', null)).toBe(false);
    expect(await no.verify(null, null)).toBe(false);
    expect(await no.verify('x'.repeat(2049), null)).toBe(false);
    const boom = new TurnstileVerifier('s', (async () => {
      throw new Error('net');
    }) as unknown as typeof fetch);
    expect(await boom.verify('t', null)).toBe(false);
  });
});

describe('ResendEmailSender', () => {
  it('sends with auth and idempotency headers', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    await new ResendEmailSender('re_key', 'Shop <a@b.co>', fetchImpl as unknown as typeof fetch).send({
      to: ['x@y.co'],
      subject: 's',
      text: 't',
      html: '<p>h</p>',
      replyTo: 'r@y.co',
      idempotencyKey: 'k1',
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer re_key');
    expect(headers['Idempotency-Key']).toBe('k1');
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: 'Shop <a@b.co>',
      to: ['x@y.co'],
      reply_to: 'r@y.co',
    });
  });

  it('throws EmailDeliveryError on non-2xx', async () => {
    const sender = new ResendEmailSender(
      'k',
      'f',
      (async () => new Response('nope', { status: 422 })) as unknown as typeof fetch,
    );
    await expect(sender.send({ to: ['a@b.co'], subject: 's', text: 't', html: 'h' })).rejects.toBeInstanceOf(
      EmailDeliveryError,
    );
  });
});

describe('email templates', () => {
  it('escapes attacker-controlled inquiry fields', () => {
    const alert = newInquiryAlert({
      kind: 'contact',
      name: '<script>alert(1)</script>',
      email: 'a@b.co',
      message: '"><img src=x onerror=alert(1)>',
      adminUrl: 'https://shop/admin/inquiries/1',
    });
    expect(alert.html).not.toContain('<script>');
    expect(alert.html).not.toContain('<img');
    expect(alert.html).toContain('&lt;script&gt;');
    expect(esc(`'"&<>`)).toBe('&#39;&quot;&amp;&lt;&gt;');
  });

  it('keeps subjects on one line', () => {
    const alert = newInquiryAlert({
      kind: 'bulk',
      name: 'A\r\nBcc: x@y.co',
      email: 'a@b.co',
      message: 'm',
      adminUrl: 'u',
      quantity: 20,
    });
    expect(alert.subject).not.toMatch(/[\r\n]/);
  });

  it('flags orders that need review', () => {
    const alert = newOrderAlert({
      number: 'BB-ABC234',
      totalCents: 9000,
      bagCount: 12,
      isPreorder: true,
      shipsBy: '2026-12-11',
      customerName: 'Ann',
      shipCity: 'Concord',
      shipState: 'NH',
      items: [{ productName: 'Tailgate Pair', variantName: 'Field Mix', quantity: 6 }],
      adminUrl: 'https://shop/admin/orders/BB-ABC234',
      needsReview: true,
    });
    expect(alert.subject).toMatch(/^\[REVIEW\] New order BB-ABC234 — \$90\.00$/);
    expect(alert.text).toContain('Dec 11, 2026');
  });
});

describe('csv', () => {
  it('neutralises spreadsheet formulas and quotes special characters', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM')).toBe("'@SUM");
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell(null)).toBe('');
    expect(toCsv(['a', 'b'], [[1, 'x\ny']])).toBe('a,b\r\n1,"x\ny"\r\n');
  });
});

describe('ids', () => {
  it('generates prefixed order numbers from an unambiguous alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const n = newOrderNumber('BB');
      expect(n).toMatch(/^BB-[2-9A-HJKMNP-TV-Z]{6}$/);
      seen.add(n);
    }
    expect(seen.size).toBeGreaterThan(495);
  });
});

describe('fake payment gateway', () => {
  it('round-trips session ids and reports expiry', async () => {
    const orderId = crypto.randomUUID();
    const expires = new Date('2026-11-04T12:00:00Z');
    const id = encodeFakeSessionId(orderId, expires);
    expect(decodeFakeSessionId(id)).toEqual({ orderId, expiresAt: expires });
    expect(decodeFakeSessionId('cs_live_123')).toBeNull();
    expect(decodeFakeSessionId('fake_cs_../../etc_1')).toBeNull();

    const before = new FakePaymentGateway({
      origin: 'http://localhost',
      now: () => new Date('2026-11-04T11:00:00Z'),
    });
    const after = new FakePaymentGateway({
      origin: 'http://localhost',
      now: () => new Date('2026-11-04T13:00:00Z'),
    });
    expect((await before.retrieveCheckoutSession(id)).status).toBe('open');
    expect((await after.retrieveCheckoutSession(id)).status).toBe('expired');
  });
});
