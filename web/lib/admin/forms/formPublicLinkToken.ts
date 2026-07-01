import { randomBytes } from "crypto";

/** Cryptographically random plaintext token for `form_public_links` (stored hashed server-side). */
export function generateSecureFormLinkPlaintext(): string {
    return randomBytes(32).toString("base64url");
}

/** Path for Next embed page (`app/forms/embed/[token]`). */
export function buildPublicFormEmbedPath(plaintextToken: string): string {
    return `/forms/embed/${encodeURIComponent(plaintextToken)}`;
}
