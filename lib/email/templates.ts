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
function getEmailTemplate(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Wildlife Exchange</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    ${content}
  </div>
  <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
    <p>This is an automated message from Wildlife Exchange.</p>
    <p>© ${new Date().getFullYear()} Wildlife Exchange. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();
}

export function getOrderConfirmationEmail(data: OrderConfirmationEmailData): { subject: string; html: string } {
  const subject = `Order Confirmation - ${data.listingTitle}`;
  const content = `
    <h2 style="color: #1f2937; margin-top: 0;">Order Confirmed!</h2>
    <p>Hi ${data.buyerName},</p>
    <p>Your order has been confirmed and payment has been received.</p>
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Order ID:</strong> ${data.orderId}</p>
      <p style="margin: 0 0 10px 0;"><strong>Listing:</strong> ${data.listingTitle}</p>
      <p style="margin: 0 0 10px 0;"><strong>Amount:</strong> $${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      <p style="margin: 0;"><strong>Date:</strong> ${data.orderDate.toLocaleDateString()}</p>
    </div>
    <p>Your funds are being held in escrow until delivery is confirmed. You'll receive another email when the seller marks the order as delivered.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.orderUrl}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Order</a>
    </div>
  `;
  return { subject, html: getEmailTemplate(subject, content) };
}

export function getDeliveryConfirmationEmail(data: DeliveryConfirmationEmailData): { subject: string; html: string } {
  const subject = `Delivery Confirmed - ${data.listingTitle}`;
  const content = `
    <h2 style="color: #1f2937; margin-top: 0;">Delivery Confirmed</h2>
    <p>Hi ${data.buyerName},</p>
    <p>The seller has marked your order as delivered.</p>
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Order ID:</strong> ${data.orderId}</p>
      <p style="margin: 0 0 10px 0;"><strong>Listing:</strong> ${data.listingTitle}</p>
      <p style="margin: 0;"><strong>Delivered:</strong> ${data.deliveryDate.toLocaleDateString()}</p>
    </div>
    <p>Please inspect your order and confirm receipt when you're satisfied. If you have any issues, you can open a dispute within the protection window.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.orderUrl}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Order</a>
    </div>
  `;
  return { subject, html: getEmailTemplate(subject, content) };
}

export function getPayoutNotificationEmail(data: PayoutNotificationEmailData): { subject: string; html: string } {
  const subject = `Payout Released - ${data.listingTitle}`;
  const content = `
    <h2 style="color: #1f2937; margin-top: 0;">Payout Released</h2>
    <p>Hi ${data.sellerName},</p>
    <p>Your payout has been released and should arrive in your account within 2-5 business days.</p>
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Order ID:</strong> ${data.orderId}</p>
      <p style="margin: 0 0 10px 0;"><strong>Listing:</strong> ${data.listingTitle}</p>
      <p style="margin: 0 0 10px 0;"><strong>Amount:</strong> $${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      <p style="margin: 0 0 10px 0;"><strong>Transfer ID:</strong> ${data.transferId}</p>
      <p style="margin: 0;"><strong>Date:</strong> ${data.payoutDate.toLocaleDateString()}</p>
    </div>
    <p>Thank you for using Wildlife Exchange!</p>
  `;
  return { subject, html: getEmailTemplate(subject, content) };
}

export function getAuctionWinnerEmail(data: AuctionWinnerEmailData): { subject: string; html: string } {
  const subject = `You Won the Auction - ${data.listingTitle}`;
  const content = `
    <h2 style="color: #1f2937; margin-top: 0;">Congratulations! You Won!</h2>
    <p>Hi ${data.winnerName},</p>
    <p>You're the winning bidder for this auction!</p>
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Listing:</strong> ${data.listingTitle}</p>
      <p style="margin: 0 0 10px 0;"><strong>Winning Bid:</strong> $${data.winningBid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      <p style="margin: 0;"><strong>Auction Ended:</strong> ${data.auctionEndDate.toLocaleDateString()}</p>
    </div>
    <p>Complete your purchase now to secure this item. Payment must be completed within 48 hours.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.orderUrl}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Complete Purchase</a>
    </div>
  `;
  return { subject, html: getEmailTemplate(subject, content) };
}
