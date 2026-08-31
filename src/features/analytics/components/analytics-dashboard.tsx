// src/features/analytics/components/analytics-dashboard.tsx

'use client';

import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Inbox,
  Wallet,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  Users,
  CalendarClock,
  XCircle,
  UserPlus,
} from 'lucide-react';
import type { AnomalyMetricName, AnomalyDirection, AnomalySeverity } from '../types';
import AppointmentEfficiency, {
  type AppointmentEfficiencyData,
} from './appointment-efficiency';

// ============================================================================
// Types
// ============================================================================

interface Anomaly {
  id: string;
  metricName: AnomalyMetricName;
  direction: AnomalyDirection;
  actualValue: number;
  rollingMean: number;
  severity: AnomalySeverity;
  message?: string;
}

interface Income {
  revenuePaise: number;
  averageConsultationFeePaise: number;
  approvedAmountPaise: number;
  pendingApprovalAmountPaise: number;
  outstandingBalancePaise: number;
}

interface RevenuePoint {
  date: string; // ISO
  revenuePaise: number;
}

interface Activity {
  patientsSeen: number;
  appointmentsTotal: number;
  cancellationRate: number; // 0–1
  newRegistrations: number;
}

interface AppointmentsPoint {
  date: string; // ISO
  completed: number;
  cancelled: number;
  noShow: number;
}

interface RegistrationsPoint {
  date: string; // ISO
  count: number;
}

interface BusiestDay {
  day: string;
  count: number;
}

interface AnalyticsDashboardProps {
  anomalies?: Anomaly[];
  income?: Income;
  revenueSeries?: RevenuePoint[];
  activity?: Activity;
  appointmentsSeries?: AppointmentsPoint[];
  registrationsSeries?: RegistrationsPoint[];
  busiestDays?: BusiestDay[];
  appointmentEfficiency?: AppointmentEfficiencyData;
  onRangeChange?: (range: { preset: string; start?: string; end?: string }) => void;
  onRunRollup?: () => void;
  isRollupPending?: boolean;
  rollupMessage?: string | null;
}

// ============================================================================
// Utilities
// ============================================================================

const formatINR = (paise: number): string => {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatChartDate = (isoDate: string): string => {
  try {
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
      new Date(isoDate)
    );
  } catch {
    return isoDate;
  }
};

const formatCompactINR = (paise: number): string => {
  const rupees = paise / 100;
  if (rupees >= 100000) {
    return `₹${(rupees / 100000).toFixed(1)}L`;
  }
  if (rupees >= 1000) {
    return `₹${(rupees / 1000).toFixed(1)}K`;
  }
  return formatINR(paise);
};

// ============================================================================
// Anomaly Banner Component
// ============================================================================

const METRIC_LABELS: Record<AnomalyMetricName, string> = {
  appointments_total: 'Appointments today',
  appointments_cancelled: 'Cancellations today',
  appointments_no_show: 'No-shows today',
  revenue_collected: 'Revenue collected today',
};

const GOOD_DIRECTION: Record<AnomalyMetricName, AnomalyDirection> = {
  appointments_total: 'high', // busier day = more patients seen
  appointments_cancelled: 'low',
  appointments_no_show: 'low',
  revenue_collected: 'high',
};

type TipKey = `${AnomalyMetricName}_${AnomalyDirection}`;

const TIPS: Partial<Record<TipKey, string>> = {
  appointments_no_show_high: ' Consider confirming tomorrow’s appointments by phone.',
  appointments_no_show_low: ' Nice work keeping no-shows down.',
  revenue_collected_low: ' Check for pending approvals or uncollected payments.',
  revenue_collected_high: ' A strong collections day.',
  appointments_total_high: ' A busier day than usual.',
  appointments_cancelled_high: ' Worth keeping an eye on recent cancellations.',
  appointments_cancelled_low: ' Fewer cancellations than usual.',
};

function formatAnomalyValue(metricName: AnomalyMetricName, value: number): string {
  if (metricName === 'revenue_collected') {
    return formatINR(Math.round(value * 100));
  }
  return value.toLocaleString('en-IN');
}

function computePercentChange(actual: number, mean: number): number | null {
  if (mean === 0) return null;
  return ((actual - mean) / mean) * 100;
}

