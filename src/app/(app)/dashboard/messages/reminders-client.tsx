"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, CalendarClock, Send, ChevronDown, Info, X } from "lucide-react";
import {
  sendMessage,
  sendAllMessages,
  cancelMessage,
} from "@/features/messaging/actions";
import type {
  ReadyMessage,
  ScheduledReminder,
  ArchiveMessage,
} from "@/features/messaging/actions";

interface RemindersClientProps {
  ready: ReadyMessage[];
  scheduled: ScheduledReminder[];
  archive: ArchiveMessage[];
  messagesSent: number;
  includedLimit: number;
  overageRatePaise: number;
}

function TypeBadge({ type }: { type: "registration" | "receipt" | "appointment" }) {
  const config: Record<string, { className: string; label: string }> = {
    registration: {
      className: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-0",
      label: "Registration",
    },
    receipt: {
      className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0",
      label: "Receipt",
    },
    appointment: {
      className: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-0",
      label: "Appointment",
    },
  };
  const { className, label } = config[type] || config.registration;
  return <Badge className={className}>{label}</Badge>;
}

function StatusBadge({ status }: { status: "sent" | "failed" | "cancelled" | "expired" }) {
  const config = {
    sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0",
    failed: "bg-destructive/15 text-destructive border-0",
    cancelled: "bg-muted text-muted-foreground border-0",
    expired: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0",
  };
  return (
    <Badge className={`${config[status]} capitalize`}>{status}</Badge>
  );
}

export function RemindersClient({
  ready,
  scheduled,
  archive,
  messagesSent,
  includedLimit,
  overageRatePaise,
}: RemindersClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const overageCount = Math.max(0, messagesSent - includedLimit);
  const overageRupees = ((overageCount * overageRatePaise) / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
  const remaining = Math.max(0, includedLimit - messagesSent);
  const isOverage = messagesSent > includedLimit;

  const handleSend = (messageId: string) => {
    startTransition(async () => {
      setErrorMessage(null);
      const result = await sendMessage({ messageId });
      if (!result.success) {
        setErrorMessage(result.error ?? "Failed to send message");
      }
      router.refresh();
    });
  };

  const handleCancel = (messageId: string) => {
    startTransition(async () => {
      setErrorMessage(null);
      const result = await cancelMessage({ messageId });
      if (!result.success) {
        setErrorMessage(result.error ?? "Failed to cancel message");
      }
      router.refresh();
    });
  };

  const handleSendAll = () => {
    startTransition(async () => {
      setErrorMessage(null);
      setConfirmDialogOpen(false);
      const result = await sendAllMessages({
        messageIds: ready.map((m) => m.id),
      });
      if (result.failed > 0) {
        setErrorMessage(
          `${result.failed} message${result.failed !== 1 ? "s" : ""} failed to send.`
        );
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-8 p-6 md:p-10 max-w-[1600px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold text-foreground">WhatsApp Reminders</h1>
        <span
          className={`px-4 py-2 rounded-full text-sm font-medium ${
            isOverage
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {messagesSent} / {includedLimit} messages · ₹{overageRupees} overage
        </span>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive flex items-center justify-between gap-4">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss error"
            className="text-destructive/70 hover:text-destructive shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Two-column grid — widened */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

        {/* Section 1: Ready to Send */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-primary">Ready to Send</h2>
            <Badge variant="secondary">{ready.length}</Badge>
          </div>

          {ready.length > 0 && (
            <Button
              className="w-full"
              onClick={() => setConfirmDialogOpen(true)}
              disabled={isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              Send All ({ready.length})
            </Button>
          )}

          <div className="space-y-3">
            {ready.length === 0 ? (
              <Card className="p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[220px]">
                <Check className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No messages ready to send.</p>
              </Card>
            ) : (
              ready.map((msg) => (
                <Card
                  key={msg.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="flex-1 space-y-2 min-w-0">
                    <p className="font-medium text-foreground truncate">{msg.patientName}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeBadge type={msg.type as "registration" | "receipt" | "appointment"} />
                      <span className="text-sm text-muted-foreground">{msg.phone}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs border-0">
                      {msg.language}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSend(msg.id)}
                      disabled={isPending}
                      className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                    >
                      <Send className="w-3.5 h-3.5 mr-1" />
                      Send
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(msg.id)}
                      disabled={isPending}
                      aria-label={`Cancel message for ${msg.patientName}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Section 2: Scheduled Reminders */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">
              Scheduled Reminders
            </h2>
            <Badge variant="secondary">{scheduled.length}</Badge>
          </div>

          <div className="space-y-3">
            {scheduled.length === 0 ? (
              <Card className="p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[220px]">
                <CalendarClock className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No appointment reminders scheduled.
                </p>
              </Card>
            ) : (
              scheduled.map((reminder) => (
                <Card
                  key={reminder.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="flex-1 space-y-2 min-w-0">
                    <p className="font-medium text-foreground truncate">{reminder.patientName}</p>
                    <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-0">
                      Appointment
                    </Badge>
                    <p className="text-sm text-muted-foreground">{reminder.doctorName}</p>
                    <p className="text-sm text-muted-foreground">
                      {reminder.appointmentDate} · {reminder.appointmentTime}
                    </p>
                  </div>
                  <div className="flex flex-col sm:items-end gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">Sends at 4:30 AM</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(reminder.id)}
                      disabled={isPending}
                      aria-label={`Cancel reminder for ${reminder.patientName}`}
                    >
                      Cancel
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Section 3: Archive */}
      <div className="space-y-4">
        <button
          onClick={() => setArchiveExpanded(!archiveExpanded)}
          className="flex items-center justify-between w-full"
          aria-expanded={archiveExpanded}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-muted-foreground">Archive</h2>
            <Badge variant="secondary">{archive.length}</Badge>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${
              archiveExpanded ? "rotate-180" : ""
            }`}
          />
        </button>

        {archiveExpanded && (
          archive.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">No archived messages yet.</p>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead>Status</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {archive.map((row) => (
                      <TableRow key={row.id} className="border-border hover:bg-muted/30">
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className="font-medium">{row.patientName}</TableCell>
                        <TableCell className="text-muted-foreground">{row.messageType}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(row.timestamp).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )
        )}
      </div>

      {/* Info banner */}
      <div className="bg-muted/50 rounded-lg p-4 flex gap-3 items-start">
        <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Messages reset on the 1st of each month. Overages are billed at ₹1.50 per message.
        </p>
      </div>

      {/* Confirm send all dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Send All</DialogTitle>
            <DialogDescription>
              Send {ready.length} message{ready.length !== 1 ? "s" : ""} to{" "}
              {ready.length} patient{ready.length !== 1 ? "s" : ""}? This will consume{" "}
              {ready.length} of your remaining {remaining} messages.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSendAll} disabled={isPending}>
              {isPending ? "Sending…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}