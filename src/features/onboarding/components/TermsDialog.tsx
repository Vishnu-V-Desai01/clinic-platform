'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  TOS_VERSION,
  TERMS_OF_SERVICE_SECTIONS,
  PRIVACY_POLICY_SECTIONS,
  type LegalSection,
} from '../legal-content'

interface TermsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function LegalSectionBlock({ section }: { section: LegalSection }) {
  return (
    <div className="mb-5">
      <h3 className="text-sm font-semibold text-foreground mb-1.5">{section.heading}</h3>
      {section.paragraphs?.map((para, i) => (
        <p key={i} className="text-sm text-muted-foreground leading-relaxed mb-2">
          {para}
        </p>
      ))}
      {section.bullets && (
        <ul className="list-disc pl-5 space-y-1">
          {section.bullets.map((b, i) => (
            <li key={i} className="text-sm text-muted-foreground leading-relaxed">
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function TermsDialog({ open, onOpenChange }: TermsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>CURAKIN HealthTech — Terms &amp; Policies</DialogTitle>
          <DialogDescription>
            Version {TOS_VERSION} · Please read before accepting.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="tos" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tos">Terms of Service</TabsTrigger>
            <TabsTrigger value="privacy">Privacy Policy</TabsTrigger>
          </TabsList>
          <TabsContent value="tos" className="flex-1 overflow-y-auto mt-3 pr-4">
            {TERMS_OF_SERVICE_SECTIONS.map((section, i) => (
              <LegalSectionBlock key={i} section={section} />
            ))}
          </TabsContent>
          <TabsContent value="privacy" className="flex-1 overflow-y-auto mt-3 pr-4">
            {PRIVACY_POLICY_SECTIONS.map((section, i) => (
              <LegalSectionBlock key={i} section={section} />
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}