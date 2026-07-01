import { personDrawerCrmDisplayLabel } from "@/lib/admin/person/personDrawerChildIdentity";

/** Child drawer header lead pill — opportunity enrollment status, not child lifecycle status. */
export function personDrawerChildLeadPillLabel(
    statusLabel: string | null,
    opportunityName: string | null
): string {
    const status = personDrawerCrmDisplayLabel(statusLabel);
    if (status) return `Lead: ${status}`;
    if (opportunityName?.trim()) return "Lead: Open";
    return "Lead: Open";
}
