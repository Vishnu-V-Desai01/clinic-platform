import { getMessageClusters, getClinicMessageUsage } from "@/features/messaging/actions";
import { RemindersClient } from "./reminders-client";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const [clusters, usage] = await Promise.all([
    getMessageClusters(),
    getClinicMessageUsage(),
  ]);

  return (
    <RemindersClient
      ready={clusters.ready}
      scheduled={clusters.scheduled}
      archive={clusters.archive}
      messagesSent={usage.messages_sent}
      includedLimit={usage.included_limit}
      overageRatePaise={usage.overage_rate_paise}
    />
  );
}