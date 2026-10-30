import Link from 'next/link'
import type { LegalSection } from '@/features/onboarding/legal-content'

export function LegalDocument({
  title,
  version,
  sections,
}: {
  title: string
  version: string
  sections: LegalSection[]
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">CURAKIN HealthTech</p>
        <p className="text-sm text-muted-foreground">Version {version}</p>
      </header>

      {sections.map((section, i) => (
        <section key={i} className="space-y-3">
          <h2 className="text-lg font-semibold">{section.heading}</h2>
          {section.paragraphs?.map((p, j) => (
            <p key={j} className="text-sm leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
          {section.bullets && (
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              {section.bullets.map((b, j) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <footer className="flex flex-wrap gap-4 border-t pt-6 text-sm text-muted-foreground">
        <Link href="/pricing" className="underline underline-offset-4">
          Pricing
        </Link>
        <Link href="/refund-policy" className="underline underline-offset-4">
          Refund policy
        </Link>
        <Link href="/terms" className="underline underline-offset-4">
          Terms of Service
        </Link>
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
      </footer>
    </main>
  )
}