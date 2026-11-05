/**
 * Worker entrypoint: Astro handles HTTP; the scheduled handler reconciles abandoned checkouts.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { parseConfig } from '@/server/config';
import { createEmailSender, createPaymentGateway } from '@/server/factories';
import { createLogger } from '@/server/logger';
import { reconcileStalePendingOrders } from '@/server/services/orders';

async function runReconciliation(env: Env, scheduledTime: number): Promise<void> {
  const logger = createLogger({ job: 'reconcile-pending', scheduledTime });
  const config = parseConfig(env as unknown as Record<string, unknown>);
  if (!config.siteUrl) logger.warn('reconcile.no_site_url', { note: 'Alert links will be relative.' });
  // Never invent a host: without PUBLIC_SITE_URL, links in alerts are relative paths.
  const origin = config.siteUrl ?? '';
  const payments = createPaymentGateway(config, origin);
  if (!payments) {
    logger.warn('reconcile.skipped_payments_unconfigured');
    return;
  }
  const result = await reconcileStalePendingOrders({
    db: env.DB,
    payments,
    email: createEmailSender(config, logger),
    logger,
    alertEmailTo: config.alertEmailTo,
    origin,
  });
  logger.info('reconcile.done', result);
}

export default {
  fetch: handle,
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runReconciliation(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
