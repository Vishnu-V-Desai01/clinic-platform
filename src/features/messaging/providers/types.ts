/**
 * Provider-agnostic contract for sending a single WhatsApp template message.
 * Every gateway implementation (mock, MSG91, any future provider) implements
 * this same interface, so the rest of the app never needs to know which
 * gateway is active behind the scenes — only MESSAGE_PROVIDER changes.
 *
 * CONTRACT: implementations must never throw. Catch your own network /
 * transport errors internally and return { success: false, errorMessage }
 * instead. This is what makes "degrade gracefully if the provider is down"
 * automatic rather than something every caller has to remember to handle.
 */
export interface SendTemplateMessageParams {
  /** Recipient phone number with country code, digits only (e.g. "919876543210") */
  phone: string;
  /** The exact template name as approved by Meta/the provider — NOT our internal `type` column */
  templateName: string;
  /** Template language code as approved by Meta (e.g. "en", "hi", "ta", "gu", "kn") */
  languageCode: string;
  /** Ordered values filling the template's numbered variables ({{1}}, {{2}}, ...), in order */
  bodyParams: string[];
}

export interface SendTemplateMessageResult {
  success: boolean;
  /** Provider's own message ID, for later delivery-status lookups. Present only on success. */
  providerMessageId?: string;
  /** Human-readable failure reason. Present only on failure. */
  errorMessage?: string;
}

export interface MessageProvider {
  /** Short identifier stored in message_queue.provider for auditing (e.g. "mock", "msg91") */
  readonly name: string;
  sendTemplateMessage(params: SendTemplateMessageParams): Promise<SendTemplateMessageResult>;
}