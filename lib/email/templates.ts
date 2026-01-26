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

export interface OrderInTransitEmailData {
  buyerName: string;
  orderId: string;
  listingTitle: string;
  orderUrl: string;
}

export interface OrderPreparingEmailData {
  buyerName: string;
  orderId: string;
  listingTitle: string;
  orderUrl: string;
}

export interface OrderReceivedEmailData {
  sellerName: string;
  orderId: string;
  listingTitle: string;
  orderUrl: string;
}

export interface OrderDeliveredEmailData {
  buyerName: string;
  orderId: string;
  listingTitle: string;
  orderUrl: string;
}

export interface OrderAcceptedEmailData {
  sellerName: string;
  orderId: string;
  listingTitle: string;
  amount: number;
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

export interface MessageReceivedEmailData {
  userName: string;
  listingTitle: string;
  threadUrl: string;
  listingUrl: string;
  senderRole: 'buyer' | 'seller';
  preview?: string;
}

export interface VerifyEmailEmailData {
  userName: string;
  verifyUrl: string;
  dashboardUrl: string;
}

export interface OfferAcceptedEmailData {
  userName: string;
  listingTitle: string;
  amount: number;
  offerUrl: string;
}

export interface OfferSubmittedEmailData {
  userName: string;
  listingTitle: string;
  amount: number;
  offerUrl: string;
  expiresAt?: string;
}

export interface OfferReceivedEmailData {
  userName: string;
  listingTitle: string;
  amount: number;
  offerUrl: string;
  expiresAt?: string;
}

export interface OfferCounteredEmailData {
  userName: string;
  listingTitle: string;
  amount: number;
  offerUrl: string;
  expiresAt?: string;
}

export interface OfferDeclinedEmailData {
  userName: string;
  listingTitle: string;
  offerUrl: string;
}

export interface OfferExpiredEmailData {
  userName: string;
  listingTitle: string;
  offerUrl: string;
}

export interface SupportTicketReplyEmailData {
  ticketId: string;
  userName: string;
  userMessage: string;
  subjectLine: string;
  ticketUrl: string;
}

export interface ListingApprovedEmailData {
  userName: string;
  listingTitle: string;
  listingUrl: string;
}

export interface ListingRejectedEmailData {
  userName: string;
  listingTitle: string;
  editUrl: string;
  reason?: string;
}

export interface AdminListingSubmittedEmailData {
  adminName: string;
  listingTitle: string;
  listingId: string;
  sellerId: string;
  sellerName?: string;
  pendingReason: 'admin_approval' | 'compliance_review' | 'unknown';
  category?: string;
  listingType?: string;
  complianceStatus?: string;
  listingUrl: string;
  adminQueueUrl: string;
  adminComplianceUrl?: string;
}

export interface AdminListingComplianceReviewEmailData {
  adminName: string;
  listingTitle: string;
  listingId: string;
  sellerId: string;
  sellerName?: string;
  complianceStatus?: string;
  listingUrl: string;
  adminComplianceUrl: string;
}

export interface AdminListingAdminApprovalEmailData {
  adminName: string;
  listingTitle: string;
  listingId: string;
  sellerId: string;
  sellerName?: string;
  listingUrl: string;
  adminQueueUrl: string;
}

export interface AdminListingApprovedEmailData {
  adminName: string;
  listingTitle: string;
  listingId: string;
  sellerId: string;
  sellerName?: string;
  listingUrl: string;
  adminQueueUrl: string;
}

export interface AdminListingRejectedEmailData {
  adminName: string;
  listingTitle: string;
  listingId: string;
  sellerId: string;
  sellerName?: string;
  reason?: string;
  adminQueueUrl: string;
}

export interface AdminDisputeOpenedEmailData {
  adminName: string;
  orderId: string;
  listingTitle?: string;
  listingId?: string;
  buyerId: string;
  disputeType: 'order_dispute' | 'protected_transaction_dispute';
  reason: string;
  adminOpsUrl: string;
}

// Compliance Transfer Email Data
export interface OrderTransferComplianceRequiredEmailData {
  recipientName: string;
  orderId: string;
  listingTitle: string;
  orderUrl: string;
}

export interface OrderComplianceBuyerConfirmedEmailData {
  recipientName: string;
  orderId: string;
  listingTitle: string;
  orderUrl: string;
}

export interface OrderComplianceSellerConfirmedEmailData {
  recipientName: string;
  orderId: string;
  listingTitle: string;
  orderUrl: string;
}

export interface OrderComplianceUnlockedEmailData {
  recipientName: string;
  orderId: string;
  listingTitle: string;
  orderUrl: string;
}

export interface AdminBreederPermitSubmittedEmailData {
  adminName: string;
  sellerId: string;
  sellerName?: string;
  permitNumber?: string;
  storagePath: string;
  documentUrl?: string;
  adminComplianceUrl: string;
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

function renderSecondaryButton(href: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
    <tr>
      <td align="center" bgcolor="#E2D6C2" style="border-radius: 12px; border: 1px solid rgba(34,37,31,0.18);">
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
  // Always use production origin for images/assets to ensure they load correctly
  // The origin param is used for links, but assets should always point to production
  const productionOrigin = 'https://wildlife.exchange';
  const origin = params.origin || productionOrigin;
  const logoUrl = `${productionOrigin}/images/Kudu.png`;
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

  // Logo tint: match the email header background (dark olivewood) per brand direction.
  const logoTint = cOlivewood;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Encourage email clients to render this as light mode (reduces mobile/desktop color drift). -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(params.title)}</title>
  <!-- Web fonts are not guaranteed in email clients. We provide best-effort + robust fallbacks. -->
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
    @font-face {
      font-family: 'BarlettaInline';
      src: url('${productionOrigin}/fonts/Barletta%20Inline.otf') format('opentype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'BarlettaStamp';
      src: url('${productionOrigin}/fonts/Barletta%20Stamp.otf') format('opentype');
      font-weight: normal;
      font-style: normal;
    }
    /* Mobile responsive styles - ensure consistent colors and layout */
    @media only screen and (max-width: 600px) {
      .email-outer {
        padding: 16px 8px !important;
      }
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .email-body {
        padding: 16px 14px !important;
      }
      .email-header {
        padding: 14px 14px !important;
      }
      .email-header-text {
        font-size: 22px !important;
      }
      .email-header-subtext {
        font-size: 11px !important;
      }
      .email-logo-cell {
        width: 36px !important;
        padding-right: 10px !important;
      }
      .email-logo-wrapper {
        width: 36px !important;
        height: 36px !important;
      }
      .email-logo-img {
        width: 24px !important;
        height: 24px !important;
      }
      /* Ensure background colors are preserved on mobile (sand base: #C7B79E, parchment: #F4F0E6) */
      body {
        background-color: #C7B79E !important;
      }
      table.email-outer {
        background-color: #C7B79E !important;
      }
      td[bgcolor="#F4F0E6"] {
        background-color: #F4F0E6 !important;
      }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${cSandBase}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <!-- Preheader (hidden) -->
  <div style="display:none; font-size:1px; color:${cSandBase}; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    ${escapeHtml(params.preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${cSandBase}" class="email-outer" style="background-color:${cSandBase}; padding: 26px 12px; mso-padding-alt: 26px 12px; mso-background-color-alt: ${cSandBase};">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-container" style="width:600px; max-width:600px; mso-width-alt: 600px;">
          <!-- Header -->
          <tr>
            <td style="padding: 0 0 12px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     bgcolor="${cOlivewood}"
                     style="background:${cOlivewood}; background-color:${cOlivewood}; border-radius: 18px; overflow:hidden; border: 1px solid rgba(34,37,31,0.18);">
                <tr>
                  <td class="email-header" style="padding: 18px 18px; mso-padding-alt: 18px 18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td class="email-logo-cell" style="vertical-align: middle; padding-right: 12px; width: 44px; mso-padding-alt: 0 12px 0 0;">
                          <!-- Logo: Use plain img as primary (works in all clients), CSS mask as enhancement for modern clients -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="email-logo-wrapper" style="border-collapse:separate; width:40px; height:40px; mso-width-alt: 40px; mso-height-alt: 40px;">
                            <tr>
                              <td width="40" height="40"
                                  bgcolor="${cSandSurface}"
                                  style="width:40px; height:40px; background-color:${cSandSurface}; border-radius:12px; padding:6px; mso-line-height-rule:exactly; mso-padding-alt: 6px;">
                                <!-- Primary: Plain image (works everywhere) -->
                                <img src="${logoUrl}" 
                                     width="28" 
                                     height="28" 
                                     alt="Wildlife Exchange"
                                     class="email-logo-img"
                                     style="display:block; width:28px; height:28px; border:0; outline:none; text-decoration:none; background-color:${logoTint}; border-radius:8px; mso-width-alt: 28px; mso-height-alt: 28px;"
                                     border="0" />
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td style="vertical-align: middle;">
                          <div class="email-header-text" style="font-family:${fontBrand}; font-size: 26px; font-weight: 900; color: ${cSandBase}; letter-spacing: 0.2px; mso-color-alt: #C7B79E;">
                            Wildlife Exchange
                          </div>
                          <div class="email-header-subtext" style="font-family:${fontBody}; font-size: 12px; color: rgba(244,240,230,0.86); margin-top: 2px; mso-color-alt: #F4F0E6;">
                            Texas Livestock & Ranch Marketplace
                          </div>
                        </td>
                        <td align="right" style="vertical-align: middle;">
                          <a href="${origin}" style="font-family:${fontBody}; font-size: 12px; color:${cParchment}; font-weight: 800; text-decoration:none;">
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
            <td bgcolor="${cParchment}" style="background:${cParchment}; background-color:${cParchment}; border:1px solid rgba(34,37,31,0.20); border-radius: 18px; overflow:hidden; mso-background-color-alt: ${cParchment};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="email-body" bgcolor="${cParchment}" style="padding: 22px 20px; font-family:${fontBody}; color:${cOlivewood}; line-height:1.55; mso-padding-alt: 22px 20px; mso-color-alt: ${cOlivewood}; background-color:${cParchment};">
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
  const preheader = `Order confirmed for ${data.listingTitle}. Funds held for payout release until delivery.`;
  const origin = tryGetOrigin(data.orderUrl);
  const contactUrl = `${origin || 'https://wildlife.exchange'}/contact`;
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Order confirmed
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.buyerName)} — your payment was received. Your funds are held securely while the seller coordinates delivery.
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
      Here’s what happens next (the eBay-style “what to do now”):
      <ul style="margin: 8px 0 0 18px; padding: 0; color:#5B564A;">
        <li><strong>Coordinate delivery</strong> with the seller (use in-app messages from the order page).</li>
        <li><strong>Track status</strong> as the seller marks the order in transit / delivered.</li>
        <li><strong>Inspect on delivery</strong> and confirm receipt if everything looks right.</li>
        <li><strong>If there’s an issue</strong>, open a dispute from the order page so we can help.</li>
      </ul>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin-top: 14px; background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Safety reminder
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
            Keep all communication and payment inside Wildlife Exchange. We’ll never ask you to pay outside the platform or to share passwords/verification codes.
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.orderUrl, 'View transaction timeline')}
    </div>

    <div style="margin: 14px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      Need help? Visit <a href="${contactUrl}" style="color:#7F8A73; text-decoration:none; font-weight:700;">Contact</a> and include your order ID: <strong>${escapeHtml(data.orderId)}</strong>.
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getDeliveryConfirmationEmail(data: DeliveryConfirmationEmailData): { subject: string; html: string } {
  const subject = `Delivery Confirmed - ${data.listingTitle}`;
  const preheader = `Delivery confirmed for ${data.listingTitle}. Review and confirm receipt if everything looks good.`;
  const origin = tryGetOrigin(data.orderUrl);
  const contactUrl = `${origin || 'https://wildlife.exchange'}/contact`;
  const checkInUrl = `${data.orderUrl}${data.orderUrl.includes('?') ? '&' : '?'}checkin=1`;
  const issueUrl = `${data.orderUrl}${data.orderUrl.includes('?') ? '&' : '?'}issue=1`;
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
      Please inspect your order and confirm receipt when you’re satisfied. If something isn’t right, open a dispute from the order page so we can help resolve it.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(checkInUrl, 'Yes, delivery arrived')}
    </div>
    <div style="margin: 10px 0 0 0;">
      ${renderSecondaryButton(issueUrl, 'I have an issue')}
    </div>

    <div style="margin: 14px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      Tip: Keep photos/notes if there’s an issue. You can also <a href="${data.orderUrl}" style="color:#7F8A73; text-decoration:none; font-weight:700;">view the order</a>.
      Need help? <a href="${contactUrl}" style="color:#7F8A73; text-decoration:none; font-weight:700;">Contact us</a> with order ID <strong>${escapeHtml(data.orderId)}</strong>.
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getOrderInTransitEmail(data: OrderInTransitEmailData): { subject: string; html: string } {
  const subject = `In transit — ${data.listingTitle}`;
  const preheader = `Your order is on the way. View the latest status and messages.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      In transit
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.buyerName)} — the seller marked your order as in transit.
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

    <div style="margin: 16px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
      For the fastest updates, keep communication inside the order page.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.orderUrl, 'View order')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getOrderPreparingEmail(data: OrderPreparingEmailData): { subject: string; html: string } {
  const subject = `Preparing delivery — ${data.listingTitle}`;
  const preheader = `The seller is preparing your order. View the latest status and messages.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Preparing delivery
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.buyerName)} — the seller marked your order as preparing for delivery.
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

    <div style="margin: 16px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
      We’ll notify you again when it’s in transit.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.orderUrl, 'View order')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getPayoutNotificationEmail(data: PayoutNotificationEmailData): { subject: string; html: string } {
  const subject = `Payout Released - ${data.listingTitle}`;
  const preheader = `Payout released for ${data.listingTitle}. Arrival time depends on your bank.`;
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Payout released
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.sellerName)} — your payout was released. Depending on your bank, it may take a few business days to appear.
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
      This is the final step of the transaction timeline. Keep this email for your records.
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin: null }) };
}

