import crypto from "node:crypto";

/**
 * Convert any string (including Unicode: Chinese, Arabic, Cyrillic, Accented Latin)
 * into a valid, safe filesystem and URL slug.
 *
 * Never returns an empty string or dotfile. Falls back to a deterministic SHA-1 hash
 * prefixed with the provided prefix if the string contains no letters or digits.
 */
export function toValidSlug(text: string, prefix = "entity"): string {
  if (!text) {
    return `${prefix}-empty`;
  }

  let slug = text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    const hash = crypto.createHash("sha1").update(text).digest("hex").slice(0, 8);
    slug = `${prefix}-${hash}`;
  }

  return slug;
}

/**
 * Escape XML special characters in attribute values and text content.
 */
export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
