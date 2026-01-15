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
      <td align="center" bgcolor="#7F8A73" style="border-radius: 12px;">
        <a href="${href}"
           style="display:inline-block; padding: 12px 18px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                  font-size: 14px; font-weight: 800; letter-spacing: 0.2px; color: #22251F; text-decoration: none; border-radius: 12px;">
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
  const heroUrl = `${origin}/images/Buck_1.webp`;
  const fontBrand = `'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif`;
  const fontBody = `'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif`;
  const cOlivewood = '#22251F';
  const cParchment = '#F4F0E6';
  const cSandBase = '#C7B79E';
  const cSandSurface = '#E2D6C2';
  const cSandSubtle = '#D6C8B0';
  const cSage = '#7F8A73';
  const cOlive = '#B9C2A4';
  const cBark = '#5B564A';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(params.title)}</title>
  <!-- Web fonts are not guaranteed in email clients. We provide best-effort + robust fallbacks. -->
  <style>
    @font-face {
      font-family: 'BarlettaInline';
      src: url('${origin}/fonts/Barletta%20Inline.otf') format('opentype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'BarlettaStamp';
      src: url('${origin}/fonts/Barletta%20Stamp.otf') format('opentype');
      font-weight: normal;
      font-style: normal;
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${cSandBase};">
  <!-- Preheader (hidden) -->
  <div style="display:none; font-size:1px; color:${cSandBase}; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    ${escapeHtml(params.preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${cSandBase}; padding: 26px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">
          <!-- Header -->
          <tr>
            <td style="padding: 0 0 12px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:${cOlivewood}; border-radius: 18px; overflow:hidden; border: 1px solid rgba(34,37,31,0.18);">
                <!-- Hero banner image (matches homepage) -->
                <tr>
                  <td>
                    <img
                      src="${heroUrl}"
                      width="600"
                      alt="Wildlife Exchange"
                      style="display:block; width:100%; max-width:600px; height:auto; border:0; outline:none; text-decoration:none;"
                    />
                  </td>
                </tr>
                <!-- Brand lockup strip (email-safe) -->
                <tr>
                  <td style="padding: 16px 18px; background:${cSandSurface};">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 12px; width: 44px;">
                          <img src="${logoUrl}" width="40" height="40" alt="Wildlife Exchange"
                               style="display:block; border:0; outline:none; text-decoration:none; border-radius: 12px; background:${cSandSurface};" />
                        </td>
                        <td style="vertical-align: middle;">
                          <div style="font-family:${fontBrand}; font-size: 22px; font-weight: 900; color: ${cOlivewood}; letter-spacing: 0.2px;">
                            Wildlife Exchange
                          </div>
                          <div style="font-family:${fontBody}; font-size: 12px; color: ${cBark}; margin-top: 2px;">
                            Texas Exotic & Breeder Animal Marketplace
                          </div>
                        </td>
                        <td align="right" style="vertical-align: middle;">
                          <div style="font-family:${fontBody}; font-size: 12px; color:${cBark}; font-weight: 700;">
                            wildlife.exchange
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="height: 6px; background: linear-gradient(90deg, ${cSage} 0%, ${cOlive} 40%, ${cSage} 100%); font-size:0; line-height:0;">
                    &nbsp;
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:${cParchment}; border:1px solid rgba(34,37,31,0.20); border-radius: 18px; overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 22px 20px; font-family:${fontBody}; color:${cOlivewood}; line-height:1.55;">
                    ${params.contentHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 14px 8px 0 8px; text-align:center;">
              <div style="font-family: ${fontBody}; font-size: 12px; color:${cBark}; line-height: 1.4;">
                This is an automated message from Wildlife Exchange.
              </div>
              <div style="font-family: ${fontBody}; font-size: 12px; color:${cBark}; line-height: 1.4; margin-top: 4px;">
                © ${year} Wildlife Exchange. All rights reserved.
              </div>
              <div style="font-family: ${fontBody}; font-size: 12px; color:${cBark}; line-height: 1.4; margin-top: 6px;">
                <a href="${origin}" style="color:${cSage}; text-decoration:none; font-weight:700;">Visit wildlife.exchange</a>
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
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Order confirmed
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.buyerName)} — your payment was received and your order is now in escrow.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Order details
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Order ID:</span> <strong>${escapeHtml(data.orderId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Amount:</span> <strong>$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Date:</span> <strong>${escapeHtml(data.orderDate.toLocaleDateString())}</strong></div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 16px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
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
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Delivery confirmed
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.buyerName)} — the seller marked your order as delivered.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Order summary
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Order ID:</span> <strong>${escapeHtml(data.orderId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Delivered:</span> <strong>${escapeHtml(data.deliveryDate.toLocaleDateString())}</strong></div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 16px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
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
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Payout released
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.sellerName)} — your payout was released and should arrive in your account within 2–5 business days.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Payout details
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Order ID:</span> <strong>${escapeHtml(data.orderId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Amount:</span> <strong>$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Transfer ID:</span> <strong>${escapeHtml(data.transferId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Date:</span> <strong>${escapeHtml(data.payoutDate.toLocaleDateString())}</strong></div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 16px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
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
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      You won the auction
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.winnerName)} — you’re the winning bidder. Complete checkout within <strong>48 hours</strong> to secure the purchase.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Auction details
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Winning bid:</span> <strong>$${data.winningBid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Auction ended:</span> <strong>${escapeHtml(data.auctionEndDate.toLocaleDateString())}</strong></div>
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
