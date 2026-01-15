/**
 * Email Templates
 */

export interface OrderConfirmationEmailData {
  buyerName: string;
  orderId: string;
  listingTitle: string;
  amount: number;
  orderDate: Date;
  orderUrl: string;
}

export interface DeliveryConfirmationEmailData {
  buyerName: string;
  orderId: string;
  listingTitle: string;
  deliveryDate: Date;
  orderUrl: string;
}

export interface PayoutNotificationEmailData {
  sellerName: string;
  orderId: string;
  listingTitle: string;
  amount: number;
  transferId: string;
  payoutDate: Date;
}

export interface AuctionWinnerEmailData {
  winnerName: string;
  listingTitle: string;
  winningBid: number;
  orderUrl: string;
  auctionEndDate: Date;
}

/**
 * Generate HTML email template
 */
function tryGetOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderButton(href: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
    <tr>
      <td align="center" bgcolor="#556b2f" style="border-radius: 10px;">
        <a href="${href}"
           style="display:inline-block; padding: 12px 18px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                  font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>
  `.trim();
}

function getEmailTemplate(params: {
  title: string;
  preheader: string;
  contentHtml: string;
  origin?: string | null;
}): string {
  const year = new Date().getFullYear();
  const origin = params.origin || 'https://wildlife.exchange';
  const logoUrl = `${origin}/images/Kudu.png`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f6f3ee;">
  <!-- Preheader (hidden) -->
  <div style="display:none; font-size:1px; color:#f6f3ee; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    ${escapeHtml(params.preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f3ee; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">
          <!-- Header -->
          <tr>
            <td style="padding: 0 0 12px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#0f172a; border-radius: 16px; overflow:hidden;">
                <tr>
                  <td style="padding: 18px 18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 10px;">
                          <img src="${logoUrl}" width="36" height="36" alt="Wildlife Exchange"
                               style="display:block; border:0; outline:none; text-decoration:none; border-radius: 10px;" />
                        </td>
                        <td style="vertical-align: middle;">
                          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                                      font-size: 16px; font-weight: 800; color: #f8fafc; letter-spacing: 0.2px;">
                            Wildlife Exchange
                          </div>
                          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                                      font-size: 12px; color: #cbd5e1; margin-top: 2px;">
                            Texas marketplace for serious buyers & sellers
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="height: 4px; background: linear-gradient(90deg, #556b2f 0%, #c8a15a 50%, #556b2f 100%); font-size:0; line-height:0;">
                    &nbsp;
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff; border:1px solid #e6e0d6; border-radius: 16px; overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 22px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#0f172a; line-height:1.55;">
                    ${params.contentHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 14px 8px 0 8px; text-align:center;">
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#64748b; line-height: 1.4;">
                This is an automated message from Wildlife Exchange.
              </div>
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#64748b; line-height: 1.4; margin-top: 4px;">
                © ${year} Wildlife Exchange. All rights reserved.
              </div>
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#64748b; line-height: 1.4; margin-top: 6px;">
                <a href="${origin}" style="color:#556b2f; text-decoration:none; font-weight:600;">Visit wildlife.exchange</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function getOrderConfirmationEmail(data: OrderConfirmationEmailData): { subject: string; html: string } {
  const subject = `Order Confirmation - ${data.listingTitle}`;
  const preheader = `Order confirmed for ${data.listingTitle}. Funds held in escrow until delivery.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-size: 20px; font-weight: 800; margin: 0 0 8px 0;">Order confirmed</div>
    <div style="font-size: 14px; color:#334155; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.buyerName)} — your payment was received and your order is now in escrow.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc; border:1px solid #e2e8f0; border-radius: 14px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-size: 12px; color:#64748b; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase;">Order details</div>
          <div style="margin-top: 10px; font-size: 14px; color:#0f172a;">
            <div><span style="color:#64748b;">Order ID:</span> <strong>${escapeHtml(data.orderId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#64748b;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#64748b;">Amount:</span> <strong>$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#64748b;">Date:</span> <strong>${escapeHtml(data.orderDate.toLocaleDateString())}</strong></div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 16px 0 0 0; font-size: 13px; color:#334155;">
      Your funds are held in escrow until delivery is confirmed. You’ll be notified when the seller marks the order delivered.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.orderUrl, 'View order')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getDeliveryConfirmationEmail(data: DeliveryConfirmationEmailData): { subject: string; html: string } {
  const subject = `Delivery Confirmed - ${data.listingTitle}`;
  const preheader = `Delivery confirmed for ${data.listingTitle}. Review and confirm receipt if everything looks good.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-size: 20px; font-weight: 800; margin: 0 0 8px 0;">Delivery confirmed</div>
    <div style="font-size: 14px; color:#334155; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.buyerName)} — the seller marked your order as delivered.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc; border:1px solid #e2e8f0; border-radius: 14px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-size: 12px; color:#64748b; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase;">Order summary</div>
          <div style="margin-top: 10px; font-size: 14px; color:#0f172a;">
            <div><span style="color:#64748b;">Order ID:</span> <strong>${escapeHtml(data.orderId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#64748b;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#64748b;">Delivered:</span> <strong>${escapeHtml(data.deliveryDate.toLocaleDateString())}</strong></div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 16px 0 0 0; font-size: 13px; color:#334155;">
      Please inspect your order and confirm receipt when you’re satisfied. If there’s an issue, you can open a dispute within the protection window.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.orderUrl, 'View order')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getPayoutNotificationEmail(data: PayoutNotificationEmailData): { subject: string; html: string } {
  const subject = `Payout Released - ${data.listingTitle}`;
  const preheader = `Payout released for ${data.listingTitle}. Funds should arrive in 2–5 business days.`;
  const content = `
    <div style="font-size: 20px; font-weight: 800; margin: 0 0 8px 0;">Payout released</div>
    <div style="font-size: 14px; color:#334155; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.sellerName)} — your payout was released and should arrive in your account within 2–5 business days.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc; border:1px solid #e2e8f0; border-radius: 14px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-size: 12px; color:#64748b; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase;">Payout details</div>
          <div style="margin-top: 10px; font-size: 14px; color:#0f172a;">
            <div><span style="color:#64748b;">Order ID:</span> <strong>${escapeHtml(data.orderId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#64748b;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#64748b;">Amount:</span> <strong>$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#64748b;">Transfer ID:</span> <strong>${escapeHtml(data.transferId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#64748b;">Date:</span> <strong>${escapeHtml(data.payoutDate.toLocaleDateString())}</strong></div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 16px 0 0 0; font-size: 13px; color:#334155;">
      Thanks for selling on Wildlife Exchange.
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin: null }) };
}

export function getAuctionWinnerEmail(data: AuctionWinnerEmailData): { subject: string; html: string } {
  const subject = `You Won the Auction - ${data.listingTitle}`;
  const preheader = `You won ${data.listingTitle}. Complete checkout within 48 hours to secure your purchase.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-size: 20px; font-weight: 800; margin: 0 0 8px 0;">You won the auction</div>
    <div style="font-size: 14px; color:#334155; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.winnerName)} — you’re the winning bidder. Complete checkout within <strong>48 hours</strong> to secure the purchase.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc; border:1px solid #e2e8f0; border-radius: 14px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-size: 12px; color:#64748b; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase;">Auction details</div>
          <div style="margin-top: 10px; font-size: 14px; color:#0f172a;">
            <div><span style="color:#64748b;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#64748b;">Winning bid:</span> <strong>$${data.winningBid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#64748b;">Auction ended:</span> <strong>${escapeHtml(data.auctionEndDate.toLocaleDateString())}</strong></div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.orderUrl, 'Complete checkout')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}
