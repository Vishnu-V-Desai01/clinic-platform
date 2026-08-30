'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MailPlus, Inbox, UserPlus, X, Percent } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import ModeSwitchButton from '@/components/mode-switch-button';

interface Kpis {
  totalRevenuePaise: number;
  totalPatients: number;
  appointmentsToday: number;
  activeStaff: number;
}

interface ActivityPoint {
  date: string;
  appointments: number;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: 'doctor' | 'staff';
  staffType?: string | null;
  sentAt: string;
}

// Objective 9 — a medicine bill that was discounted below its computed
// subtotal. dispensedByName is whoever performed the dispense/discount
// (payments.approved_by); doctorName is the prescribing doctor
// (payments.doctor_id) — kept distinct since they're commonly different
// people (a pharmacist dispensing a doctor's prescription).
interface DiscountedMedicineBill {
  id: string;
  patientName: string;
  doctorName: string;
  dispensedByName: string;
  originalAmountPaise: number;
  finalAmountPaise: number;
  discountAmountPaise: number;
  createdAt: string;
}

interface AdminDashboardProps {
  kpis?: Kpis;
  activitySeries?: ActivityPoint[];
  pendingInvitations?: PendingInvitation[];
  hasTeamMembers?: boolean;
  discountedMedicineBills?: DiscountedMedicineBill[];
  onInviteUser?: () => void;
  onRevoke?: (invitationId: string) => void;
  onSwitchToDoctor?: () => void;
}

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatChartDate(isoDate: string): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);
}

function formatInvitationDate(isoDate: string): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function formatShortDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

// Only called when no real data is passed — e.g. isolated component
// preview. Never runs during normal wired usage.
function generateSampleData() {
  const kpis: Kpis = {
    totalRevenuePaise: 48250000,
    totalPatients: 1284,
    appointmentsToday: 37,
    activeStaff: 11,
  };

  const today = new Date();
  const activitySeries: ActivityPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayOfWeek = date.getDay();
    const baseAppointments = dayOfWeek === 0 || dayOfWeek === 6 ? 15 : 28;
    const variation = Math.floor(Math.random() * 15) - 7;
    activitySeries.push({
      date: date.toISOString().split('T')[0],
      appointments: Math.max(5, baseAppointments + variation),
    });
  }

  const pendingInvitations: PendingInvitation[] = [
    { id: 'inv1', email: 'nachar.doctor@gmail.com', role: 'doctor', staffType: null, sentAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 'inv2', email: 'misky.staff@gmail.com', role: 'staff', staffType: 'receptionist', sentAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 'inv3', email: 'rannel.staff@gmail.com', role: 'staff', staffType: 'nurse', sentAt: new Date(Date.now() - 86400000).toISOString() },
  ];

  return { kpis, activitySeries, pendingInvitations };
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border bg-card rounded-xl shadow-sm p-5">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function CustomChartTooltip({ active, payload }: any) {
  if (active && payload && payload[0]) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-md">
        <p className="text-sm font-medium text-foreground">{payload[0].value} appointments</p>
      </div>
    );
  }
  return null;
}

