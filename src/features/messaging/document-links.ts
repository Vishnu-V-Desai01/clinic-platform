import type { SupabaseClient } from "@supabase/supabase-js";

const PUBLIC_LINK_EXPIRY_DAYS = 7;

/**
 * Always inserts a brand-new row. Used both by getOrCreateActivePublicLink
 * (when nothing active exists yet) and by the explicit "regenerate" action.
 */
async function createPublicDocumentLink(
  supabase: SupabaseClient,
  documentId: string,
  clinicId: string,
  createdBy: string
): Promise<string | null> {
  const expiresAt = new Date(Date.now() + PUBLIC_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("public_document_links")
    .insert({
      clinic_id: clinicId,
      document_id: documentId,
      expires_at: expiresAt.toISOString(),
      created_by: createdBy,
    })
    .select("token")
    .single();

  if (error || !data) {
    console.error("[createPublicDocumentLink]", error);
    return null;
  }

  return data.token;
}

/**
 * Reuses an existing, still-valid link for this document if one exists;
 * otherwise creates a new one. Idempotent — safe to call repeatedly for the
 * same document without piling up unnecessary link rows. This is what
 * createReceiptMessage calls.
 */
export async function getOrCreateActivePublicLink(
  supabase: SupabaseClient,
  documentId: string,
  clinicId: string,
  createdBy: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("public_document_links")
    .select("token")
    .eq("document_id", documentId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing.token;
  }

  return createPublicDocumentLink(supabase, documentId, clinicId, createdBy);
}

/**
 * Always creates a fresh link, regardless of whether an active one exists —
 * for the explicit staff-facing "regenerate" action.
 *
 * REAL GAP, flagged rather than worked around: if the original receipt
 * WhatsApp message was already sent, its text has the OLD link baked in as
 * plain words. Regenerating here creates a working new link, but does
 * nothing to change what the patient already received — there's no
 * "resend with the new link" flow yet. Worth a product decision before
 * this goes in front of real clinics: should regenerate also trigger a
 * fresh message, or does staff share the new link some other way?
 */
export async function regenerateDocumentLink(
  supabase: SupabaseClient,
  documentId: string,
  clinicId: string,
  createdBy: string
): Promise<string | null> {
  return createPublicDocumentLink(supabase, documentId, clinicId, createdBy);
}

export function buildPublicDocumentUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/public/documents/${token}`;
}