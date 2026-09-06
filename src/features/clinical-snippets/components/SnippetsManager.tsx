// src/features/clinical-snippets/components/SnippetsManager.tsx
//
// Item 7a: the dedicated management page's client component —
// create/edit/delete a doctor's own snippets.

'use client'

import { useEffect, useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { listSnippets, createSnippet, updateSnippet, deleteSnippet } from '../actions'
import type { ClinicalNoteSnippet } from '../types'

const EMPTY_FORM = { title: '', body: '' }

export default function SnippetsManager() {
  const [snippets, setSnippets] = useState<ClinicalNoteSnippet[]>([])
  const [loaded, setLoaded]     = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [showForm, setShowForm]   = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId]  = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listSnippets().then((result) => {
      if (cancelled) return
      if (result.success) {
        setSnippets(result.data)
      } else {
        setLoadError(result.error)
      }
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(snippet: ClinicalNoteSnippet) {
    setEditingId(snippet.id)
    setForm({ title: snippet.title, body: snippet.body })
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
  }

  function handleSave() {
    setFormError(null)
    startTransition(async () => {
      const result = editingId
        ? await updateSnippet(editingId, form)
        : await createSnippet(form)

      if (!result.success) {
        setFormError(result.error)
        return
      }

      setSnippets((prev) => {
        const withoutOld = prev.filter((s) => s.id !== result.data.id)
        return [...withoutOld, result.data].sort((a, b) => a.title.localeCompare(b.title))
      })
      closeForm()
    })
  }

  function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteSnippet(id)
      setDeletingId(null)
      if (!result.success) {
        setLoadError(result.error)
        return
      }
      setSnippets((prev) => prev.filter((s) => s.id !== id))
    })
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      )}

      {snippets.length === 0 && !showForm ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10">
          <p className="text-sm text-muted-foreground">No saved snippets yet.</p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New snippet
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {snippets.map((snippet) => (
            <Card key={snippet.id} className="rounded-lg border shadow-sm">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{snippet.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {snippet.body}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(snippet)}
                    aria-label={`Edit ${snippet.title}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(snippet.id)}
                    disabled={isPending && deletingId === snippet.id}
                    aria-label={`Delete ${snippet.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {!showForm && (
            <Button variant="ghost" size="sm" className="w-fit" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New snippet
            </Button>
          )}
        </div>
      )}

      {showForm && (
        <Card className="rounded-lg border shadow-sm">
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {editingId ? 'Edit snippet' : 'New snippet'}
              </p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeForm} aria-label="Cancel">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="snippet-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="snippet-title"
                placeholder="e.g. Post-extraction care"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="snippet-body">
                Text <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="snippet-body"
                rows={5}
                placeholder="The text to insert into clinical notes…"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={isPending} className="flex-1">
                {isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="outline" size="sm" onClick={closeForm} disabled={isPending} className="flex-1">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}