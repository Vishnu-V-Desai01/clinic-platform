import crypto from 'crypto'

/**
 * Verifies a Razorpay webhook signature.
 *
 * Razorpay sends: X-Razorpay-Signature header
 * We compute HMAC-SHA256(webhook_body, key_secret) and compare.
 * This proves the webhook came from Razorpay, not a spoofed request.
 */
export function verifyRazorpaySignature(
  webhookBody: string,
  razorpaySignature: string,
  keySecret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(webhookBody)
    .digest('hex')

  return expectedSignature === razorpaySignature
}