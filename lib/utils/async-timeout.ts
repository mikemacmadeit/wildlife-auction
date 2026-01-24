/**
 * Utility for adding timeout protection to async operations
 */

export function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number = 10000,
  timeoutMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(timeoutMessage || `Request timed out after ${timeoutMs}ms`)), 
        timeoutMs
      )
    )
  ]);
}

export function withTimeoutAndFallback<T>(
  promise: Promise<T>, 
  fallbackValue: T,
  timeoutMs: number = 5000
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(() => resolve(fallbackValue), timeoutMs)
    )
  ]);
}