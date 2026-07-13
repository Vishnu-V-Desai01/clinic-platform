'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Inbox } from 'lucide-react';

export interface AppointmentEfficiencyData {
  totalAppointments: number;
  sameDayBookings: number;
  advanceBookings: number;
  sameDayBookingRate: number; // 0–1
  repeatPatientAppointments: number;
  newPatientAppointments: number;
  repeatPatientRate: number; // 0–1
  cancellationReasons: Array<{ reason: string; count: number }>;
  busiestHours: Array<{ hour: number; label: string; count: number }>;
}

// data is genuinely optional (undefined while loading) — there is
// deliberately NO hardcoded fallback here. A previous version of this
// component defaulted to fake demo numbers when data was falsy, which
// would have silently shown made-up figures on first render and on any
// real period with zero appointments. Undefined and "zero appointments"
// are rendered as distinct, honest states below instead.
export interface AppointmentEfficiencyProps {
  data?: AppointmentEfficiencyData;
}

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <Inbox className="mb-3 h-8 w-8 text-muted-foreground" />
    <p className="text-sm font-medium text-foreground mb-1">No data for this period</p>
    <p className="text-xs text-muted-foreground">Try widening the date range.</p>
  </div>
);

const StatCard = ({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) => (
  <Card className="border border-border bg-card rounded-xl shadow-sm p-5">
    <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
    <p className="text-2xl font-semibold text-foreground">{value}</p>
    {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
  </Card>
);

const SplitBar = ({
  primaryPct,
  primaryLabel,
  secondaryLabel,
}: {
  primaryPct: number; // 0–1
  primaryLabel: string;
  secondaryLabel: string;
}) => {
  const primaryPercent = Math.round(primaryPct * 100);
  const secondaryPercent = 100 - primaryPercent;

  return (
    <div className="mt-4">
      <div className="flex gap-0.5 rounded-full bg-muted/40 overflow-hidden h-2.5">
        <div
          className="bg-[#0E9384] h-full"
          style={{ width: `${primaryPercent}%` }}
          role="img"
          aria-label={`${primaryLabel}: ${primaryPercent}%`}
        />
        <div
          className="bg-muted h-full flex-1"
          role="img"
          aria-label={`${secondaryLabel}: ${secondaryPercent}%`}
        />
      </div>
      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[#0E9384]" />
          <span>
            {primaryLabel} {primaryPercent}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
          <span>
            {secondaryLabel} {secondaryPercent}%
          </span>
        </div>
      </div>
    </div>
  );
};

// Matches the ChartTooltip/CurrencyTooltip pattern already used elsewhere
// in analytics-dashboard.tsx, rather than introducing a third, visually
// inconsistent tooltip style via recharts' contentStyle/formatter props.
const EfficiencyChartTooltip = (props: any) => {
  const { active, payload, label } = props;
  if (active && payload && payload.length) {
    const value = payload[0].value;
    return (
      <div className="bg-card border border-border rounded-md p-2 shadow-md">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xs font-medium" style={{ color: '#0E9384' }}>
          {value} appointment{value === 1 ? '' : 's'}
        </p>
      </div>
    );
  }
  return null;
};

export default function AppointmentEfficiency({ data }: AppointmentEfficiencyProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Appointment Efficiency</h2>

      {/* Stats with Split Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Same-Day Bookings */}
        <div>
          <StatCard
            label="Same-Day Bookings"
            value={data ? `${Math.round(data.sameDayBookingRate * 100)}%` : '—'}
            subtext={
              data ? `${data.sameDayBookings} of ${data.totalAppointments} appointments` : undefined
            }
          />
          {data && data.totalAppointments > 0 && (
            <SplitBar
              primaryPct={data.sameDayBookingRate}
              primaryLabel="Same-day"
              secondaryLabel="Advance-booked"
            />
          )}
        </div>

        {/* Repeat Patients */}
        <div>
          <StatCard
            label="Repeat Patients"
            value={data ? `${Math.round(data.repeatPatientRate * 100)}%` : '—'}
            subtext={
              data
                ? `${data.repeatPatientAppointments} of ${data.totalAppointments} appointments`
                : undefined
            }
          />
          {data && data.totalAppointments > 0 && (
            <SplitBar
              primaryPct={data.repeatPatientRate}
              primaryLabel="Repeat"
              secondaryLabel="New"
            />
          )}
        </div>
      </div>

      {/* Cancellation Reasons & Busiest Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cancellation Reasons */}
        <Card className="border border-border bg-card rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Cancellation Reasons</h3>
          {!data || data.cancellationReasons.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {data.cancellationReasons.slice(0, 8).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{item.reason}</span>
                  <Badge variant="secondary" className="bg-muted text-muted-foreground">
                    {item.count}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Busiest Time of Day */}
        <Card className="border border-border bg-card rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Busiest Time of Day</h3>
          {!data || data.busiestHours.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="text-muted-foreground">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.busiestHours}>
                  <CartesianGrid
                    stroke="currentColor"
                    strokeOpacity={0.1}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="currentColor"
                    strokeOpacity={0.5}
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis
                    stroke="currentColor"
                    strokeOpacity={0.5}
                    style={{ fontSize: '12px' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={<EfficiencyChartTooltip />}
                    cursor={{ fill: 'currentColor', fillOpacity: 0.05 }}
                  />
                  <Bar dataKey="count" fill="#0E9384" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}