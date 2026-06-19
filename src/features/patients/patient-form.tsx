// src/features/patients/patient-form.tsx
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Calendar, Check, ChevronRight, FileText,
  Heart, Lock, Mail, MapPin, Phone, User, X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import { createPatient, updatePatient } from "./actions"
import { BLOOD_GROUPS, GENDER_OPTIONS, RELATIONSHIP_OPTIONS, STATUS_OPTIONS } from "./types"
import type { PatientFormValues, PatientRecord } from "./types"

/* -------------------------------------------------------------------------- */
/*  Props                                                                      */
/* -------------------------------------------------------------------------- */

interface PatientFormProps {
  mode: "create" | "edit"
  patient?: PatientRecord
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const EMPTY_VALUES: PatientFormValues = {
  firstName: "", lastName: "", dateOfBirth: "", gender: "",
  bloodGroup: "", mrn: "", status: "active", phone: "", email: "",
  addressLine: "", city: "", state: "", pincode: "",
  emergencyName: "", emergencyRelationship: "", emergencyPhone: "",
  allergies: [], conditions: [], notes: "",
}

function toFormValues(p: PatientRecord): PatientFormValues {
  return {
    firstName:             p.first_name,
    lastName:              p.last_name,
    dateOfBirth:           p.date_of_birth ?? "",
    gender:                p.gender ?? "",
    bloodGroup:            p.blood_group ?? "",
    mrn:                   p.patient_id_number ?? "",
    status:                p.status,
    phone:                 p.phone,
    email:                 p.email ?? "",
    addressLine:           p.address ?? "",
    city:                  p.city ?? "",
    state:                 p.state ?? "",
    pincode:               p.postal_code ?? "",
    emergencyName:         p.emergency_contact_name ?? "",
    emergencyRelationship: p.emergency_contact_relationship ?? "",
    emergencyPhone:        p.emergency_contact_phone ?? "",
    allergies:             p.allergies,
    conditions:            p.conditions,
    notes:                 p.notes ?? "",
  }
}

/* -------------------------------------------------------------------------- */
/*  Small UI building blocks                                                   */
/* -------------------------------------------------------------------------- */

const inputCls =
  "h-11 rounded-md focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:border-sky-500"

function FieldLabel({
  htmlFor, children, required,
}: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
      {children}
      {required && <span className="text-red-500 dark:text-red-400"> *</span>}
    </Label>
  )
}

function SectionHeader({
  icon: Icon, title, subtitle,
}: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 border-b pb-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400">
        <Icon className="size-4" />
      </span>
      <div className="flex flex-col">
        <span className="text-base font-semibold leading-tight text-foreground">{title}</span>
        <span className="text-sm text-muted-foreground">{subtitle}</span>
      </div>
    </div>
  )
}

function IconInput({
  icon: Icon, ...props
}: { icon: React.ElementType } & React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input {...props} className={cn(inputCls, "pl-9", props.className)} />
    </div>
  )
}

function PhoneInput(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="flex">
      <span className="flex h-11 items-center rounded-l-md border border-r-0 border-input bg-muted/50 px-3 text-sm text-muted-foreground">
        +91
      </span>
      <div className="relative flex-1">
        <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input {...props} className={cn(inputCls, "rounded-l-none pl-9", props.className)} />
      </div>
    </div>
  )
}

