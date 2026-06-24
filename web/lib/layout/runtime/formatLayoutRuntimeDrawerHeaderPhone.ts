import { formatPhoneUS } from "@/lib/adminFormatters";

/** Shared US phone formatting for all drawer command headers. */
export function formatLayoutRuntimeDrawerHeaderPhone(raw: unknown): string | null {
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text) return null;
    const formatted = formatPhoneUS(text);
    return formatted !== "—" ? formatted : text;
}
