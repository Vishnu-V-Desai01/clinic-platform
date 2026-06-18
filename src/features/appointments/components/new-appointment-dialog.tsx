"use client"

import * as React from "react"
import { useTransition } from "react"
import { Calendar, Clock, Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

import { createAppointment } from "../actions"
import { DURATION_OPTIONS, type DoctorOption } from "../types"

export interface PatientOption {
  id: string
  name: string
  mrn: string | null
}

interface NewAppointmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: PatientOption[]
  doctors: DoctorOption[]
  onSuccess: () => void
}

function RequiredMark() {
  return <span className="text-destructive"> *</span>
}

export default function NewAppointmentDialog({
  open,
  onOpenChange,
  patients,
  doctors,
  onSuccess,
}: NewAppointmentDialogProps) {
  const [patientId,          setPatientId]          = React.useState("")
  const [doctorId,           setDoctorId]           = React.useState("")
  const [date,               setDate]               = React.useState("")
  const [time,               setTime]               = React.useState("")
  const [duration,           setDuration]           = React.useState(30)
  const [chiefComplaint,     setChiefComplaint]     = React.useState("")
  const [patientPopoverOpen, setPatientPopoverOpen] = React.useState(false)
  const [doctorPopoverOpen,  setDoctorPopoverOpen]  = React.useState(false)
  const [error,              setError]              = React.useState<string | null>(null)
  const [isPending,          startTransition]       = useTransition()

  // Reset the whole form whenever the dialog closes
  React.useEffect(() => {
    if (!open) {
      setPatientId("")
      setDoctorId("")
      setDate("")
      setTime("")
      setDuration(30)
      setChiefComplaint("")
      setError(null)
    }
  }, [open])

  const selectedPatient = patients.find((p) => p.id === patientId)
  const selectedDoctor  = doctors.find((d) => d.id === doctorId)
  const isValid         = patientId !== "" && doctorId !== "" && date !== "" && time !== ""

  function handleSubmit() {
    if (!isValid || isPending) return
    setError(null)
    startTransition(async () => {
      const result = await createAppointment({
        patientId,
        doctorId,
        appointmentDate: date,
        appointmentTime: time,
        durationMinutes: duration,
        chiefComplaint,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      onSuccess()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Book Appointment</DialogTitle>
          <DialogDescription>Schedule a new visit</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">

          {/* Patient — searchable combobox */}
          <div className="flex flex-col gap-2">
            <Label>Patient <RequiredMark /></Label>
            <Popover open={patientPopoverOpen} onOpenChange={setPatientPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  disabled={isPending}
                  className={cn(
                    "w-full justify-between font-normal",
                    !selectedPatient && "text-muted-foreground",
                  )}
                >
                  {selectedPatient
                    ? `${selectedPatient.name}${selectedPatient.mrn ? ` · ${selectedPatient.mrn}` : ""}`
                    : "Search patient by name or MRN…"}
                  <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search name or MRN…" />
                  <CommandList>
                    <CommandEmpty>No patient found.</CommandEmpty>
                    <CommandGroup>
                      {patients.map((patient) => (
                        <CommandItem
                          key={patient.id}
                          value={`${patient.name} ${patient.mrn ?? ""}`}
                          onSelect={() => {
                            setPatientId(patient.id)
                            setPatientPopoverOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "size-4",
                              patientId === patient.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <div className="flex flex-col">
                            <span>{patient.name}</span>
                            {patient.mrn && (
                              <span className="text-xs text-muted-foreground">{patient.mrn}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Doctor — searchable combobox (was missing from v0) */}
          <div className="flex flex-col gap-2">
            <Label>Doctor <RequiredMark /></Label>
            <Popover open={doctorPopoverOpen} onOpenChange={setDoctorPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  disabled={isPending}
                  className={cn(
                    "w-full justify-between font-normal",
                    !selectedDoctor && "text-muted-foreground",
                  )}
                >
                  {selectedDoctor
                    ? `${selectedDoctor.fullName}${selectedDoctor.specialization ? ` · ${selectedDoctor.specialization}` : ""}`
                    : "Select a doctor…"}
                  <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search doctor…" />
                  <CommandList>
                    <CommandEmpty>No doctor found.</CommandEmpty>
                    <CommandGroup>
                      {doctors.map((doctor) => (
                        <CommandItem
                          key={doctor.id}
                          value={`${doctor.fullName} ${doctor.specialization ?? ""}`}
                          onSelect={() => {
                            setDoctorId(doctor.id)
                            setDoctorPopoverOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "size-4",
                              doctorId === doctor.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <div className="flex flex-col">
                            <span>{doctor.fullName}</span>
                            {doctor.specialization && (
                              <span className="text-xs text-muted-foreground">
                                {doctor.specialization}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="apt-date">Date <RequiredMark /></Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="apt-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-9"
                  disabled={isPending}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="apt-time">Time <RequiredMark /></Label>
              <div className="relative">
                <Clock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="apt-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="pl-9"
                  disabled={isPending}
                />
              </div>
            </div>
          </div>

          {/* Duration */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="apt-duration">Duration <RequiredMark /></Label>
            <Select
              value={String(duration)}
              onValueChange={(v) => setDuration(Number(v))}
              disabled={isPending}
            >
              <SelectTrigger id="apt-duration">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chief complaint */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="apt-complaint">Chief Complaint</Label>
            <Textarea
              id="apt-complaint"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="Reason for visit…"
              rows={3}
              disabled={isPending}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isPending}>
            {isPending ? "Booking…" : "Book Appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}