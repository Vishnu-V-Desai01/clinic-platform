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
 */
export function getMessageProvider(): MessageProvider {
  if (process.env.MESSAGE_PROVIDER === "msg91") {
    const authKey = process.env.MSG91_AUTH_KEY;
    const integratedNumber = process.env.MSG91_INTEGRATED_NUMBER;
    const namespace = process.env.MSG91_NAMESPACE ?? "";

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