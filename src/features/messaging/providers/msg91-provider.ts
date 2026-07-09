import type { MessageProvider, SendTemplateMessageParams, SendTemplateMessageResult } from "./types";

const MSG91_ENDPOINT =
  "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

interface Msg91Config {
  authKey: string;
  integratedNumber: string;
  /**
   * Meta WABA namespace, shown on the MSG91 template page once at least one
   * template is approved. Leave as empty string until your account is live
   * and you can confirm whether it's required.
   */
  namespace: string;
}

/**
 * Real MSG91 WhatsApp implementation. Payload shape verified against
 * MSG91's documented WhatsApp/OTP curl example and a working third-party
 * integration sample (checked June 2026) — NOT yet tested against a live
 * MSG91 account, since business verification is still pending.
 *
 * Before the first real send, confirm in the MSG91 dashboard:
 *   1. The exact response JSON shape — fix extractMessageId() below if the
 *      real field name differs from the guesses here
 *   2. Whether `namespace` is required for your account or can stay empty
 *   3. The approved template name + language code for each of your 3 templates
 */
export class Msg91MessageProvider implements MessageProvider {
  readonly name = "msg91";

  constructor(private readonly config: Msg91Config) {}

  async sendTemplateMessage(
    params: SendTemplateMessageParams
  ): Promise<SendTemplateMessageResult> {
    const components: Record<string, { type: "text"; value: string }> = {};
    params.bodyParams.forEach((value, index) => {
      components[`body_${index + 1}`] = { type: "text", value };
    });

    const requestBody = {
      integrated_number: this.config.integratedNumber,
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: params.templateName,
          language: {
            code: params.languageCode,
            policy: "deterministic",
          },
          namespace: this.config.namespace,
          to_and_components: [
            {
              to: [params.phone],
              components,
            },
          ],
        },
      },
    };

    console.log("[MSG91] Sending template:", {
      templateName: params.templateName,
      languageCode: params.languageCode,
      bodyParams: params.bodyParams,
      phone: params.phone,
      requestBody: JSON.stringify(requestBody, null, 2),
    });

    try {
      const response = await fetch(MSG91_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authkey: this.config.authKey,
        },
        body: JSON.stringify(requestBody),
      });

      const data: unknown = await response.json().catch(() => null);

      console.log("[MSG91] Response:", {
        status: response.status,
        ok: response.ok,
        data: data,
      });

      if (!response.ok) {
        return {
          success: false,
          errorMessage: extractErrorMessage(data, response.status),
        };
      }

      return {
        success: true,
        providerMessageId: extractMessageId(data),
      };
    } catch (error) {
      return {
        success: false,
        errorMessage:
          error instanceof Error ? error.message : "Unknown MSG91 network error",
      };
    }
  }
}

function extractMessageId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  const candidate = record.requestId ?? record.request_id ?? record.id;
  return typeof candidate === "string" ? candidate : undefined;
}

function extractErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const message = record.message ?? record.error;
    if (typeof message === "string") return message;
  }
  return `MSG91 request failed with status ${status}`;
}