export function getAuctionWinnerEmail(data: AuctionWinnerEmailData): { subject: string; html: string } {
  const subject = `You Won the Auction - ${data.listingTitle}`;
  const preheader = `You won ${data.listingTitle}. Complete checkout to secure your purchase.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      You won the auction
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.winnerName)} — you’re the winning bidder. Complete checkout to secure the purchase and start the transaction timeline.
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

    <div style="margin: 14px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      Safety reminder: Only pay through Wildlife Exchange. Never send payment outside the platform.
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export interface BidPlacedEmailData {
  userName: string;
  listingTitle: string;
  bidAmount: number;
  currentBidAmount: number;
  isHighBidder: boolean;
  listingUrl: string;
  auctionEndsAt?: Date | string;
}

export function getBidPlacedEmail(data: BidPlacedEmailData): { subject: string; html: string } {
  const subject = data.isHighBidder 
    ? `Bid placed — you're winning: ${data.listingTitle}`
    : `Bid placed: ${data.listingTitle}`;
  const preheader = data.isHighBidder
    ? `Your bid is currently the high bid.`
    : `Your bid has been placed successfully.`;
  const origin = tryGetOrigin(data.listingUrl);

  const endsAtLine = data.auctionEndsAt
    ? `<div style="margin-top: 6px;"><span style="color:#5B564A;">Ends:</span> <strong>${escapeHtml(
        typeof data.auctionEndsAt === 'string' 
          ? new Date(data.auctionEndsAt).toLocaleString()
          : data.auctionEndsAt.toLocaleString()
      )}</strong></div>`
    : '';

  const statusMessage = data.isHighBidder
    ? `Hi ${escapeHtml(data.userName)} — your bid has been placed and you're currently the high bidder!`
    : `Hi ${escapeHtml(data.userName)} — your bid has been placed successfully.`;

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      ${data.isHighBidder ? 'Bid placed — you\'re winning!' : 'Bid placed'}
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      ${statusMessage}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Bid details
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Your bid:</span> <strong>$${data.bidAmount.toLocaleString(
              'en-US',
              { minimumFractionDigits: 2, maximumFractionDigits: 2 }
            )}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Current high bid:</span> <strong>$${data.currentBidAmount.toLocaleString(
              'en-US',
              { minimumFractionDigits: 2, maximumFractionDigits: 2 }
            )}</strong></div>
            ${endsAtLine}
          </div>
        </td>
      </tr>
    </table>

    ${data.isHighBidder 
      ? `<div style="margin: 14px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
          Tip: If you can't watch the finish, set a maximum you're comfortable paying so you're not caught off guard.
        </div>`
      : `<div style="margin: 14px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
          You'll be notified if someone outbids you or if you win the auction.
        </div>`
    }

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.listingUrl, 'View listing')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAuctionOutbidEmail(data: AuctionOutbidEmailData): { subject: string; html: string } {
  const subject = `You’ve been outbid — ${data.listingTitle}`;
  const preheader = `You’ve been outbid. Review the current high bid and decide your next move.`;
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
      Tip: If you’re serious, set a bid you’re comfortable with (and consider using auto-bid if available) instead of trying to time the last second.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.listingUrl, 'Raise my bid')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getWelcomeEmail(data: WelcomeEmailData): { subject: string; html: string } {
  const subject = `Welcome to Wildlife Exchange`;
  const preheader = `Set up your account once, then bid/buy with confidence.`;
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
            <div style="margin-top: 6px;">• Complete your profile to streamline checkout and seller trust</div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 14px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      Safety reminder: Keep messaging and payments on-platform—this helps us protect buyers and sellers.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.dashboardUrl, 'Go to dashboard')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAuctionHighBidderEmail(data: AuctionHighBidderEmailData): { subject: string; html: string } {
  const subject = `You’re the high bidder — ${data.listingTitle}`;
  const preheader = `You’re currently winning. Keep an eye on the ending time.`;
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

    <div style="margin: 14px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
      Tip: If you can’t watch the finish, set a maximum you’re comfortable paying so you’re not caught off guard.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.listingUrl, 'Watch the auction')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAuctionEndingSoonEmail(data: AuctionEndingSoonEmailData): { subject: string; html: string } {
  const subject = `Ending soon (${data.threshold}) — ${data.listingTitle}`;
  const preheader = `Auction is ending soon. Check the ending time and current bid.`;
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

    <div style="margin: 14px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      Heads up: bidding can move fast near the end. If you’re planning to bid, don’t wait until the very last moment.
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAuctionLostEmail(data: AuctionLostEmailData): { subject: string; html: string } {
  const subject = `Auction ended — ${data.listingTitle}`;
  const preheader = `That one got away. Keep your watchlist tight—new inventory drops weekly.`;
  const origin = tryGetOrigin(data.listingUrl);
  const browseUrl = `${origin || 'https://wildlife.exchange'}/browse`;

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
      ${renderButton(browseUrl, 'Browse active listings')}
    </div>

    <div style="margin: 12px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      Want to review the finished listing? <a href="${data.listingUrl}" style="color:#7F8A73; text-decoration:none; font-weight:700;">View auction</a>
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getDeliveryCheckInEmail(data: DeliveryCheckInEmailData): { subject: string; html: string } {
  const subject = `Quick check-in — ${data.listingTitle}`;
  const preheader = `How did it go? Confirm receipt or report an issue.`;
  const origin = tryGetOrigin(data.orderUrl);
  const contactUrl = `${origin || 'https://wildlife.exchange'}/contact`;
  const checkInUrl = `${data.orderUrl}${data.orderUrl.includes('?') ? '&' : '?'}checkin=1`;
  const issueUrl = `${data.orderUrl}${data.orderUrl.includes('?') ? '&' : '?'}issue=1`;

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
      ${renderButton(checkInUrl, 'Yes, delivery arrived')}
    </div>
    <div style="margin: 10px 0 0 0;">
      ${renderSecondaryButton(issueUrl, 'I have an issue')}
    </div>

    <div style="margin: 14px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      If you need help, <a href="${contactUrl}" style="color:#7F8A73; text-decoration:none; font-weight:700;">contact us</a> and include order ID <strong>${escapeHtml(data.orderId)}</strong>.
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
      Hi ${escapeHtml(data.userName)} — completing your profile helps sellers trust you and makes checkout faster. It also helps us reach you quickly if there’s ever an issue with an order.
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
  const browseUrl = `${origin || 'https://wildlife.exchange'}/browse`;

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

    <div style="margin: 18px 0 0 0;">
      ${renderButton(browseUrl, 'Browse all weekly inventory')}
    </div>
    ${unsub}
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getSavedSearchAlertEmail(data: SavedSearchAlertEmailData): { subject: string; html: string } {
  const subject = `Saved search alert — ${data.queryName}`;
  const preheader = `${data.resultsCount} new match${data.resultsCount === 1 ? '' : 'es'} for your search.`;
  const origin = tryGetOrigin(data.searchUrl);
  const manageUrl = `${origin || 'https://wildlife.exchange'}/dashboard/saved-searches`;

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

    <div style="margin: 14px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      Want to refine this alert? <a href="${manageUrl}" style="color:#7F8A73; text-decoration:none; font-weight:700;">Manage saved searches</a>
    </div>
    ${unsub}
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getMessageReceivedEmail(data: MessageReceivedEmailData): { subject: string; html: string } {
  const subject = `New message — ${data.listingTitle}`;
  const preheader = data.preview ? data.preview : `You received a new message about ${data.listingTitle}.`;
  const origin = tryGetOrigin(data.threadUrl) || tryGetOrigin(data.listingUrl);
  const roleLabel = data.senderRole === 'buyer' ? 'a buyer' : 'a seller';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      New message
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.userName)} — you received a new message from ${escapeHtml(roleLabel)} about <strong>${escapeHtml(
    data.listingTitle
  )}</strong>.
    </div>

    ${
      data.preview
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
            <tr>
              <td style="padding: 14px 14px;">
                <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
                  Preview
                </div>
                <div style="margin-top: 8px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F; line-height: 1.5;">
                  ${escapeHtml(data.preview)}
                </div>
              </td>
            </tr>
          </table>`
        : ''
    }

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.threadUrl, 'View message')}
    </div>
    <div style="margin: 12px 0 0 0;">
      ${renderSecondaryButton(data.listingUrl, 'View listing')}
    </div>

    <div style="margin-top: 16px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      Keep communication in-app for the safest experience.
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getVerifyEmailEmail(data: VerifyEmailEmailData): { subject: string; html: string } {
  const subject = `Verify your email — Wildlife Exchange`;
  const preheader = `Confirm your email to unlock messaging, publishing, and checkout.`;
  const origin = tryGetOrigin(data.verifyUrl) || tryGetOrigin(data.dashboardUrl);

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Verify your email
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.userName)} — please confirm your email address to finish setting up your account.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.verifyUrl, 'Verify email')}
    </div>

    <div style="margin-top: 14px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      After you verify, you can return to your dashboard:
      <a href="${data.dashboardUrl}" style="color:#7F8A73; text-decoration:none; font-weight:700;">Open dashboard</a>
    </div>
    <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      If you didn’t create this account, you can ignore this email.
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getOfferAcceptedEmail(data: OfferAcceptedEmailData): { subject: string; html: string } {
  const subject = `Offer accepted — ${data.listingTitle}`;
  const preheader = `An offer was accepted for $${Number(data.amount).toLocaleString()} — view next steps.`;
  const origin = tryGetOrigin(data.offerUrl);

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Offer accepted
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.userName)} — an offer was accepted on <span style="font-weight:700; color:#22251F;">${escapeHtml(data.listingTitle)}</span>.
    </div>

    <div style="margin: 12px 0 0 0; padding: 12px 14px; border: 1px solid #E6E1D6; border-radius: 12px; background: #FBFAF7;">
      <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; text-transform: uppercase; letter-spacing: .08em; font-weight: 800;">
        Accepted amount
      </div>
      <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 20px; color:#22251F; font-weight: 900; margin-top: 2px;">
        $${Number(data.amount).toLocaleString()}
      </div>
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.offerUrl, 'View offer')}
    </div>

    <div style="margin-top: 12px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      Tip: If you’re the buyer, you can proceed to checkout from the offer page. If you’re the seller, you can track the accepted offer there.
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getOfferSubmittedEmail(data: OfferSubmittedEmailData): { subject: string; html: string } {
  const subject = `Offer submitted — ${data.listingTitle}`;
  const preheader = `Your offer of $${Number(data.amount).toLocaleString()} has been submitted to the seller.`;
  const origin = tryGetOrigin(data.offerUrl);

  const expires =
    data.expiresAt && data.expiresAt.trim()
      ? `<div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
          Expires: <span style="font-weight:800; color:#22251F;">${escapeHtml(new Date(data.expiresAt).toLocaleString())}</span>
        </div>`
      : '';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Offer submitted
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.userName)} — your offer on <span style="font-weight:700; color:#22251F;">${escapeHtml(data.listingTitle)}</span> has been submitted.
    </div>

    <div style="margin: 12px 0 0 0; padding: 12px 14px; border: 1px solid #E6E1D6; border-radius: 12px; background: #FBFAF7;">
      <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; text-transform: uppercase; letter-spacing: .08em; font-weight: 800;">
        Your offer
      </div>
      <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 20px; color:#22251F; font-weight: 900; margin-top: 2px;">
        $${escapeHtml(Number(data.amount).toLocaleString())}
      </div>
      ${expires}
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.offerUrl, 'View your offer')}
    </div>
    <div style="margin: 10px 0 0 0;">
      <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; line-height: 1.5;">
        The seller will be notified and can accept, counter, or decline your offer. You'll receive an email when they respond.
      </div>
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getOfferReceivedEmail(data: OfferReceivedEmailData): { subject: string; html: string } {
  const subject = `New offer — ${data.listingTitle}`;
  const preheader = `You received an offer for $${Number(data.amount).toLocaleString()} — review and respond.`;
  const origin = tryGetOrigin(data.offerUrl);

  const expires =
    data.expiresAt && data.expiresAt.trim()
      ? `<div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
          Expires: <span style="font-weight:800; color:#22251F;">${escapeHtml(new Date(data.expiresAt).toLocaleString())}</span>
        </div>`
      : '';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      New offer received
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.userName)} — you received an offer on <span style="font-weight:700; color:#22251F;">${escapeHtml(data.listingTitle)}</span>.
    </div>

    <div style="margin: 12px 0 0 0; padding: 12px 14px; border: 1px solid #E6E1D6; border-radius: 12px; background: #FBFAF7;">
      <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; text-transform: uppercase; letter-spacing: .08em; font-weight: 800;">
        Offer amount
      </div>
      <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 20px; color:#22251F; font-weight: 900; margin-top: 2px;">
        $${Number(data.amount).toLocaleString()}
      </div>
      ${expires}
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.offerUrl, 'Review offer')}
    </div>

    <div style="margin-top: 12px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
      Tip: You can accept, counter, or decline from the offer screen.
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getOfferCounteredEmail(data: OfferCounteredEmailData): { subject: string; html: string } {
  const subject = `Counter offer — ${data.listingTitle}`;
  const preheader = `There’s a counter offer for $${Number(data.amount).toLocaleString()} — view and respond.`;
  const origin = tryGetOrigin(data.offerUrl);

  const expires =
    data.expiresAt && data.expiresAt.trim()
      ? `<div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A;">
          Expires: <span style="font-weight:800; color:#22251F;">${escapeHtml(new Date(data.expiresAt).toLocaleString())}</span>
        </div>`
      : '';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Counter offer
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.userName)} — there’s a counter offer on <span style="font-weight:700; color:#22251F;">${escapeHtml(data.listingTitle)}</span>.
    </div>

    <div style="margin: 12px 0 0 0; padding: 12px 14px; border: 1px solid #E6E1D6; border-radius: 12px; background: #FBFAF7;">
      <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; text-transform: uppercase; letter-spacing: .08em; font-weight: 800;">
        Counter amount
      </div>
      <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 20px; color:#22251F; font-weight: 900; margin-top: 2px;">
        $${Number(data.amount).toLocaleString()}
      </div>
      ${expires}
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.offerUrl, 'View offer')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getOfferDeclinedEmail(data: OfferDeclinedEmailData): { subject: string; html: string } {
  const subject = `Offer declined — ${data.listingTitle}`;
  const preheader = `Your offer was declined — you can view details or make another offer.`;
  const origin = tryGetOrigin(data.offerUrl);

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Offer declined
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.userName)} — your offer on <span style="font-weight:700; color:#22251F;">${escapeHtml(data.listingTitle)}</span> was declined.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.offerUrl, 'View offers')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getOfferExpiredEmail(data: OfferExpiredEmailData): { subject: string; html: string } {
  const subject = `Offer expired — ${data.listingTitle}`;
  const preheader = `An offer expired — view details.`;
  const origin = tryGetOrigin(data.offerUrl);

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Offer expired
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.userName)} — an offer on <span style="font-weight:700; color:#22251F;">${escapeHtml(data.listingTitle)}</span> expired.
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.offerUrl, 'View offers')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getSupportTicketReplyEmail(data: SupportTicketReplyEmailData): { subject: string; html: string } {
  const subject = `Support reply: ${data.subjectLine || 'Your ticket'} (${data.ticketId})`;
  const preheader = `Support replied to your ticket ${data.ticketId}.`;
  const origin = tryGetOrigin(data.ticketUrl);

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Support replied
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.userName || 'there')} — we replied to your ticket <strong>${escapeHtml(data.ticketId)}</strong>.
    </div>

    <div style="margin: 14px 0; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(34,37,31,0.18); background: rgba(214,200,176,0.35);">
      <div style="font-size: 12px; opacity: 0.8; font-weight: 800; letter-spacing: 0.2px; text-transform: uppercase;">Support reply</div>
      <div style="margin-top: 8px; white-space: pre-wrap; line-height: 1.5;">${escapeHtml(data.userMessage || '')}</div>
    </div>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.ticketUrl, 'View ticket')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAdminListingSubmittedEmail(data: AdminListingSubmittedEmailData): { subject: string; html: string } {
  const subject = `Admin: listing submitted — ${data.listingTitle}`;
  const preheader =
    data.pendingReason === 'compliance_review'
      ? 'A listing was submitted and needs compliance review.'
      : data.pendingReason === 'admin_approval'
        ? 'A listing was submitted and needs admin approval.'
        : 'A listing was submitted and needs review.';
  const origin = tryGetOrigin(data.adminQueueUrl);

  const reasonLabel =
    data.pendingReason === 'admin_approval' ? 'Admin approval' : data.pendingReason === 'compliance_review' ? 'Compliance review' : 'Review';

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      New listing submitted
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.adminName)} — a listing was submitted and needs <strong>${escapeHtml(reasonLabel)}</strong>.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Listing
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Title:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Listing ID:</span> <strong>${escapeHtml(data.listingId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Seller:</span> <strong>${escapeHtml(data.sellerName || data.sellerId)}</strong></div>
            ${data.category ? `<div style="margin-top: 6px;"><span style="color:#5B564A;">Category:</span> <strong>${escapeHtml(data.category)}</strong></div>` : ''}
            ${data.listingType ? `<div style="margin-top: 6px;"><span style="color:#5B564A;">Type:</span> <strong>${escapeHtml(data.listingType)}</strong></div>` : ''}
            ${data.complianceStatus ? `<div style="margin-top: 6px;"><span style="color:#5B564A;">Compliance:</span> <strong>${escapeHtml(data.complianceStatus)}</strong></div>` : ''}
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.adminQueueUrl, 'Open review queue')}
    </div>
    <div style="margin: 10px 0 0 0;">
      ${renderSecondaryButton(data.listingUrl, 'View listing')}
    </div>
    ${data.adminComplianceUrl ? `<div style="margin: 10px 0 0 0;">${renderSecondaryButton(data.adminComplianceUrl, 'Open compliance')}</div>` : ''}
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAdminListingComplianceReviewEmail(
  data: AdminListingComplianceReviewEmailData
): { subject: string; html: string } {
  const subject = `Admin: compliance review — ${data.listingTitle}`;
  const preheader = `A listing is awaiting compliance review.`;
  const origin = tryGetOrigin(data.adminComplianceUrl);

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Compliance review needed
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.adminName)} — please review compliance for <strong>${escapeHtml(data.listingTitle)}</strong>.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Listing
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Title:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Listing ID:</span> <strong>${escapeHtml(data.listingId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Seller:</span> <strong>${escapeHtml(data.sellerName || data.sellerId)}</strong></div>
            ${data.complianceStatus ? `<div style="margin-top: 6px;"><span style="color:#5B564A;">Compliance:</span> <strong>${escapeHtml(data.complianceStatus)}</strong></div>` : ''}
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.adminComplianceUrl, 'Open compliance')}
    </div>
    <div style="margin: 10px 0 0 0;">
      ${renderSecondaryButton(data.listingUrl, 'View listing')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAdminListingAdminApprovalEmail(
  data: AdminListingAdminApprovalEmailData
): { subject: string; html: string } {
  const subject = `Admin: approval needed — ${data.listingTitle}`;
  const preheader = `A listing is awaiting admin approval.`;
  const origin = tryGetOrigin(data.adminQueueUrl);

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Admin approval needed
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.adminName)} — please approve or reject <strong>${escapeHtml(data.listingTitle)}</strong>.
    </div>
    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.adminQueueUrl, 'Open approvals')}
    </div>
    <div style="margin: 10px 0 0 0;">
      ${renderSecondaryButton(data.listingUrl, 'View listing')}
    </div>
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAdminListingApprovedEmail(data: AdminListingApprovedEmailData): { subject: string; html: string } {
  const subject = `Admin: listing approved — ${data.listingTitle}`;
  const preheader = `A listing was approved.`;
  const origin = tryGetOrigin(data.listingUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Listing approved
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      “${escapeHtml(data.listingTitle)}” was approved.
    </div>
    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.listingUrl, 'View listing')}
    </div>
    <div style="margin: 10px 0 0 0;">
      ${renderSecondaryButton(data.adminQueueUrl, 'Open queue')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAdminListingRejectedEmail(data: AdminListingRejectedEmailData): { subject: string; html: string } {
  const subject = `Admin: listing rejected — ${data.listingTitle}`;
  const preheader = `A listing was rejected.`;
  const origin = tryGetOrigin(data.adminQueueUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Listing rejected
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      “${escapeHtml(data.listingTitle)}” was rejected.
    </div>
    ${data.reason ? `<div style="margin: 0 0 14px 0; padding: 12px 14px; border: 1px solid #E6E1D6; border-radius: 12px; background: #FBFAF7; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;"><strong style="color:#22251F;">Reason:</strong> ${escapeHtml(data.reason)}</div>` : ''}
    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.adminQueueUrl, 'Open queue')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getListingApprovedEmail(data: ListingApprovedEmailData): { subject: string; html: string } {
  const subject = `Your listing is approved — ${data.listingTitle}`;
  const preheader = `Good news: your listing is now live.`;
  const origin = tryGetOrigin(data.listingUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Listing approved
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.userName)} — your listing “${escapeHtml(data.listingTitle)}” was approved and is now live.
    </div>
    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.listingUrl, 'View listing')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getListingRejectedEmail(data: ListingRejectedEmailData): { subject: string; html: string } {
  const subject = `Your listing needs changes — ${data.listingTitle}`;
  const preheader = `Update your listing and resubmit for review.`;
  const origin = tryGetOrigin(data.editUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Listing changes required
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.userName)} — your listing “${escapeHtml(data.listingTitle)}” needs changes before it can be approved.
    </div>
    ${data.reason ? `<div style="margin: 0 0 14px 0; padding: 12px 14px; border: 1px solid #E6E1D6; border-radius: 12px; background: #FBFAF7; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;"><strong style="color:#22251F;">Reason:</strong> ${escapeHtml(data.reason)}</div>` : ''}
    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.editUrl, 'Edit and resubmit')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

// Compliance Transfer Email Templates
export function getOrderTransferComplianceRequiredEmail(
  data: OrderTransferComplianceRequiredEmailData
): { subject: string; html: string } {
  const subject = `TPWD Transfer Compliance Required — ${data.listingTitle}`;
  const preheader = `TPWD transfer permit compliance confirmation required before fulfillment can proceed.`;
  const origin = tryGetOrigin(data.orderUrl);
  const contactUrl = `${origin || 'https://wildlife.exchange'}/contact`;
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      TPWD Transfer Compliance Required
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.recipientName)} — this transaction requires TPWD transfer permit compliance confirmation before fulfillment can proceed.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#FFF4E6; border:1px solid rgba(245,158,11,0.3); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#92400E; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Legal Notice
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#92400E;">
            Wildlife Exchange facilitates transactions between permitted parties. Buyer and seller are solely responsible for complying with all Texas Parks & Wildlife transfer and possession requirements prior to delivery or pickup.
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 16px 0 0 0; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A;">
      <strong>What you need to do:</strong>
      <ul style="margin: 8px 0 0 18px; padding: 0; color:#5B564A;">
        <li>Confirm that the TPWD transfer permit has been completed in compliance with Texas law.</li>
        <li>Optionally upload your TPWD transfer permit document for record-keeping.</li>
        <li>Both buyer and seller must confirm before fulfillment can proceed.</li>
      </ul>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
      <tr>
        <td align="center">
          <a href="${data.orderUrl}" style="display: inline-block; padding: 12px 24px; background: #22251F; color: #F5F5F0; text-decoration: none; border-radius: 8px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 700;">
            Confirm Compliance
          </a>
        </td>
      </tr>
    </table>
  `;
  return renderEmail({ subject, preheader, contentHtml: content, origin });
}

export function getOrderComplianceBuyerConfirmedEmail(
  data: OrderComplianceBuyerConfirmedEmailData
): { subject: string; html: string } {
  const subject = `Buyer Confirmed Compliance — ${data.listingTitle}`;
  const preheader = `The buyer has confirmed TPWD transfer permit compliance.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Buyer Confirmed Compliance
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.recipientName)} — the buyer has confirmed TPWD transfer permit compliance for "${escapeHtml(data.listingTitle)}".
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A; margin: 0 0 16px 0;">
      Once you also confirm compliance, fulfillment will be unlocked and you can proceed with delivery or pickup scheduling.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
      <tr>
        <td align="center">
          <a href="${data.orderUrl}" style="display: inline-block; padding: 12px 24px; background: #22251F; color: #F5F5F0; text-decoration: none; border-radius: 8px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 700;">
            View Order
          </a>
        </td>
      </tr>
    </table>
  `;
  return renderEmail({ subject, preheader, contentHtml: content, origin });
}

export function getOrderComplianceSellerConfirmedEmail(
  data: OrderComplianceSellerConfirmedEmailData
): { subject: string; html: string } {
  const subject = `Seller Confirmed Compliance — ${data.listingTitle}`;
  const preheader = `The seller has confirmed TPWD transfer permit compliance.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Seller Confirmed Compliance
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.recipientName)} — the seller has confirmed TPWD transfer permit compliance for "${escapeHtml(data.listingTitle)}".
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A; margin: 0 0 16px 0;">
      Once you also confirm compliance, fulfillment will be unlocked and the seller can proceed with delivery or pickup scheduling.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
      <tr>
        <td align="center">
          <a href="${data.orderUrl}" style="display: inline-block; padding: 12px 24px; background: #22251F; color: #F5F5F0; text-decoration: none; border-radius: 8px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 700;">
            View Order
          </a>
        </td>
      </tr>
    </table>
  `;
  return renderEmail({ subject, preheader, contentHtml: content, origin });
}

export function getOrderComplianceUnlockedEmail(
  data: OrderComplianceUnlockedEmailData
): { subject: string; html: string } {
  const subject = `Fulfillment Unlocked — ${data.listingTitle}`;
  const preheader = `Both parties confirmed compliance. Fulfillment is now unlocked.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Fulfillment Unlocked
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.recipientName)} — both buyer and seller have confirmed TPWD transfer permit compliance for "${escapeHtml(data.listingTitle)}".
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color:#5B564A; margin: 0 0 16px 0;">
      Fulfillment is now unlocked. The seller can proceed with scheduling delivery or setting pickup information.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
      <tr>
        <td align="center">
          <a href="${data.orderUrl}" style="display: inline-block; padding: 12px 24px; background: #22251F; color: #F5F5F0; text-decoration: none; border-radius: 8px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 700;">
            View Order
          </a>
        </td>
      </tr>
    </table>
  `;
  return renderEmail({ subject, preheader, contentHtml: content, origin });
}

export function getAdminDisputeOpenedEmail(data: AdminDisputeOpenedEmailData): { subject: string; html: string } {
  const subject = `Admin: dispute opened — ${data.orderId}`;
  const preheader = `A dispute was opened and requires review.`;
  const origin = tryGetOrigin(data.adminOpsUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Dispute opened
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.adminName)} — a dispute was opened and requires review.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Dispute
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Order ID:</span> <strong>${escapeHtml(data.orderId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Buyer ID:</span> <strong>${escapeHtml(data.buyerId)}</strong></div>
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Type:</span> <strong>${escapeHtml(data.disputeType)}</strong></div>
            ${data.listingTitle ? `<div style="margin-top: 6px;"><span style="color:#5B564A;">Listing:</span> <strong>${escapeHtml(data.listingTitle)}</strong></div>` : ''}
            <div style="margin-top: 10px;"><span style="color:#5B564A;">Reason:</span> <strong>${escapeHtml(data.reason)}</strong></div>
          </div>
        </td>
      </tr>
    </table>
    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.adminOpsUrl, 'Open admin')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getAdminBreederPermitSubmittedEmail(
  data: AdminBreederPermitSubmittedEmailData
): { subject: string; html: string } {
  const subject = `Admin: breeder permit submitted — ${data.sellerName || data.sellerId}`;
  const preheader = `A new breeder permit document was submitted and needs review.`;
  const origin = tryGetOrigin(data.adminComplianceUrl);

  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Breeder permit submitted
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 14px 0;">
      Hi ${escapeHtml(data.adminName)} — a seller submitted a breeder permit document for review.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#E2D6C2; border:1px solid rgba(34,37,31,0.16); border-radius: 16px;">
      <tr>
        <td style="padding: 14px 14px;">
          <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color:#5B564A; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;">
            Seller
          </div>
          <div style="margin-top: 10px; font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#22251F;">
            <div><span style="color:#5B564A;">Seller:</span> <strong>${escapeHtml(data.sellerName || data.sellerId)}</strong></div>
            ${data.permitNumber ? `<div style="margin-top: 6px;"><span style="color:#5B564A;">Permit #:</span> <strong>${escapeHtml(data.permitNumber)}</strong></div>` : ''}
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Storage path:</span> <strong>${escapeHtml(data.storagePath)}</strong></div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.adminComplianceUrl, 'Open compliance queue')}
    </div>
    ${data.documentUrl ? `<div style="margin: 10px 0 0 0;">${renderSecondaryButton(data.documentUrl, 'View document')}</div>` : ''}
  `;

  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getOrderReceivedEmail(data: OrderReceivedEmailData): { subject: string; html: string } {
  const subject = `Receipt confirmed — ${data.listingTitle}`;
  const preheader = `The buyer confirmed receipt. Your transaction is moving toward payout release.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Receipt confirmed
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.sellerName)} — the buyer confirmed receipt.
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
      ${renderButton(data.orderUrl, 'View order')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getOrderDeliveredEmail(data: OrderDeliveredEmailData): { subject: string; html: string } {
  const subject = `Order delivered — ${data.listingTitle}`;
  const preheader = `The seller marked your order as delivered. Please confirm receipt.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Order delivered
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.buyerName)} — the seller marked your order as delivered. Please confirm receipt or report any issues.
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
      ${renderButton(data.orderUrl, 'Confirm receipt')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}

export function getOrderAcceptedEmail(data: OrderAcceptedEmailData): { subject: string; html: string } {
  const subject = `Order accepted — ${data.listingTitle}`;
  const preheader = `The buyer accepted your order. Funds will be released soon.`;
  const origin = tryGetOrigin(data.orderUrl);
  const content = `
    <div style="font-family: 'BarlettaInline','BarlettaStamp','Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 0.2px; margin: 0 0 6px 0; color:#22251F;">
      Order accepted
    </div>
    <div style="font-family: 'Founders Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color:#5B564A; margin: 0 0 16px 0;">
      Hi ${escapeHtml(data.sellerName)} — the buyer accepted your order. Funds will be released soon.
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
            <div style="margin-top: 6px;"><span style="color:#5B564A;">Amount:</span> <strong>$${Number(data.amount).toLocaleString()}</strong></div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin: 18px 0 0 0;">
      ${renderButton(data.orderUrl, 'View sale')}
    </div>
  `;
  return { subject, html: getEmailTemplate({ title: subject, preheader, contentHtml: content, origin }) };
}
