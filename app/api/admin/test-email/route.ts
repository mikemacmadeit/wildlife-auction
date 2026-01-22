/**
 * POST /api/admin/test-email
 *
 * Admin-only endpoint to send a test transactional email through the configured provider.
 * Designed for verifying transactional email end-to-end (SendGrid recommended).
 */
import { z } from 'zod';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { renderEmail } from '@/lib/email';
import { sendEmailHtml } from '@/lib/email/sender';
import { getEmailProvider } from '@/lib/email/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  to: z.string().email().optional(),
  template: z
    .enum([
      'auction_winner',
      'auction_outbid',
      'auction_high_bidder',
      'auction_ending_soon',
      'order_confirmation',
      'message_received',
      'offer_received',
      'offer_accepted',
      'verify_email',
    ])
    .optional(),
});

export async function POST(request: Request) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });

  const provider = getEmailProvider();
  const to = parsed.data.to || process.env.SENDGRID_TEST_TO || 'michael@redwolfcinema.com';
  const template = parsed.data.template || 'auction_winner';

  // Minimal, safe dummy payloads (validated by template registry).
  const site = 'https://wildlife.exchange';
  const rendered = (() => {
    switch (template) {
      case 'auction_outbid':
        return renderEmail('auction_outbid', {
          outbidderName: 'Michael',
          listingTitle: 'Test Listing (Outbid)',
          newBidAmount: 1234,
          listingUrl: `${site}/listing/test`,
          auctionEndsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        });
      case 'auction_high_bidder':
        return renderEmail('auction_high_bidder', {
          userName: 'Michael',
          listingTitle: 'Test Listing (High bidder)',
          yourBidAmount: 2222,
          listingUrl: `${site}/listing/test`,
          auctionEndsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        });
      case 'auction_ending_soon':
        return renderEmail('auction_ending_soon', {
          userName: 'Michael',
          listingTitle: 'Test Listing (Ending soon)',
          threshold: '1h',
          listingUrl: `${site}/listing/test`,
          auctionEndsAt: new Date(Date.now() + 60 * 60 * 1000),
          currentBidAmount: 1500,
        });
      case 'order_confirmation':
        return renderEmail('order_confirmation', {
          buyerName: 'Michael',
          orderId: 'TEST-ORDER-123',
          listingTitle: 'Test Listing (Order confirmation)',
          amount: 49.99,
          orderDate: new Date(),
          orderUrl: `${site}/dashboard/orders/TEST-ORDER-123`,
        });
      case 'message_received':
        return renderEmail('message_received', {
          userName: 'Michael',
          listingTitle: 'Test Listing (Message)',
          threadUrl: `${site}/dashboard/messages`,
          listingUrl: `${site}/listing/test`,
          senderRole: 'buyer',
          preview: 'This is a test message preview.',
        });
      case 'offer_received':
        return renderEmail('offer_received', {
          userName: 'Michael',
          listingTitle: 'Test Listing (Offer received)',
          amount: 2500,
          offerUrl: `${site}/seller/offers`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      case 'offer_accepted':
        return renderEmail('offer_accepted', {
          userName: 'Michael',
          listingTitle: 'Test Listing (Offer accepted)',
          amount: 2500,
          offerUrl: `${site}/dashboard/offers`,
        });
      case 'verify_email':
        return renderEmail('verify_email', {
          userName: 'Michael',
          verifyUrl: `${site}/login?verify=test`,
          dashboardUrl: `${site}/dashboard`,
        });
      case 'auction_winner':
      default:
        return renderEmail('auction_winner', {
          winnerName: 'Michael',
          listingTitle: 'Test Listing (Winner)',
          winningBid: 3000,
          orderUrl: `${site}/dashboard/orders/TEST-ORDER-123`,
          auctionEndDate: new Date().toISOString(),
        });
    }
  })();

  const sent = await sendEmailHtml(to, rendered.subject, rendered.html);
  if (!sent.success) {
    return json(
      { ok: false, error: 'Failed to send test email', provider, message: sent.error || 'Send failed' },
      { status: 500 }
    );
  }

  return json({ ok: true, provider, to, template, messageId: sent.messageId || null });
}

