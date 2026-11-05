/**
 * Plain, dependency-free email templates. Every interpolated value goes through `esc` —
 * inquiry fields are attacker-controlled.
 */
import { site } from '@/config/site';
import { formatShipDate } from '@/lib/availability';
import { formatCentsExact } from '@/lib/money';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Strips CR/LF so user input can never inject extra header-like lines into a subject. */
function oneLine(value: string, max = 80): string {
  const flat = value.replace(/[\r\n]+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f2eee6;font-family:Arial,Helvetica,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#111;color:#c8a97e;padding:12px 16px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">${esc(site.name)}</div>
<div style="background:#fff;padding:20px 16px;border:1px solid #ddd">
<h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>
${bodyHtml}
</div></div></body></html>`;
}

function rows(pairs: [string, string | number | null | undefined][]): { html: string; text: string } {
  const present = pairs.filter(([, v]) => v !== null && v !== undefined && v !== '');
  return {
    html: `<table style="border-collapse:collapse;width:100%;font-size:14px">${present
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 8px 4px 0;color:#555;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`,
      )
      .join('')}</table>`,
    text: present.map(([k, v]) => `${k}: ${v}`).join('\n'),
  };
}

export interface OrderAlertData {
  number: string;
  totalCents: number;
  bagCount: number;
  isPreorder: boolean;
  shipsBy: string | null;
  customerName: string | null;
  shipCity: string | null;
  shipState: string | null;
  items: { productName: string; variantName: string; quantity: number }[];
  adminUrl: string;
  needsReview: boolean;
}

export function newOrderAlert(order: OrderAlertData): { subject: string; text: string; html: string } {
  const subject = `${order.needsReview ? '[REVIEW] ' : ''}New order ${order.number} — ${formatCentsExact(order.totalCents)}`;
  const info = rows([
    ['Order', order.number],
    ['Total', formatCentsExact(order.totalCents)],
    ['Bags', order.bagCount],
    [
      'Type',
      order.isPreorder
        ? `Pre-order${order.shipsBy ? ` (ships by ${formatShipDate(order.shipsBy)})` : ''}`
        : 'In stock',
    ],
    ['Customer', order.customerName],
    ['Ship to', [order.shipCity, order.shipState].filter(Boolean).join(', ')],
  ]);
  const items = order.items.map((i) => `${i.quantity} × ${i.productName} — ${i.variantName}`);
  const review = order.needsReview
    ? 'This order was paid after its inventory reservation was released. Check stock before promising a ship date.'
    : '';
  return {
    subject,
    text: [
      subject,
      review,
      info.text,
      '',
      'Items:',
      ...items.map((i) => `- ${i}`),
      '',
      `Open in admin: ${order.adminUrl}`,
    ]
      .filter((l) => l !== '')
      .join('\n'),
    html: layout(
      subject,
      `${review ? `<p style="background:#fff3cd;padding:8px">${esc(review)}</p>` : ''}${info.html}
<h2 style="font-size:15px;margin:16px 0 6px">Items</h2><ul style="margin:0;padding-left:18px;font-size:14px">${items
        .map((i) => `<li>${esc(i)}</li>`)
        .join('')}</ul>
<p style="margin-top:20px"><a href="${esc(order.adminUrl)}" style="background:#111;color:#c8a97e;padding:10px 14px;text-decoration:none;display:inline-block">Open order in admin</a></p>`,
    ),
  };
}

export interface InquiryAlertData {
  kind: 'contact' | 'bulk';
  name: string;
  email: string;
  topic?: string | null;
  organization?: string | null;
  quantity?: number | null;
  neededBy?: string | null;
  customization?: string | null;
  message: string;
  adminUrl: string;
}

export function newInquiryAlert(inquiry: InquiryAlertData): { subject: string; text: string; html: string } {
  const label = inquiry.kind === 'bulk' ? 'Bulk quote request' : 'New message';
  const subject = oneLine(
    `${label} from ${inquiry.name}${inquiry.organization ? ` (${inquiry.organization})` : ''}${inquiry.quantity ? ` — ${inquiry.quantity} bags` : ''}`,
  );
  const info = rows([
    ['Name', inquiry.name],
    ['Email', inquiry.email],
    ['Topic', inquiry.topic],
    ['Organization', inquiry.organization],
    ['Quantity', inquiry.quantity],
    ['Needed by', inquiry.neededBy ? formatShipDate(inquiry.neededBy) : null],
    ['Customization', inquiry.customization],
  ]);
  return {
    subject,
    text: `${subject}\n\n${info.text}\n\nMessage:\n${inquiry.message}\n\nOpen in admin: ${inquiry.adminUrl}\n(Reply directly to this email to answer ${inquiry.name}.)`,
    html: layout(
      subject,
      `${info.html}<h2 style="font-size:15px;margin:16px 0 6px">Message</h2><p style="white-space:pre-wrap;font-size:14px;margin:0">${esc(inquiry.message)}</p>
<p style="margin-top:20px"><a href="${esc(inquiry.adminUrl)}" style="background:#111;color:#c8a97e;padding:10px 14px;text-decoration:none;display:inline-block">Open in admin</a></p>
<p style="color:#777;font-size:12px">Reply directly to this email to answer ${esc(inquiry.name)}.</p>`,
    ),
  };
}
