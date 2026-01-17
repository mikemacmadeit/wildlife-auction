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

export interface AuctionOutbidEmailData {
  outbidderName: string;
  listingTitle: string;
  newBidAmount: number;
  listingUrl: string;
  auctionEndsAt?: Date;
}

export interface WelcomeEmailData {
  userName: string;
  dashboardUrl: string;
}

export interface AuctionHighBidderEmailData {
  userName: string;
  listingTitle: string;
  yourBidAmount: number;
  listingUrl: string;
  auctionEndsAt?: Date;
}

export interface AuctionEndingSoonEmailData {
  userName: string;
  listingTitle: string;
  threshold: '24h' | '1h' | '10m' | '2m';
  listingUrl: string;
  auctionEndsAt: Date;
  currentBidAmount?: number;
}

export interface AuctionLostEmailData {
  userName: string;
  listingTitle: string;
  listingUrl: string;
  finalBidAmount?: number;
}

export interface DeliveryCheckInEmailData {
  buyerName: string;
  orderId: string;
  listingTitle: string;
  daysSinceDelivery: number;
  orderUrl: string;
}

export interface ProfileIncompleteReminderEmailData {
  userName: string;
  settingsUrl: string;
  missingFields?: string[];
}

export interface WeeklyDigestEmailData {
  userName: string;
  listings: Array<{ title: string; url: string; price?: number; endsAt?: Date }>;
  unsubscribeUrl?: string;
}

export interface SavedSearchAlertEmailData {
  userName: string;
  queryName: string;
  resultsCount: number;
  searchUrl: string;
  unsubscribeUrl?: string;
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
  // Match homepage hero: the main wordmark uses Barletta Stamp.
  const fontBrand = `'BarlettaStamp','BarlettaInline','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif`;
  const fontBody = `'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif`;
  const cOlivewood = '#22251F';
  const cParchment = '#F4F0E6';
  const cSandBase = '#C7B79E';
  const cSandSurface = '#E2D6C2';
  const cSandSubtle = '#D6C8B0';
  const cSage = '#7F8A73';
  const cOlive = '#B9C2A4';
  const cBark = '#5B564A';

  // Logo tint: use the lighter olive brand accent (matches site dark-mode accent usage).
  const logoTint = cOlive;

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
                <tr>
                  <td style="padding: 18px 18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 12px; width: 44px;">
                          <!--
                            Logo rendering note:
                            The website tints the Kudu mark using CSS masks. Email clients vary wildly in CSS support.
                            We use the same CSS mask approach for modern clients (matches the site icons), with an
                            Outlook (mso) fallback to a plain image.
                          -->
                          <!--[if mso]>
                            <img src="${logoUrl}" width="40" height="40" alt="Wildlife Exchange"
                                 style="display:block; border:0; outline:none; text-decoration:none; border-radius: 12px; background:${cSandSurface};" />
                          <![endif]-->
                          <!--[if !mso]><!-->
                            <div
                              style="
                                width:40px; height:40px; display:block;
                                background-color:${logoTint};
                                mask-image:url('${logoUrl}');
                                mask-size:contain;
                                mask-repeat:no-repeat;
                                mask-position:center;
                                -webkit-mask-image:url('${logoUrl}');
                                -webkit-mask-size:contain;
                                -webkit-mask-repeat:no-repeat;
                                -webkit-mask-position:center;
                              "
                              aria-label="Wildlife Exchange"
                            ></div>
                          <!--<![endif]-->
                        </td>
                        <td style="vertical-align: middle;">
                          <div style="font-family:${fontBrand}; font-size: 26px; font-weight: 900; color: ${cSandBase}; letter-spacing: 0.2px;">
                            Wildlife Exchange
                          </div>
                          <div style="font-family:${fontBody}; font-size: 12px; color: rgba(244,240,230,0.86); margin-top: 2px;">
                            Texas Exotic & Breeder Animal Marketplace
                          </div>
                        </td>
                        <td align="right" style="vertical-align: middle;">
                          <a href="${origin}" style="font-family:${fontBody}; font-size: 12px; color:${cOlive}; font-weight: 800; text-decoration:none;">
                            wildlife.exchange
                          </a>
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
      Hi ${escapeHtml(data.buyerName)} — your payment was received and your funds are held securely until delivery and issue windows are complete.
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
      Here’s what happens next:
      <ul style="margin: 8px 0 0 18px; padding: 0; color:#5B564A;">
        <li>Seller prepares delivery</li>
        <li>Seller marks delivered / in transit</li>
        <li>You confirm receipt or report an issue within the protection window (if applicable)</li>
        <li>Admin releases payout once it’s safe</li>
      </ul>
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.orderUrl, 'View transaction timeline')}
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

