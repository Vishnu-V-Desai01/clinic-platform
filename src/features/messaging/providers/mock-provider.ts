import type { MessageProvider, SendTemplateMessageParams, SendTemplateMessageResult } from "./types";

/**
 * Default provider until MSG91 is live. Never calls a real network endpoint —
 * it logs what would have been sent and always reports success, so the rest
 * of the messaging feature (queue, clusters, Send / Send All, usage counter)
 * can be built and tested end-to-end with zero external credentials.
 *
 * This is what makes the Meta/MSG91 review delay a non-blocker: every
 * screen, server action, and type can be finished and verified now. The day
 * MSG91 approves the account, only MESSAGE_PROVIDER=msg91 needs setting —
 * no other code changes.
 */
export class MockMessageProvider implements MessageProvider {
  readonly name = "mock";

  async sendTemplateMessage(
    params: SendTemplateMessageParams
  ): Promise<SendTemplateMessageResult> {
    console.log("[MockMessageProvider] Simulated WhatsApp send:", {
      phone: params.phone,
      templateName: params.templateName,
      languageCode: params.languageCode,
      bodyParams: params.bodyParams,
    });

    return {
      success: true,
      providerMessageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}