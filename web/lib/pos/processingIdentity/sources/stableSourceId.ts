import { createHash } from "node:crypto";

/** Deterministic UUID-shaped id for polymorphic source_id when no natural row exists. */
export function stableSourceIdFromKey(key: string): string {
    const hex = createHash("sha256").update(key).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