export function getAuctionOutbidEmail(data: AuctionOutbidEmailData): { subject: string; html: string } {
  const subject = `You’ve been outbid — ${data.listingTitle}`;
  const preheader = `Someone just outbid you. Jump back in before it’s gone.`;
  const origin = tryGetOrigin(data.listingUrl);

  const endsAtLine = data.auctionEndsAt
    ? `<div style="margin-top: 6px;"><span style="color:#5B564A;">Ends:</span> <strong>${escapeHtml(
        data.auctionEndsAt.toLocaleString()
      )}</strong></div>`
    : '';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      You’ve been outbid
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.outbidderName)} — someone just jumped ahead of you. If you want it, now’s your moment.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Current auction
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">New high bid:</span> <strong>$${data.newBidAmount.toLocaleString(
              'en-US',
              { minimumFractionDigits: 2, maximumFractionDigits: 2 }
            )}</strong></div>
            ${endsAtLine}
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 16px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
      Tip: Strong bidders move fast. If you still want this animal, don’t wait for the last second.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.listingUrl, 'Raise my bid')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getWelcomeEmail(data: WelcomeEmailData): { subject: string; html: string } {
  const subject = `Welcome to Wildlife Exchange`;
  const preheader = `Your next great deal is one bid away.`;
  const origin = tryGetOrigin(data.dashboardUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Welcome aboard
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.userName)} — you’re in. Watch auctions, place bids, and buy with confidence.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Quick wins
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div>• Save listings to your watchlist</div>
            <div style="margin-top: 6px;">• Turn on push notifications for instant outbid alerts</div>
            <div style="margin-top: 6px;">• Complete your profile to streamline checkout</div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.dashboardUrl, 'Go to dashboard')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAuctionHighBidderEmail(data: AuctionHighBidderEmailData): { subject: string; html: string } {
  const subject = `You’re the high bidder — ${data.listingTitle}`;
  const preheader = `You’re currently winning. Stay sharp until the clock hits zero.`;
  const origin = tryGetOrigin(data.listingUrl);

  const endsAtLine = data.auctionEndsAt
    ? `<div style="margin-top: 6px;"><span style="color:#5B564A;">Ends:</span> <strong>${escapeHtml(
        data.auctionEndsAt.toLocaleString()
      )}</strong></div>`
    : '';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      You’re winning
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.userName)} — you’re currently the high bidder. Stay ready.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Auction status
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Your bid:</span> <strong>$${data.yourBidAmount.toLocaleString(
              'en-US',
              { minimumFractionDigits: 2, maximumFractionDigits: 2 }
            )}</strong></div>
            ${endsAtLine}
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.listingUrl, 'Watch the auction')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAuctionEndingSoonEmail(data: AuctionEndingSoonEmailData): { subject: string; html: string } {
  const subject = `Ending soon (${data.threshold}) — ${data.listingTitle}`;
  const preheader = `This one is coming down to the wire.`;
  const origin = tryGetOrigin(data.listingUrl);

  const currentBidLine =
    typeof data.currentBidAmount === 'number'
      ? `<div style="margin-top: 6px;"><span style="color:#5B564A;">Current bid:</span> <strong>$${data.currentBidAmount.toLocaleString(
          'en-US',
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</strong></div>`
      : '';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Ending soon (${escapeHtml(data.threshold)})
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.userName)} — “${escapeHtml(data.listingTitle)}” is almost done. If you want it, move now.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Countdown
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Ends:</span> <strong>${escapeHtml(data.auctionEndsAt.toLocaleString())}</strong></div>
            ${currentBidLine}
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.listingUrl, 'View auction')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAuctionLostEmail(data: AuctionLostEmailData): { subject: string; html: string } {
  const subject = `Auction ended — ${data.listingTitle}`;
  const preheader = `That one got away. Keep your watchlist tight—new inventory drops weekly.`;
  const origin = tryGetOrigin(data.listingUrl);

  const finalBidLine =
    typeof data.finalBidAmount === 'number'
      ? `<div style="margin-top: 6px;"><span style="color:#5B564A;">Final bid:</span> <strong>$${data.finalBidAmount.toLocaleString(
          'en-US',
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}</strong></div>`
      : '';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Auction ended
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.userName)} — this auction has ended. Don’t worry — the next one is coming.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Listing
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><strong>${escapeHtml(data.listingTitle)}</strong></div>
            ${finalBidLine}
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.listingUrl, 'Browse similar')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getDeliveryCheckInEmail(data: DeliveryCheckInEmailData): { subject: string; html: string } {
  const subject = `Quick check-in — ${data.listingTitle}`;
  const preheader = `How did it go? Confirm receipt or report an issue.`;
  const origin = tryGetOrigin(data.orderUrl);

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Quick check-in
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.buyerName)} — it’s been ${escapeHtml(String(data.daysSinceDelivery))} days since delivery. If everything looks good, confirm receipt. If there’s an issue, let us know.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Order
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Order ID:</span> <strong>${escapeHtml(data.orderId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.orderUrl, 'Open order')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getProfileIncompleteReminderEmail(
  data: ProfileIncompleteReminderEmailData
): { subject: string; html: string } {
  const subject = `Finish your profile`;
  const preheader = `A few details now = smoother bidding and checkout later.`;
  const origin = tryGetOrigin(data.settingsUrl);

  const missing =
    data.missingFields && data.missingFields.length
      ? `<div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
          <strong style="color:#22251F;">Missing:</strong> ${escapeHtml(data.missingFields.join(', '))}
        </div>`
      : '';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Finish your profile
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 12px 0;">
      Hi ${escapeHtml(data.userName)} — completing your profile helps sellers trust you and speeds up checkout.
    </div>
    ${missing}

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.settingsUrl, 'Update my profile')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getWeeklyDigestEmail(data: WeeklyDigestEmailData): { subject: string; html: string } {
  const subject = `Weekly digest — fresh auctions & inventory`;
  const preheader = `A quick scan of what’s new (Texas-only).`;
  const origin = data.listings?.[0]?.url ? tryGetOrigin(data.listings[0].url) : null;

  const items = (data.listings || [])
    .slice(0, 12)
    .map((l) => {
      const price = typeof l.price === 'number' ? ` — $${l.price.toLocaleString('en-US')}` : '';
      const ends = l.endsAt ? ` · ends ${escapeHtml(l.endsAt.toLocaleDateString())}` : '';
      return `<div style="margin-top: 10px;">
        <a href="${l.url}" style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F; text-decoration:none; font-weight: 700;">
          ${escapeHtml(l.title)}${escapeHtml(price)}${ends}
        </a>
      </div>`;
    })
    .join('');

  const unsub = data.unsubscribeUrl
    ? `<div style="margin-top: 18px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
        <a href="${data.unsubscribeUrl}" style="color:#7F8A73; text-decoration:none; font-weight:700;">Unsubscribe</a>
      </div>`
    : '';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Weekly digest
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.userName)} — here are a few listings worth a look.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          ${items || '<div style="font-family: Founders Grotesk, Inter, Arial, sans-serif; font-size: 14px; color:#5B564A;">No listings this week.</div>'}
        </td>
      </tr>
    </table>
    ${unsub}
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getSavedSearchAlertEmail(data: SavedSearchAlertEmailData): { subject: string; html: string } {
  const subject = `Saved search alert — ${data.queryName}`;
  const preheader = `${data.resultsCount} new match${data.resultsCount === 1 ? '' : 'es'} for your search.`;
  const origin = tryGetOrigin(data.searchUrl);

  const unsub = data.unsubscribeUrl
    ? `<div style="margin-top: 18px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
        <a href="${data.unsubscribeUrl}" style="color:#7F8A73; text-decoration:none; font-weight:700;">Unsubscribe</a>
      </div>`
    : '';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      New matches found
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.userName)} — your saved search <strong>${escapeHtml(data.queryName)}</strong> has <strong>${escapeHtml(
    String(data.resultsCount)
  )}</strong> new match${data.resultsCount === 1 ? '' : 'es'}.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.searchUrl, 'View results')}
    </div>
    ${unsub}
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}
