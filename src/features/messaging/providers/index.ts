// src/features/messaging/providers/index.ts
import type { MessageProvider } from "./types";
import { MockMessageProvider } from "./mock-provider";
import { Msg91MessageProvider } from "./msg91-provider";

export type {
  MessageProvider,
  SendTemplateMessageParams,
  SendTemplateMessageResult,
} from "./types";

/**
 * Single switch point for the entire app. Defaults to the mock provider
 * until MESSAGE_PROVIDER=msg91 is set in the environment — flip that one
 * variable once MSG91 access is live, no other code changes needed.
 *
 * DIAGNOSTIC (Chat 24C): trimmed comparison added after discovering
 * process.env values set via `vercel env add`'s interactive prompt can
 * carry trailing whitespace/newlines that break strict equality silently
 * — no error, just a quiet fallback to mock. Temporary length-logging
 * added to confirm this before removing it once resolved.
 */
export function getMessageProvider(): MessageProvider {
  const rawProviderValue = process.env.MESSAGE_PROVIDER;
  const providerValue = rawProviderValue?.trim();

  console.log("[getMessageProvider] DIAGNOSTIC:", {
    raw: JSON.stringify(rawProviderValue),
    rawLength: rawProviderValue?.length,
    trimmed: JSON.stringify(providerValue),
  });

  if (providerValue === "msg91") {
    const authKey = process.env.MSG91_AUTH_KEY?.trim();
    const integratedNumber = process.env.MSG91_INTEGRATED_NUMBER?.trim();
    const namespace = process.env.MSG91_NAMESPACE?.trim() ?? "";

    if (!authKey || !integratedNumber) {
      console.error(
        "[getMessageProvider] MESSAGE_PROVIDER=msg91 but MSG91_AUTH_KEY or MSG91_INTEGRATED_NUMBER is missing. Falling back to mock provider."
      );
      return new MockMessageProvider();
    }

    return new Msg91MessageProvider({ authKey, integratedNumber, namespace });
  }

  return new MockMessageProvider();
}