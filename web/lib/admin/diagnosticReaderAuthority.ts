/**
 * EN-FI-01 — who may run a service-role DIAGNOSTIC route that reads children's documents, health-profile fields and
 * household finances for any id the caller names (e.g. `/api/admin/p076-first-order-prototype`, live wherever
 * ALLOY_ROUTE_TIMING=1). Diagnostics have no product caller; their reader must already be entitled to everything they
 * touch: an organization administrator (`admin` / `owner` role key) with unrestricted department and site scope, who
 * holds Documents read admission AND Medical (`health.view`). Anyone else is refused before any read.
 */
import { accessScopeRestrictsData, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import { actorMayReadDocuments } from "@/lib/documents/assertDocumentAccess";

export function diagnosticReaderAllowed(access: AdminAccessContextSuccess): boolean {
    const roles = access.roleKeys ?? [];
    const isAdministrator = roles.some((k) => k === "admin" || k === "owner");
    if (!isAdministrator) return false;
    if (!actorMayReadDocuments(access)) return false;
    if (!(access.permissionKeys ?? []).includes("health.view")) return false;
    return !accessScopeRestrictsData(scopeDimensionsFromAccess(access));
}
