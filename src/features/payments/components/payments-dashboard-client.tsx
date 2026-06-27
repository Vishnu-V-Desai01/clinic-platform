// src/features/payments/components/payments-dashboard-client.tsx

'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Download, Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import RecordPaymentDialog from './record-payment-dialog-client';
import NewChargeDialog from './new-charge-dialog-client';
import type {
  PaymentDashboardRow,
  PaymentDashboardMetrics,
  PaymentDashboardByMode,
  ApprovedChargeView,
  PatientPickerItem,
  PaymentDisplayStatus,
} from '../types';

const formatINR = (paise: number): string => {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getStatusBadgeStyles = (status: PaymentDisplayStatus) => {
  const styles: Record<PaymentDisplayStatus, { bg: string; text: string }> = {
    'Pending Approval': {
      bg: 'bg-amber-500/15',
      text: 'text-amber-700 dark:text-amber-400',
    },
    Unpaid: {
      bg: 'bg-muted',
      text: 'text-muted-foreground',
    },
    'Partially Paid': {
      bg: 'bg-sky-500/15',
      text: 'text-sky-700 dark:text-sky-400',
    },
    Paid: {
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-700 dark:text-emerald-400',
    },
    Rejected: {
      bg: 'bg-destructive/15',
      text: 'text-destructive',
    },
    Void: {
      bg: 'bg-destructive/15',
      text: 'text-destructive',
    },
  };
  return styles[status];
};

const initials = (name: string): string => {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

interface PaymentsDashboardClientProps {
  payments: PaymentDashboardRow[];
  metrics: PaymentDashboardMetrics;
  byMode: PaymentDashboardByMode;
  approvedCharges: ApprovedChargeView[];
  patients: PatientPickerItem[];
  userRole: 'doctor' | 'staff' | 'patient';
}

export default function PaymentsDashboardClient({
  payments,
  metrics,
  byMode,
  approvedCharges,
  patients,
  userRole,
}: PaymentsDashboardClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modeFilter, setModeFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [newChargeOpen, setNewChargeOpen] = useState(false);
  const [preselectedChargeId, setPreselectedChargeId] = useState<string | null>(null);
  const itemsPerPage = 10;

  if (userRole === 'patient') {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-background px-4">
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">Access restricted</p>
          <p className="text-sm text-muted-foreground mt-2">
            This page is available to clinic staff and doctors only.
          </p>
        </div>
      </div>
    );
  }

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const matchesSearch =
        payment.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.patientMrn.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'All' || payment.status === statusFilter;

      const matchesMode =
        modeFilter === 'All' ||
        (payment.mode && payment.mode.toLowerCase() === modeFilter.toLowerCase());

      return matchesSearch && matchesStatus && matchesMode;
    });
  }, [payments, searchTerm, statusFilter, modeFilter]);

  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredPayments.slice(start, start + itemsPerPage);
  }, [filteredPayments, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / itemsPerPage));
  const startItem = filteredPayments.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endItem = Math.min(currentPage * itemsPerPage, filteredPayments.length);

  const handleView = (id: string) => {
    router.push(`/dashboard/payments/${id}`);
  };

  const handleCollect = (id: string) => {
    setPreselectedChargeId(id);
    setRecordDialogOpen(true);
  };

  // Direct API route — no storage bucket needed
  const handleDownloadReceipt = (id: string) => {
    window.open('/api/payments/' + id + '/receipt', '_blank');
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Payments</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Collections and reconciliation
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setNewChargeOpen(true)}
              variant="outline"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Charge
            </Button>
            <Button
              onClick={() => {
                setPreselectedChargeId(null);
                setRecordDialogOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              Record Payment
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted rounded-lg p-4 border border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Total Collected
            </p>
            <p className="text-2xl font-bold text-foreground mt-2">
              {formatINR(metrics.totalCollectedPaise)}
            </p>
          </div>
          <div className="bg-muted rounded-lg p-4 border border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Outstanding
            </p>
            <p className="text-2xl font-bold text-foreground mt-2">
              {formatINR(metrics.outstandingPaise)}
            </p>
          </div>
          <div className="bg-muted rounded-lg p-4 border border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Pending Approval
            </p>
            <p className="text-2xl font-bold text-foreground mt-2">
              {formatINR(metrics.pendingApprovalPaise)}
            </p>
          </div>
          <div className="bg-muted rounded-lg p-4 border border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Collected Today
            </p>
            <p className="text-2xl font-bold text-foreground mt-2">
              {formatINR(metrics.collectedTodayPaise)}
            </p>
          </div>
        </div>

        <Card className="bg-card border border-border rounded-xl shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-foreground mb-4">
              Collections by mode
            </p>
            <div className="flex flex-wrap gap-6">
              <div className="border-r border-border pr-6">
                <p className="text-xs text-muted-foreground mb-1">Cash</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatINR(byMode.cashPaise)}
                </p>
              </div>
              <div className="border-r border-border pr-6">
                <p className="text-xs text-muted-foreground mb-1">Card</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatINR(byMode.cardPaise)}
                </p>
              </div>
              <div className="border-r border-border pr-6">
                <p className="text-xs text-muted-foreground mb-1">UPI</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatINR(byMode.upiPaise)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Bank</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatINR(byMode.bankPaise)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient or MRN"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Pending Approval">Pending Approval</SelectItem>
              <SelectItem value="Unpaid">Unpaid</SelectItem>
              <SelectItem value="Partially Paid">Partially Paid</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
              <SelectItem value="Void">Void</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={modeFilter}
            onValueChange={(value) => {
              setModeFilter(value);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="Card">Card</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
              <SelectItem value="Cheque">Cheque</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {filteredPayments.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border">
                      <TableHead className="text-foreground font-semibold">Patient</TableHead>
                      <TableHead className="text-foreground font-semibold">Service / Date</TableHead>
                      <TableHead className="text-foreground font-semibold text-right">Amount</TableHead>
                      <TableHead className="text-foreground font-semibold text-right">Paid</TableHead>
                      <TableHead className="text-foreground font-semibold text-right">Outstanding</TableHead>
                      <TableHead className="text-foreground font-semibold">Mode</TableHead>
                      <TableHead className="text-foreground font-semibold">Status</TableHead>
                      <TableHead className="text-foreground font-semibold text-center">Receipt</TableHead>
                      <TableHead className="text-foreground font-semibold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPayments.map((payment) => {
                      const statusStyle = getStatusBadgeStyles(payment.status);
                      const showCollect =
                        payment.status === 'Unpaid' || payment.status === 'Partially Paid';

                      return (
                        <TableRow
                          key={payment.id}
                          className="border-b border-border hover:bg-muted/50"
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback>{initials(payment.patientName)}</AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col">
                                <p className="text-sm font-medium text-foreground">
                                  {payment.patientName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {payment.patientMrn}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <p className="text-sm text-foreground">{payment.service}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(payment.date).toLocaleDateString('en-IN')}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium text-foreground">
                            {formatINR(payment.amountPaise)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium text-foreground">
                            {formatINR(payment.paidPaise)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium text-foreground">
                            {formatINR(payment.outstandingPaise)}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-foreground">{payment.mode || '—'}</p>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`${statusStyle.bg} ${statusStyle.text} border-0`}
                              variant="secondary"
                            >
                              {payment.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {payment.hasReceipt ? (
                              <button
                                onClick={() => handleDownloadReceipt(payment.id)}
                                className="inline-flex items-center justify-center p-1 rounded hover:bg-muted text-foreground"
                                aria-label="Download receipt"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleView(payment.id)}
                                className="text-primary hover:text-primary hover:bg-transparent"
                              >
                                View
                              </Button>
                              {showCollect && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCollect(payment.id)}
                                  className="text-primary hover:text-primary hover:bg-transparent"
                                >
                                  Collect
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  Showing {startItem}–{endItem} of {filteredPayments.length}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center">
              <p className="text-muted-foreground mb-2">No payments found</p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your filters or search criteria
              </p>
            </div>
          )}
        </Card>
      </div>

      <RecordPaymentDialog
        open={recordDialogOpen}
        onOpenChange={setRecordDialogOpen}
        approvedCharges={approvedCharges}
        defaultChargeId={preselectedChargeId}
      />

      <NewChargeDialog
        open={newChargeOpen}
        onOpenChange={setNewChargeOpen}
        patients={patients}
      />
    </div>
  );
}