function buildAnomalyMessage(anomaly: Anomaly): string {
  if (anomaly.message) return anomaly.message;

  const label = METRIC_LABELS[anomaly.metricName] ?? 'Metric';
  const directionWord = anomaly.direction === 'high' ? 'high' : 'low';
  const verb = anomaly.direction === 'high' ? 'are' : 'is';
  const actual = formatAnomalyValue(anomaly.metricName, anomaly.actualValue);
  const mean = formatAnomalyValue(anomaly.metricName, anomaly.rollingMean);

  const pct = computePercentChange(anomaly.actualValue, anomaly.rollingMean);
  const pctText =
    pct !== null
      ? ` (${Math.abs(pct).toFixed(0)}% ${pct >= 0 ? 'above' : 'below'} average)`
      : '';

  const tip = TIPS[`${anomaly.metricName}_${anomaly.direction}` as TipKey] ?? '';

  return `${label} ${verb} unusually ${directionWord}${pctText} — ${actual} vs. a recent average of ${mean}.${tip}`;
}

const AnomalyBanner: React.FC<{ anomaly: Anomaly }> = ({ anomaly }) => {
  const message = buildAnomalyMessage(anomaly);
  const isGood = GOOD_DIRECTION[anomaly.metricName] === anomaly.direction;
  const isCritical = anomaly.severity === 'critical';

  const bg = isGood
    ? isCritical
      ? 'var(--status-success-bg-strong)'
      : 'var(--status-success-bg)'
    : isCritical
      ? 'var(--status-warning-bg-strong)'
      : 'var(--status-warning-bg)';

  const text = isGood ? 'var(--status-success-text)' : 'var(--status-warning-text)';

  const IconComponent = isGood ? TrendingUp : AlertTriangle;

  return (
    <div
      className="flex items-start gap-3 rounded-lg p-4 border"
      style={{ background: bg, borderColor: text, color: text }}
    >
      <IconComponent className="h-5 w-5 flex-shrink-0" style={{ color: text }} />
      <p className="text-sm leading-relaxed" style={{ color: text }}>{message}</p>
    </div>
  );
};

// ============================================================================
// Stat Card Component
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accentColor?: 'amber' | 'none';
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, accentColor = 'none' }) => {
  const accentClass =
    accentColor === 'amber'
      ? 'border-l-4 border-l-amber-500 pl-4'
      : '';
  const iconChipClass =
    accentColor === 'amber' ? 'curakin-stat-icon-amber' : 'curakin-stat-icon';

  return (
    <Card className={`curakin-stat-card rounded-xl p-5 transition-shadow hover:shadow-md ${accentClass}`}>
      <div className="mb-2 flex items-center gap-2">
        <div className={iconChipClass}>{icon}</div>
        <p className="curakin-caption">{label}</p>
      </div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </Card>
  );
};

// ============================================================================
// Empty State Component
// ============================================================================

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12 px-4">
    <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
    <p className="text-sm font-medium text-foreground mb-1">No data for this period</p>
    <p className="text-xs text-muted-foreground">Try widening the date range.</p>
  </div>
);

// ============================================================================
// Custom Tooltip for Charts
// ============================================================================

