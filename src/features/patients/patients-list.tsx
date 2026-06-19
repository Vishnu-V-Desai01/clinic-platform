"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Archive, Eye, MoreHorizontal, Pencil, Plus, Search, UserX,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

import { archivePatient } from "./actions"
import { genderLabel, statusLabel } from "./types"
import type { PatientListItem, PatientStatus } from "./types"

const PAGE_SIZE = 10

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

const STATUS_BADGE_CLASSES: Record<PatientStatus, string> = {
  active:
    "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  inactive:
    "border-transparent bg-muted text-muted-foreground",
  archived:
    "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
}

interface PatientsListProps {
  patients: PatientListItem[]
}

export default function PatientsList({ patients }: PatientsListProps) {
  const router                       = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch]          = useState("")
  const [statusFilter, setStatus]    = useState<"all" | PatientStatus>("all")
  const [page, setPage]              = useState(1)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return patients.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false
      if (!query) return true
      const fullName = `${p.firstName} ${p.lastName}`.toLowerCase()
      return (
        fullName.includes(query) ||
        p.mrn.toLowerCase().includes(query) ||
        p.phone.includes(query)
      )
    })
  }, [patients, search, statusFilter])

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex  = (currentPage - 1) * PAGE_SIZE
  const pageRows    = filtered.slice(startIndex, startIndex + PAGE_SIZE)
  const showingFrom = filtered.length === 0 ? 0 : startIndex + 1
  const showingTo   = Math.min(startIndex + PAGE_SIZE, filtered.length)

  function handleArchive(id: string) {
    if (!confirm("Archive this patient?")) return
    startTransition(async () => {
      const result = await archivePatient(id)
      if (result.success) router.refresh()
      else alert(result.error)
    })
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Patients
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {patients.length} patients
          </p>
        </div>
        <Button
          onClick={() => router.push("/dashboard/patients/new")}
          className="bg-sky-500 text-white hover:bg-sky-600"
        >
          <Plus className="size-4" />
          Add New Patient
        </Button>
      </header>

      {/* Toolbar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name, MRN, or phone"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status</span>
          <Select
            value={statusFilter}
            onValueChange={(v) => { setStatus(v as "all" | PatientStatus); setPage(1) }}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card className="mt-4 overflow-hidden py-0 shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="text-muted-foreground">Patient</TableHead>
                <TableHead className="text-muted-foreground">Age / Gender</TableHead>
                <TableHead className="text-muted-foreground">Phone</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5}>
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <UserX className="size-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">No patients found</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Try adjusting your search or filters.
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((patient) => (
                  <TableRow key={patient.id} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarFallback className="bg-sky-100 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                            {getInitials(patient.firstName, patient.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {patient.firstName} {patient.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">{patient.mrn}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {patient.age ?? "—"} /{" "}
                      {patient.gender ? genderLabel(patient.gender) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {patient.phone}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={STATUS_BADGE_CLASSES[patient.status]}
                        variant="outline"
                      >
                        {statusLabel(patient.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-sky-600 hover:bg-sky-50 hover:text-sky-700 dark:text-sky-400 dark:hover:bg-sky-950/30 dark:hover:text-sky-300"
                          onClick={() => router.push(`/dashboard/patients/${patient.id}`)}
                        >
                          <Eye className="size-3.5" /> View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-sky-600 hover:bg-sky-50 hover:text-sky-700 dark:text-sky-400 dark:hover:bg-sky-950/30 dark:hover:text-sky-300"
                          onClick={() => router.push(`/dashboard/patients/${patient.id}/edit`)}
                        >
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`More actions for ${patient.firstName} ${patient.lastName}`}
                            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-sky-500"
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => router.push(`/dashboard/patients/${patient.id}`)}
                            >
                              <Eye className="size-4" /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => router.push(`/dashboard/patients/${patient.id}/edit`)}
                            >
                              <Pencil className="size-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isPending}
                              onClick={() => handleArchive(patient.id)}
                            >
                              <Archive className="size-4" /> Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Pagination */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {showingFrom}–{showingTo} of {filtered.length}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Button
              key={n}
              variant={n === currentPage ? "default" : "outline"}
              size="icon"
              className={
                n === currentPage
                  ? "size-8 bg-sky-500 text-white hover:bg-sky-600"
                  : "size-8"
              }
              onClick={() => setPage(n)}
            >
              {n}
            </Button>
          ))}
          <Button
            variant="outline" size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}