function ChipInput({
  id, values, placeholder, onAdd, onRemove,
}: {
  id: string; values: string[]; placeholder: string
  onAdd: (v: string) => void; onRemove: (v: string) => void
}) {
  const [draft, setDraft] = React.useState("")

  function commit() {
    const t = draft.trim()
    if (t && !values.includes(t)) onAdd(t)
    setDraft("")
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-transparent p-2 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500">
      {values.map((v) => (
        <Badge key={v} variant="secondary"
          className="gap-1 rounded-md bg-sky-50 py-1 pl-2.5 pr-1.5 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-400 dark:hover:bg-sky-950/50">
          {v}
          <button type="button" onClick={() => onRemove(v)} aria-label={`Remove ${v}`}
            className="rounded-sm text-sky-600 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-200">
            <X className="size-3.5" />
          </button>
        </Badge>
      ))}
      <input id={id} value={draft} placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit() }
          if (e.key === "Backspace" && !draft && values.length) onRemove(values[values.length - 1])
        }}
        onBlur={commit}
        className="h-7 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function PatientForm({ mode, patient }: PatientFormProps) {
  const router                       = useRouter()
  const [isPending, startTransition] = React.useTransition()
  const [serverError, setError]      = React.useState<string | null>(null)
  const isEdit                       = mode === "edit"

  const [values, setValues] = React.useState<PatientFormValues>(
    isEdit && patient ? toFormValues(patient) : EMPTY_VALUES,
  )

  function set<K extends keyof PatientFormValues>(key: K, value: PatientFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = isEdit
        ? await updatePatient(patient!.id, values)
        : await createPatient(values)
      if (!result.success) { setError(result.error); return }
      router.push(`/dashboard/patients/${result.data.id}`)
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <form onSubmit={handleSubmit}
        className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="mb-8">
          <nav className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
            <button type="button" onClick={() => router.push("/dashboard/patients")}
              className="hover:text-foreground">
              Patients
            </button>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground">{isEdit ? "Edit" : "New Patient"}</span>
          </nav>
          <div className="flex items-start gap-3">
            <Button type="button" variant="ghost" size="icon"
              onClick={() => router.back()} className="mt-0.5 size-9 shrink-0">
              <ArrowLeft className="size-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {isEdit ? "Edit Patient" : "Register New Patient"}
              </h1>
              {isEdit && (
                <p className="text-sm text-muted-foreground">
                  {values.firstName} {values.lastName} • MRN: {values.mrn}
                </p>
              )}
            </div>
          </div>
        </header>

        {serverError && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
            {serverError}
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">

          {/* Left column */}
          <div className="flex flex-col gap-6">

            {/* Basic Information */}
            <Card className="rounded-xl border shadow-sm">
              <CardHeader className="block">
                <SectionHeader icon={User} title="Basic Information"
                  subtitle="Patient's identity details" />
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="firstName" required>First Name</FieldLabel>
                    <Input id="firstName" value={values.firstName} required
                      className={inputCls}
                      onChange={(e) => set("firstName", e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="lastName" required>Last Name</FieldLabel>
                    <Input id="lastName" value={values.lastName} required
                      className={inputCls}
                      onChange={(e) => set("lastName", e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="dob" required>Date of Birth</FieldLabel>
                    <IconInput icon={Calendar} id="dob" type="date"
                      value={values.dateOfBirth} required
                      onChange={(e) => set("dateOfBirth", e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="gender" required>Gender</FieldLabel>
                    <Select value={values.gender}
                      onValueChange={(v) => set("gender", v as PatientFormValues["gender"])}>
                      <SelectTrigger id="gender" className="h-11 w-full">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDER_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="bloodGroup">Blood Group</FieldLabel>
                    <Select value={values.bloodGroup}
                      onValueChange={(v) => set("bloodGroup", v as PatientFormValues["bloodGroup"])}>
                      <SelectTrigger id="bloodGroup" className="h-11 w-full">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {BLOOD_GROUPS.map((g) => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="status">Status</FieldLabel>
                    <Select value={values.status}
                      onValueChange={(v) => set("status", v as PatientFormValues["status"])}>
                      <SelectTrigger id="status" className="h-11 w-full">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isEdit && (
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="mrn">
                      Medical Record Number{" "}
                      <span className="font-normal text-muted-foreground">
                        (cannot be changed)
                      </span>
                    </FieldLabel>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="mrn" value={values.mrn} disabled readOnly
                        className={cn(inputCls, "pl-9 font-mono")} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Emergency Contact */}
            <Card className="rounded-xl border shadow-sm">
              <CardHeader className="block">
                <SectionHeader icon={Heart} title="Emergency Contact"
                  subtitle="Who to reach in an emergency" />
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="emergencyName">Contact Name</FieldLabel>
                    <Input id="emergencyName" className={inputCls}
                      value={values.emergencyName}
                      onChange={(e) => set("emergencyName", e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="emergencyRelationship">Relationship</FieldLabel>
                    <Select value={values.emergencyRelationship}
                      onValueChange={(v) => set("emergencyRelationship", v)}>
                      <SelectTrigger id="emergencyRelationship" className="h-11 w-full">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {RELATIONSHIP_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <FieldLabel htmlFor="emergencyPhone">Contact Phone</FieldLabel>
                  <PhoneInput id="emergencyPhone" value={values.emergencyPhone}
                    onChange={(e) => set("emergencyPhone", e.target.value)} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-6">

            {/* Contact Details */}
            <Card className="rounded-xl border shadow-sm">
              <CardHeader className="block">
                <SectionHeader icon={Phone} title="Contact Details"
                  subtitle="How to reach the patient" />
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="phone" required>Phone</FieldLabel>
                    <PhoneInput id="phone" value={values.phone}
                      onChange={(e) => set("phone", e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <IconInput icon={Mail} id="email" type="email"
                      value={values.email}
                      onChange={(e) => set("email", e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <FieldLabel htmlFor="address">Address Line</FieldLabel>
                  <IconInput icon={MapPin} id="address" value={values.addressLine}
                    onChange={(e) => set("addressLine", e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="city">City</FieldLabel>
                    <Input id="city" value={values.city} className={inputCls}
                      onChange={(e) => set("city", e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="state">State</FieldLabel>
                    <Input id="state" value={values.state} className={inputCls}
                      onChange={(e) => set("state", e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="pincode">Pincode</FieldLabel>
                    <Input id="pincode" value={values.pincode} className={inputCls}
                      onChange={(e) => set("pincode", e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Medical Background */}
            <Card className="rounded-xl border shadow-sm">
              <CardHeader className="block">
                <SectionHeader icon={FileText} title="Medical Background"
                  subtitle="Allergies, conditions and notes" />
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="allergies">Known Allergies</FieldLabel>
                    <ChipInput id="allergies" values={values.allergies} placeholder="+ Add"
                      onAdd={(v) => set("allergies", [...values.allergies, v])}
                      onRemove={(v) => set("allergies", values.allergies.filter((a) => a !== v))} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="conditions">Existing Conditions</FieldLabel>
                    <ChipInput id="conditions" values={values.conditions} placeholder="+ Add"
                      onAdd={(v) => set("conditions", [...values.conditions, v])}
                      onRemove={(v) => set("conditions", values.conditions.filter((c) => c !== v))} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <FieldLabel htmlFor="notes">Notes</FieldLabel>
                  <Textarea id="notes" value={values.notes}
                    placeholder="Any other relevant history…"
                    className="min-h-28 rounded-md focus-visible:ring-2 focus-visible:ring-sky-500"
                    onChange={(e) => set("notes", e.target.value)} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Action bar */}
        <div className="mt-8 flex items-center justify-end gap-3 border-t pt-6">
          <Button type="button" variant="outline" disabled={isPending}
            onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}
            className="gap-2 bg-sky-500 text-white hover:bg-sky-600">
            <Check className="size-4" />
            {isPending
              ? isEdit ? "Saving…" : "Registering…"
              : isEdit ? "Save Changes" : "Register Patient"}
          </Button>
        </div>
      </form>
    </div>
  )
}