/**
 * Message Sanitization Utility
 * Prevents contact info and payment method sharing until payment is completed
 */

export interface SanitizeOptions {
  paymentStatus?: 'pending' | 'paid' | 'completed';
  isPaid?: boolean; // Shorthand for paymentStatus === 'paid' || paymentStatus === 'completed'
  allowContact?: boolean; // Override to allow contact even if not paid
}

export interface SanitizeResult {
  sanitizedText: string;
  wasRedacted: boolean;
  detected: {
    phone: boolean;
    email: boolean;
    paymentKeywords: string[];
  };
  violationCount: number;
}

/**
 * Payment method keywords that should be redacted
 */
const PAYMENT_KEYWORDS = [
  'zelle',
  'venmo',
  'cashapp',
  'cash app',
  'wire transfer',
  'wire',
  'ach',
  'paypal',
  'pay pal',
  'text me',
  'call me',
  'email me',
  'dm me',
  'direct message',
  'off platform',
  'off-platform',
  'outside platform',
  'cash',
  'check',
  'money order',
  'western union',
  'moneygram',
  'bitcoin',
  'crypto',
  'cryptocurrency',
  'ethereum',
  'btc',
  'eth',
];

/**
 * Phone number regex patterns
 */
const PHONE_PATTERNS = [
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // 123-456-7890, 123.456.7890, 1234567890
  /\b\(\d{3}\)\s?\d{3}[-.]?\d{4}\b/g, // (123) 456-7890
  /\b\d{10}\b/g, // 10 digits
  /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g, // International
];

/**
 * Email regex pattern
 */
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

/**
 * Sanitize message text to remove contact info and payment methods
 * @param text - Original message text
 * @param options - Sanitization options
 * @returns Sanitized text and detection results
 */
export function sanitizeMessage(text: string, options: SanitizeOptions = {}): SanitizeResult {
  const { paymentStatus, isPaid, allowContact } = options;
  
  // Determine if contact should be allowed
  const allowContactInfo = allowContact || 
    isPaid || 
    paymentStatus === 'paid' || 
    paymentStatus === 'completed';

  let sanitizedText = text;
  const detected = {
    phone: false,
    email: false,
    paymentKeywords: [] as string[],
  };
  let violationCount = 0;

  // Detect and redact phone numbers (if not paid)
  if (!allowContactInfo) {
    for (const pattern of PHONE_PATTERNS) {
      const matches = sanitizedText.match(pattern);
      if (matches && matches.length > 0) {
        detected.phone = true;
        violationCount += matches.length;
        sanitizedText = sanitizedText.replace(pattern, '[REDACTED]');
      }
    }
  }

  // Detect and redact email addresses (if not paid)
  if (!allowContactInfo) {
    const emailMatches = sanitizedText.match(EMAIL_PATTERN);
    if (emailMatches && emailMatches.length > 0) {
      detected.email = true;
      violationCount += emailMatches.length;
      sanitizedText = sanitizedText.replace(EMAIL_PATTERN, '[REDACTED]');
    }
  }

  // Always redact payment method keywords (even after payment)
  const lowerText = sanitizedText.toLowerCase();
  for (const keyword of PAYMENT_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(lowerText)) {
      detected.paymentKeywords.push(keyword);
      violationCount++;
      sanitizedText = sanitizedText.replace(regex, '[REDACTED]');
    }
  }

  const wasRedacted = detected.phone || detected.email || detected.paymentKeywords.length > 0;

  return {
    sanitizedText,
    wasRedacted,
    detected,
    violationCount,
  };
}

/**
 * Check if message contains violations (for flagging)
 */
export function hasViolations(result: SanitizeResult): boolean {
  return result.violationCount > 0;
}

/**
 * Get violation description for user feedback
 */
export function getViolationDescription(result: SanitizeResult): string {
  const parts: string[] = [];
  
  if (result.detected.phone) {
    parts.push('phone number');
  }
  if (result.detected.email) {
    parts.push('email address');
  }
  if (result.detected.paymentKeywords.length > 0) {
    parts.push('payment method');
  }
  
  if (parts.length === 0) {
    return '';
  }
  
  return `Contact details (${parts.join(', ')}) are hidden until payment is completed.`;
}
