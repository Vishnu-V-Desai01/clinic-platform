import type { MessageType, MessageLanguage, MessagePlaceholders } from "./types";

/**
 * Bridges our DB templates (named tokens like {PATIENT_NAME}) and what a
 * WhatsApp provider actually needs (an ordered list of values for the
 * template's positional variables). The order is derived live from the
 * template's content string each time, rather than hardcoded separately —
 * so it can never silently drift out of sync if template wording changes.
 */
export function extractPlaceholderOrder(templateContent: string): string[] {
  const matches = templateContent.match(/\{([A-Z_]+)\}/g) ?? [];
  return matches.map((m) => m.slice(1, -1));
}

export function buildBodyParams(
  templateContent: string,
  placeholders: MessagePlaceholders
): string[] {
  return extractPlaceholderOrder(templateContent).map((key) => placeholders[key] ?? "");
}

/**
 * TEMPORARY naming convention — update once Meta approves your real
 * templates and assigns their actual names. Only the mock provider will
 * ever see this value until MSG91 is live, so it's safe to leave as a
 * placeholder for now.
 */
export function getProviderTemplateName(type: MessageType, language: MessageLanguage): string {
  return `curakin_${type}_${language}`;
}