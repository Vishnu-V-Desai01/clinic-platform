// src/features/clinical-snippets/components/TreatmentNameCombobox.tsx
//
// Phase 2 (Treatment Details): a free-text-or-pick input for the Treatment
// field. The visible Input IS the field — bound directly to the caller's
// name state. A dedicated chevron button (same affordance icon as the
// patient picker in new-charge-dialog-client.tsx) opens a Popover listing
// the doctor's saved clinical-note snippets, filtered client-side against
// whatever's currently typed — same pattern already used by
// searchPastMedicineNames/searchPastNoteLines in post-visit/actions.ts.
// Selecting a snippet fills BOTH the name and (via onSnippetSelect) the
// caller's notes field directly — an explicit click is the "clear action"
// the no-silent-overwrite rule requires, per the confirmed mapping
// (title → treatment, body → notes). The doctor can otherwise just keep
// typing free text and never open the popover at all — it never
// restricts what can be entered.
//
// FIX 1: uses PopoverAnchor (not PopoverTrigger) around the Input.
// PopoverTrigger, even with asChild, is built on Radix's Primitive.button
// and injects type="button" onto whatever it wraps — on a plain <input>
// that makes the browser render it as a non-editable button-input, which
// silently blocked all typing. PopoverAnchor only affects positioning and
// injects no button semantics.
//
// FIX 2: added an explicit chevron button that directly toggles `open`,
// rather than relying solely on the input's focus/blur events to drive
// the popover — focus-triggered opening wasn't reliably surfacing the
// list in testing. The button click is a deterministic, guaranteed path;
// focus-based opening is kept as a bonus, not the only mechanism.
//
// Deliberately self-contained: fetches its own snippet list on mount via
// listSnippetsForInsert(), same as EncounterCard's existing "Insert
// snippet…" dropdown. If this component is ever rendered multiple times
// at once (e.g. several treatment rows open together in the wizard), each
// instance fetches independently — a minor duplication, acceptable given
// realistic snippet-list sizes.

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { listSnippetsForInsert } from '../actions'
import type { ClinicalNoteSnippet } from '../types'

interface TreatmentNameComboboxProps {
  id?:              string
  name:             string
  onNameChange:     (name: string) => void
  onSnippetSelect:  (snippet: ClinicalNoteSnippet) => void
  placeholder?:     string
  autoFocus?:       boolean
}

export default function TreatmentNameCombobox({
  id,
  name,
  onNameChange,
  onSnippetSelect,
  placeholder = 'e.g. Scaling, Filling — or pick a saved snippet',
  autoFocus,
}: TreatmentNameComboboxProps) {
  const [snippets, setSnippets]           = useState<ClinicalNoteSnippet[]>([])
  const [snippetsLoaded, setSnippetsLoaded] = useState(false)
  const [open, setOpen]                   = useState(false)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    listSnippetsForInsert().then((result) => {
      if (cancelled) return
      if (result.success) setSnippets(result.data)
      setSnippetsLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = name.trim().toLowerCase()
    if (!q) return snippets
    return snippets.filter((s) => s.title.toLowerCase().includes(q))
  }, [snippets, name])

  const handleFocus = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current)
    if (snippetsLoaded) setOpen(true)
  }

  const handleBlur = () => {
    // Delay so a click on a suggestion (or the chevron button) registers
    // before the popover closes — same blur-race workaround EncounterCard
    // already uses for its past-note-line autocomplete.
    blurTimeout.current = setTimeout(() => setOpen(false), 150)
  }

  const handleSelect = (snippet: ClinicalNoteSnippet) => {
    onSnippetSelect(snippet)
    setOpen(false)
  }

  const toggleOpen = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current)
    setOpen((o) => !o)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative flex items-center">
          <Input
            id={id}
            value={name}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="off"
            onChange={(e) => onNameChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className="pr-9"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()} // keep the input focused, don't steal it
            onClick={toggleOpen}
            className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="Browse saved snippets"
          >
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            {!snippetsLoaded ? (
              <CommandEmpty>Loading snippets…</CommandEmpty>
            ) : snippets.length === 0 ? (
              <CommandEmpty>
                No saved snippets yet — type freely, or add one from Manage snippets.
              </CommandEmpty>
            ) : filtered.length === 0 ? (
              <CommandEmpty>No matching snippets. Keep typing to use free text.</CommandEmpty>
            ) : (
              <CommandGroup heading="Saved snippets">
                {filtered.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onSelect={() => handleSelect(s)}
                  >
                    <span className="truncate">{s.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}