// UI-5A — pure role_type → tier policy (code constants; no config UI).
import type { RecipientTier } from "./types";

export const PRIMARY_ROLE_KEYS: ReadonlySet<string> = new Set([
    "parent", "guardian", "primary_contact", "primary", "mother", "father", "mom", "dad",
]);
export const SECONDARY_ROLE_KEYS: ReadonlySet<string> = new Set([
    "emergency_contact", "emergency", "authorized_pickup", "pickup", "grandparent", "other", "contact",
]);
export const EXCLUDED_ROLE_KEYS: ReadonlySet<string> = new Set([
    "child", "student", "staff", "vendor", "employee",
]);

export const TIER_UI_LABEL: Record<"primary" | "secondary", string> = {
    primary: "Parent/Guardian",
    secondary: "Other contacts",
};

const PRIMARY_PRECEDENCE: string[] = ["guardian", "parent", "primary_contact", "primary", "mother", "father", "mom", "dad"];

export function normalizeRoleKey(roleType?: string | null): string {
    return (roleType ?? "").trim().toLowerCase();
}

export function tierForRoleType(roleType?: string | null): RecipientTier {
    const k = normalizeRoleKey(roleType);
    if (EXCLUDED_ROLE_KEYS.has(k)) return "excluded";
    if (PRIMARY_ROLE_KEYS.has(k)) return "primary";
    // Adults from the household roster default to secondary (still messageable) when role unknown.
    return "secondary";
}

/** Sort comparator within a tier: is_primary desc → guardian precedence → display name. */
export function compareRecipientsForTier(
    a: { isPrimary: boolean; roleType: string | null; displayName: string },
    b: { isPrimary: boolean; roleType: string | null; displayName: string }
): number {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    const pa = PRIMARY_PRECEDENCE.indexOf(normalizeRoleKey(a.roleType));
    const pb = PRIMARY_PRECEDENCE.indexOf(normalizeRoleKey(b.roleType));
    const ra = pa === -1 ? Number.MAX_SAFE_INTEGER : pa;
    const rb = pb === -1 ? Number.MAX_SAFE_INTEGER : pb;
    if (ra !== rb) return ra - rb;
    return a.displayName.localeCompare(b.displayName);
}