const ChartTooltip = (props: any) => {
  const { active, payload, label } = props;
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-md p-2 shadow-md">
        <p className="text-xs text-muted-foreground">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-xs font-medium" style={{ color: entry.color }}>
            {entry.name}: {Number(entry.value).toLocaleString('en-IN')}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const CurrencyTooltip = (props: any) => {
  const { active, payload, label } = props;
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-md p-2 shadow-md">
        <p className="text-xs text-muted-foreground">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-xs font-medium" style={{ color: entry.color }}>
            {entry.name}: {formatINR(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ============================================================================
// Main Component
// ============================================================================

export default function AnalyticsDashboard({
  anomalies = [],
  income,
  revenueSeries = [],
  activity,
  appointmentsSeries = [],
  registrationsSeries = [],
  busiestDays = [],
  appointmentEfficiency,
  onRangeChange,
  onRunRollup,
  isRollupPending = false,
  rollupMessage = null,
}: AnalyticsDashboardProps) {
  const [dateRange, setDateRange] = useState('This Month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const handleRangeChange = (preset: string) => {
    setDateRange(preset);
    if (preset !== 'Custom') {
      setCustomStart('');
      setCustomEnd('');
      onRangeChange?.({ preset });
    }
  };

  const handleCustomRangeChange = () => {
    if (customStart && customEnd) {
      onRangeChange?.({
        preset: 'Custom',
        start: customStart,
        end: customEnd,
      });
    }
  };

  const hasRevenueData = revenueSeries.length > 0;
  const hasActivityData =
    (appointmentsSeries.length > 0 || registrationsSeries.length > 0 || busiestDays.length > 0);

  const appointmentsChartData = appointmentsSeries.map((p) => ({
    date: formatChartDate(p.date),
    completed: p.completed,
    cancelled: p.cancelled,
    noShow: p.noShow,
  }));

  const revenueChartData = revenueSeries.map((p) => ({
    date: formatChartDate(p.date),
    revenue: p.revenuePaise,
  }));

  const registrationsChartData = registrationsSeries.map((p) => ({
    date: formatChartDate(p.date),
    registrations: p.count,
  }));

  const revenueCardLabel =
    dateRange === 'Custom' && customStart && customEnd
      ? `Revenue (${formatChartDate(customStart)} – ${formatChartDate(customEnd)})`
      : `Revenue (${dateRange})`;

  return (
    <div className="curakin-preview min-h-screen bg-[var(--preview-background)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="curakin-h1">Analytics Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Your practice at a glance</p>
          </div>
          {onRunRollup && (
            <div className="flex flex-col items-end gap-1">
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 rounded-lg shrink-0"
                onClick={onRunRollup}
                disabled={isRollupPending}
                aria-label="Run daily rollup"
                title="Run daily rollup"
              >
                <RefreshCw className={`h-4 w-4 ${isRollupPending ? 'animate-spin' : ''}`} />
              </Button>
              {rollupMessage && (
                <p className="text-xs text-muted-foreground max-w-[220px] text-right">
                  {rollupMessage}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Filter Bar */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {['Today', 'This Week', 'This Month', 'Last 30 Days', 'Last 90 Days', 'Custom'].map(
            (preset) => (
              <Button
                key={preset}
                variant={dateRange === preset ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleRangeChange(preset)}
                className="text-xs"
              >
                {preset}
              </Button>
            )
          )}
        </div>

        {/* Custom Date Inputs (shown when Custom is selected) */}
        {dateRange === 'Custom' && (
          <div className="mb-6 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Start Date</label>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-32"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">End Date</label>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-32"
              />
            </div>
            <Button size="sm" onClick={handleCustomRangeChange} className="text-xs">
              Apply
            </Button>
          </div>
        )}

        {/* Anomaly Banners */}
        {anomalies.length > 0 && (
          <div className="mb-8 space-y-3">
            {anomalies.map((anomaly) => (
              <AnomalyBanner key={anomaly.id} anomaly={anomaly} />
            ))}
          </div>
        )}

        {/* Income Section */}
        <div className="mb-8">
          <h2 className="curakin-h2 mb-4">Income</h2>

          {/* Income Stat Cards */}
          <div className="mb-6 grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-5">
            <StatCard
              label={revenueCardLabel}
              value={income ? formatINR(income.revenuePaise) : '—'}
              icon={<Wallet className="size-4" aria-hidden="true" />}
            />
            <StatCard
              label="Average consultation fee"
              value={income ? formatINR(income.averageConsultationFeePaise) : '—'}
              icon={<Receipt className="size-4" aria-hidden="true" />}
            />
            <StatCard
              label="Approved"
              value={income ? formatINR(income.approvedAmountPaise) : '—'}
              icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
            />
            <StatCard
              label="Pending Approval"
              value={income ? formatINR(income.pendingApprovalAmountPaise) : '—'}
              icon={<Clock className="size-4" aria-hidden="true" />}
            />
            <StatCard
              label="Outstanding Balance"
              value={income ? formatINR(income.outstandingBalancePaise) : '—'}
              icon={<AlertCircle className="size-4" aria-hidden="true" />}
              accentColor={income && income.outstandingBalancePaise > 0 ? 'amber' : 'none'}
            />
          </div>

          {/* Revenue Chart */}
          {hasRevenueData ? (
            <Card className="curakin-card-flat rounded-xl p-5">
              <h3 className="curakin-h3 mb-4">Revenue over time</h3>
              <div className="text-muted-foreground">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'currentColor', fontSize: 12 }}
                      stroke="currentColor"
                      opacity={0.5}
                    />
                    <YAxis
                      tick={(props: any) => {
                        const { x, y, payload } = props;
                        return (
                          <text x={x} y={y} textAnchor="end" fontSize={12} fill="currentColor">
                            {formatCompactINR(payload.value)}
                          </text>
                        );
                      }}
                      stroke="currentColor"
                      opacity={0.5}
                    />
                    <Tooltip content={<CurrencyTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#0E9384"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={true}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : (
            <Card className="curakin-card-flat rounded-xl p-5">
              <h3 className="curakin-h3 mb-4">Revenue over time</h3>
              <EmptyState />
            </Card>
          )}
        </div>

        {/* Activity Section */}
        <div className="mb-8">
          <h2 className="curakin-h2 mb-4">Activity</h2>

          {/* Activity Stat Cards */}
          <div className="mb-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Patients Seen"
              value={activity ? activity.patientsSeen : '—'}
              icon={<Users className="size-4" aria-hidden="true" />}
            />
            <StatCard
              label="Appointments"
              value={activity ? activity.appointmentsTotal : '—'}
              icon={<CalendarClock className="size-4" aria-hidden="true" />}
            />
            <StatCard
              label="Cancellation / No-Show Rate"
              value={
                activity
                  ? `${Math.round(activity.cancellationRate * 100)}%`
                  : '—'
              }
              icon={<XCircle className="size-4" aria-hidden="true" />}
            />
            <StatCard
              label="New Registrations"
              value={activity ? activity.newRegistrations : '—'}
              icon={<UserPlus className="size-4" aria-hidden="true" />}
            />
          </div>

          {/* Activity Charts */}
          {hasActivityData ? (
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
              {/* Appointments Chart */}
              <Card className="curakin-card-flat rounded-xl p-5 lg:col-span-1">
                <h3 className="curakin-h3 mb-4">Appointments over time</h3>
                {appointmentsChartData.length > 0 ? (
                  <div className="text-muted-foreground">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={appointmentsChartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="currentColor"
                          opacity={0.1}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: 'currentColor', fontSize: 11 }}
                          stroke="currentColor"
                          opacity={0.5}
                        />
                        <YAxis
                          tick={{ fill: 'currentColor', fontSize: 11 }}
                          stroke="currentColor"
                          opacity={0.5}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          wrapperStyle={{
                            paddingTop: '1rem',
                            fontSize: '12px',
                            color: 'currentColor',
                          }}
                        />
                        <Bar dataKey="completed" stackId="a" fill="#10b981" />
                        <Bar dataKey="cancelled" stackId="a" fill="#ef4444" />
                        <Bar dataKey="noShow" stackId="a" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState />
                )}
              </Card>

              {/* Registrations Chart */}
              <Card className="curakin-card-flat rounded-xl p-5 lg:col-span-1">
                <h3 className="curakin-h3 mb-4">
                  New registrations over time
                </h3>
                {registrationsChartData.length > 0 ? (
                  <div className="text-muted-foreground">
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={registrationsChartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="currentColor"
                          opacity={0.1}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: 'currentColor', fontSize: 11 }}
                          stroke="currentColor"
                          opacity={0.5}
                        />
                        <YAxis
                          tick={{ fill: 'currentColor', fontSize: 11 }}
                          stroke="currentColor"
                          opacity={0.5}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="registrations"
                          stroke="#0E9384"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState />
                )}
              </Card>

              {/* Busiest Days Chart */}
              <Card className="curakin-card-flat rounded-xl p-5 lg:col-span-1">
                <h3 className="curakin-h3 mb-4">Busiest days</h3>
                {busiestDays.length > 0 ? (
                  <div className="text-muted-foreground">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={busiestDays}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="currentColor"
                          opacity={0.1}
                        />
                        <XAxis
                          dataKey="day"
                          tick={{ fill: 'currentColor', fontSize: 11 }}
                          stroke="currentColor"
                          opacity={0.5}
                        />
                        <YAxis
                          tick={{ fill: 'currentColor', fontSize: 11 }}
                          stroke="currentColor"
                          opacity={0.5}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="count" fill="#0E9384" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState />
                )}
              </Card>
            </div>
          ) : (
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="curakin-card-flat rounded-xl p-5">
                  <EmptyState />
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Appointment Efficiency Section (Chat 14, Step 2) */}
        <AppointmentEfficiency data={appointmentEfficiency} />
      </div>
    </div>
  );
}