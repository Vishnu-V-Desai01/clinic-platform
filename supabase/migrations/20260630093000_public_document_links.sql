-- ============================================================================
-- Migration: Public Document Links (Chat 11B continued)
-- Purpose: 7-day, regeneratable, unauthenticated download links for receipt
-- and treatment PDFs, sent via WhatsApp. Builds on the existing `documents`
-- table from Chat 10 — no duplicate storage, just an expiring token layer.
-- ============================================================================

CREATE TABLE public_document_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT public_document_links_token_unique UNIQUE (token)
);

CREATE INDEX idx_public_document_links_document ON public_document_links (document_id);
CREATE INDEX idx_public_document_links_clinic ON public_document_links (clinic_id, created_at DESC);

COMMENT ON TABLE public_document_links IS
  'Opaque, expiring (7-day) tokens granting unauthenticated access to a single document, for the WhatsApp receipt/treatment-PDF flow. Regeneration creates a new row rather than mutating an existing one — prior valid links keep working until their own expiry rather than being force-revoked.';
COMMENT ON COLUMN public_document_links.token IS
  'The value embedded in the public URL (/api/public/documents/{token}). Possession of this value is the only access check, by design — same pattern as a password-reset link.';


-- ----------------------------------------------------------------------------
-- RLS: staff/doctor can view + create links for their own clinic (the
-- "regenerate" action, and an audit trail of what's been issued).
-- No UPDATE/DELETE from the app — links are immutable once created.
-- ----------------------------------------------------------------------------
ALTER TABLE public_document_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_document_links_select_own_clinic"
  ON public_document_links FOR SELECT
  TO authenticated
  USING (clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff'));

CREATE POLICY "public_document_links_insert_own_clinic"
  ON public_document_links FOR INSERT
  TO authenticated
  WITH CHECK (clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff'));


-- ----------------------------------------------------------------------------
-- SECURITY DEFINER function: the ONLY way an anonymous request can ever
-- touch this data. Exact token in, file path or nothing out. Never lists,
-- never browses, never reveals anything without the precise token.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_document_path_by_token(p_token UUID)
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT d.file_path
  FROM public_document_links pdl
  JOIN documents d ON d.id = pdl.document_id
  WHERE pdl.token = p_token
    AND pdl.is_active = true
    AND pdl.expires_at > now()
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_document_path_by_token IS
  'Public lookup for WhatsApp document links. Granted to anon — safe because it requires the exact unguessable token and enforces expiry server-side, and only ever returns a file path, nothing else.';

GRANT EXECUTE ON FUNCTION get_document_path_by_token(UUID) TO anon, authenticated;