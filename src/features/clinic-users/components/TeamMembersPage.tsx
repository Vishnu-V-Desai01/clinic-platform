'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MailPlus, MoreHorizontal } from 'lucide-react';
import ModeSwitchButton from '@/components/mode-switch-button';

interface TeamMember {
  id: string;
  name: string;
  role: 'doctor' | 'staff';
  staffType?: 'receptionist' | 'nurse' | 'assistant' | 'pharmacist' | null;
  status: 'active' | 'suspended' | 'removed';
  lastActive: string | null;
}

interface InviteValues {
  email: string;
  role: 'doctor' | 'staff';
  staffType?: string | null;
}

interface TeamMembersPageProps {
  members?: TeamMember[];
  isLoading?: boolean;
  onInvite?: (values: InviteValues) => void;
  onSuspend?: (id: string) => void;
  onReactivate?: (id: string) => void;
  onRemove?: (id: string) => void;
  onSwitchToDoctor?: () => void;
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';

  const date = new Date(isoString);
  const now = new Date();
  const secondsElapsed = Math.floor((now.getTime() - date.getTime()) / 1000);

  const units: Array<{ name: Intl.RelativeTimeFormatUnit; seconds: number }> = [
    { name: 'year', seconds: 31536000 },
    { name: 'month', seconds: 2592000 },
    { name: 'week', seconds: 604800 },
    { name: 'day', seconds: 86400 },
    { name: 'hour', seconds: 3600 },
    { name: 'minute', seconds: 60 },
  ];

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  for (const { name, seconds } of units) {
    if (secondsElapsed >= seconds) {
      const value = Math.floor(secondsElapsed / seconds);
      return rtf.format(-value, name);
    }
  }

  return 'just now';
}

function InviteDialog({
  open,
  onOpenChange,
  onInvite,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (values: InviteValues) => void;
  isLoading?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'doctor' | 'staff'>('doctor');
  const [staffType, setStaffType] = useState<string | null>(null);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setEmail('');
      setRole('doctor');
      setStaffType(null);
    }
    onOpenChange(newOpen);
  };

  const handleRoleChange = (newRole: 'doctor' | 'staff') => {
    setRole(newRole);
    if (newRole !== 'staff') setStaffType(null);
  };

  const isFormValid = email.trim() !== '' && (role !== 'staff' || staffType !== null);

  const handleSubmit = () => {
    if (isFormValid) {
      onInvite({ email, role, staffType: role === 'staff' ? staffType : undefined });
      handleOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite staff or doctor</DialogTitle>
          <DialogDescription>Send an invitation to join your clinic</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(value) => handleRoleChange(value as 'doctor' | 'staff')} disabled={isLoading}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="doctor">Doctor</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === 'staff' && (
            <div className="space-y-2">
              <Label htmlFor="staffType">Staff Type</Label>
              <Select value={staffType || ''} onValueChange={setStaffType} disabled={isLoading}>
                <SelectTrigger id="staffType">
                  <SelectValue placeholder="Select staff type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receptionist">Receptionist</SelectItem>
                  <SelectItem value="nurse">Nurse</SelectItem>
                  <SelectItem value="assistant">Assistant</SelectItem>
                  <SelectItem value="pharmacist">Pharmacist</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isFormValid || isLoading}>
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowActionsMenu({
  member,
  onSuspend,
  onReactivate,
  onRemove,
}: {
  member: TeamMember;
  onSuspend?: (id: string) => void;
  onReactivate?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Row actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {member.status === 'active' && (
          <DropdownMenuItem onClick={() => onSuspend?.(member.id)}>Suspend</DropdownMenuItem>
        )}
        {member.status === 'suspended' && (
          <DropdownMenuItem onClick={() => onReactivate?.(member.id)}>Reactivate</DropdownMenuItem>
        )}
        {member.status !== 'removed' && (
          <>
            {member.status === 'active' || member.status === 'suspended' ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onClick={() => onRemove?.(member.id)} className="text-destructive focus:text-destructive">
              Remove
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function TeamMembersPage({
  members = [],
  isLoading = false,
  onInvite,
  onSuspend,
  onReactivate,
  onRemove,
  onSwitchToDoctor,
}: TeamMembersPageProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const getRoleBadgeColor = (role: 'doctor' | 'staff') =>
    role === 'doctor' ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400' : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400';

  const getStatusBadgeColor = (status: 'active' | 'suspended' | 'removed') => {
    if (status === 'active') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
    if (status === 'suspended') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Team Members</h1>
        <Button onClick={() => setDialogOpen(true)} className="sm:w-auto">
          <MailPlus className="h-4 w-4 mr-2" />
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

      <Card className="border border-border bg-card rounded-xl shadow-sm">
        {members && members.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Staff Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id} className={member.status === 'removed' ? 'opacity-60' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{getInitials(member.name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-foreground">{member.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getRoleBadgeColor(member.role)}>{member.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {member.staffType ? <Badge variant="secondary">{member.staffType}</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeColor(member.status)}>{member.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatRelativeTime(member.lastActive)}</TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu member={member} onSuspend={onSuspend} onReactivate={onReactivate} onRemove={onRemove} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">No team members yet.</div>
        )}
      </Card>

      <InviteDialog open={dialogOpen} onOpenChange={setDialogOpen} onInvite={onInvite || (() => {})} isLoading={isLoading} />
    </div>
  );
}