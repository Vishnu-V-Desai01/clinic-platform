import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "clinic-documents";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes — enough for the redirect to complete

/**
 * SERVICE ROLE client — bypasses RLS entirely. Only ever instantiate this
 * inside this one route, never anywhere a Clerk session might be present.
 * Necessary here specifically because a patient clicking a WhatsApp link
 * has no session at all; the token check above is what makes this safe.
 */
function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!UUID_REGEX.test(token)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const supabase = createServiceRoleClient();

  const { data: filePath, error: lookupError } = await supabase.rpc(
    "get_document_path_by_token",
    { p_token: token }
  );

  if (lookupError || !filePath) {
    return NextResponse.json({ error: "This link is invalid or has expired" }, { status: 404 });
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SECONDS);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    return NextResponse.json({ error: "Could not retrieve document" }, { status: 500 });
  }

  return NextResponse.redirect(signedUrlData.signedUrl);
}