function ClinicActivityChart({ activitySeries }: { activitySeries: ActivityPoint[] }) {
  if (!activitySeries || activitySeries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Inbox className="w-12 h-12 mb-3" aria-hidden="true" />
        <p className="text-sm">No data for this period</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={activitySeries}>
        <CartesianGrid stroke="currentColor" strokeOpacity={0.1} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={formatChartDate} tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.7 }} stroke="currentColor" strokeOpacity={0.5} />
        <YAxis tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.7 }} stroke="currentColor" strokeOpacity={0.5} />
        <Tooltip content={<CustomChartTooltip />} />
        <Bar dataKey="appointments" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PendingInvitationsSection({
  pendingInvitations,
  onRevoke,
  onInviteUser,
  hasTeamMembers,
}: {
  pendingInvitations?: PendingInvitation[];
  onRevoke?: (invitationId: string) => void;
  onInviteUser?: () => void;
  hasTeamMembers?: boolean;
}) {
  if (!hasTeamMembers && (!pendingInvitations || pendingInvitations.length === 0)) {
    return (
      <div className="border border-border bg-card rounded-xl shadow-sm p-5 flex flex-col items-center justify-center py-12">
        <UserPlus className="w-12 h-12 mb-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Invite your first staff member</h3>
        <p className="text-sm text-muted-foreground mb-6 text-center">Add a receptionist, nurse, or another doctor to your clinic.</p>
        <Button onClick={onInviteUser}>
          <MailPlus className="w-4 h-4 mr-2" aria-hidden="true" />
          Invite staff or doctor
        </Button>
      </div>
    );
  }

  return (
    <div className="border border-border bg-card rounded-xl shadow-sm p-5">
      <h2 className="text-lg font-semibold text-foreground mb-4">Pending Invitations</h2>
      {!pendingInvitations || pendingInvitations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Inbox className="w-10 h-10 mb-2" aria-hidden="true" />
          <p className="text-sm">No pending invitations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingInvitations.map((invitation) => (
            <div key={invitation.id} className="border border-border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{invitation.email}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge
                    variant="default"
                    className={
                      invitation.role === 'doctor'
                        ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
                        : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
                    }
                  >
                    {invitation.role}
                  </Badge>
                  {invitation.staffType && <Badge variant="secondary">{invitation.staffType}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Sent {formatInvitationDate(invitation.sentAt)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onRevoke?.(invitation.id)} className="shrink-0">
                <X className="w-4 h-4 mr-1" aria-hidden="true" />
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Objective 9 — mirrors PendingInvitationsSection's structure (bordered
// card, header + list/empty-state), so it fits the existing visual language
// rather than introducing a new pattern. Only rendered at all when there's
// at least one discounted bill — an empty card here would be noise, unlike
// the invitations card which has a deliberate "invite your first" CTA.
function DiscountedMedicineBillsSection({ bills }: { bills: DiscountedMedicineBill[] }) {
  if (bills.length === 0) return null;

  return (
    <div className="border border-border bg-card rounded-xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Percent className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-foreground">Discounted Medicine Bills</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Recent medicine bills where the charged amount was reduced from the computed price.
      </p>
      <div className="space-y-3">
        {bills.map((bill) => (
          <div key={bill.id} className="border border-border rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{bill.patientName}</p>
                <p className="text-xs text-muted-foreground">
                  Prescribed by {bill.doctorName} · Dispensed by {bill.dispensedByName}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{formatShortDateTime(bill.createdAt)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm text-muted-foreground line-through">{formatINR(bill.originalAmountPaise)}</p>
                <p className="text-sm font-semibold text-foreground">{formatINR(bill.finalAmountPaise)}</p>
                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 mt-1">
                  -{formatINR(bill.discountAmountPaise)}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard({
  kpis,
  activitySeries,
  pendingInvitations,
  hasTeamMembers = true,
  discountedMedicineBills = [],
  onInviteUser,
  onRevoke,
  onSwitchToDoctor,
}: AdminDashboardProps) {
  const sampleData = !kpis || !activitySeries || !pendingInvitations ? generateSampleData() : null;
  const displayKpis = kpis ?? sampleData!.kpis;
  const displayActivitySeries = activitySeries ?? sampleData!.activitySeries;
  const displayPendingInvitations = pendingInvitations ?? sampleData!.pendingInvitations;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <Button onClick={onInviteUser}>
          <MailPlus className="w-4 h-4 mr-2" aria-hidden="true" />
          Invite staff or doctor
        </Button>
      </div>

      <ModeSwitchButton
        currentMode="admin"
        role="doctor"
        isClinicAdmin
        size="page"
        onSwitch={() => onSwitchToDoctor?.()}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue (This Month)" value={formatINR(displayKpis.totalRevenuePaise)} />
        <StatCard label="Total Patients" value={displayKpis.totalPatients.toLocaleString('en-IN')} />
        <StatCard label="Appointments Today" value={displayKpis.appointmentsToday} />
        <StatCard label="Active Staff" value={displayKpis.activeStaff} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-border bg-card rounded-xl shadow-sm p-5 text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground mb-1">Clinic Activity</h2>
          <p className="text-sm text-muted-foreground mb-4">Appointment volume per day, last 30 days</p>
          <ClinicActivityChart activitySeries={displayActivitySeries} />
        </div>

        <div className="lg:col-span-1">
          <PendingInvitationsSection
            pendingInvitations={displayPendingInvitations}
            onRevoke={onRevoke}
            onInviteUser={onInviteUser}
            hasTeamMembers={hasTeamMembers}
          />
        </div>
      </div>

      <DiscountedMedicineBillsSection bills={discountedMedicineBills} />
    </div>
  );
}