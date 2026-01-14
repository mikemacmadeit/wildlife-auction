/**
 * Structured JSON Logger
 * 
 * Provides structured logging for critical paths with request tracking.
 * Logs are JSON-formatted for easy parsing by log aggregation services.
 */

interface LogContext {
  requestId?: string;
  route?: string;
  uid?: string;
  orderId?: string;
  listingId?: string;
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  stripeRefundId?: string;
  actionType?: string;
  [key: string]: any;
}

/**
 * Generate or extract request ID from headers
 */
export function getRequestId(headers?: Headers | Record<string, string | string[] | undefined>): string {
  if (!headers) {
    return generateRequestId();
  }

  // Try to get from header
  const headerValue = headers instanceof Headers
    ? headers.get('x-request-id')
    : headers['x-request-id'];

  if (headerValue && typeof headerValue === 'string') {
    return headerValue;
  }

  if (Array.isArray(headerValue) && headerValue[0]) {
    return headerValue[0];
  }

  return generateRequestId();
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Log info message
 */
export function logInfo(message: string, context?: LogContext) {
  const logEntry = {
    ts: new Date().toISOString(),
    level: 'info',
    message,
    ...context,
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Log warning message
 */
export function logWarn(message: string, context?: LogContext) {
  const logEntry = {
    ts: new Date().toISOString(),
    level: 'warn',
    message,
    ...context,
  };
  console.warn(JSON.stringify(logEntry));
}

/**
 * Log error message
 */
export function logError(message: string, error?: Error | unknown, context?: LogContext) {
  const logEntry: any = {
    ts: new Date().toISOString(),
    level: 'error',
    message,
    ...context,
  };

  if (error instanceof Error) {
    logEntry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  } else if (error) {
    logEntry.error = String(error);
  }

  console.error(JSON.stringify(logEntry));
}
