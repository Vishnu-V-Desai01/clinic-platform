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
 * Values are trimmed before comparison/use — env vars set via `vercel env
 * add`'s interactive prompt can occasionally carry trailing whitespace,
 * which breaks the strict `=== "msg91"` check silently (no error, just a
 * quiet fallback to mock). Root-caused during Chat 24C's MSG91 delivery
 * investigation; kept as permanent defensive hardening even though the
 * actual failure that day turned out to be a different cause (stale
 * browser session under Vercel Skew Protection serving an old deployment).
 */
export function getMessageProvider(): MessageProvider {
  const providerValue = process.env.MESSAGE_PROVIDER?.trim();

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