import { snapshotInquiryChildrenNeedHydrate } from "@/lib/admin/drawer/opportunityDrawerRecordNeedsRevalidate";
import { opportunityInquiryFamilyBlockReadyOnPrimary } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { personDrawerChildChromeActive, type PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";

function personEmployeeStatusRenderable(record: Record<string, unknown>): boolean {
    return "is_employee" in record;
}

/** Inquiry children must be hydrated (array present, labels complete) before above-fold reveal. */
export function opportunityInquiryChildrenCoordinatedReady(
    record: Record<string, unknown> | null | undefined,
    sectionVisible: boolean
): boolean {
    if (!sectionVisible) return true;
    if (!record || typeof record !== "object") return false;
    if (!Array.isArray(record._inquiry_children)) return false;
    return !snapshotInquiryChildrenNeedHydrate(record);
}

/** Composed opportunity open requires primary contract fields plus inquiry children when visible. */
export function opportunityDrawerComposedAboveFoldReady(args: {
    primaryEntity: Record<string, unknown>;
    opportunityId: string;
    inquiryChildrenSectionVisible: boolean;
}): boolean {
    const { primaryEntity, opportunityId, inquiryChildrenSectionVisible } = args;
    if (String(primaryEntity.id ?? "").trim() !== String(opportunityId).trim()) return false;
    if (!opportunityInquiryFamilyBlockReadyOnPrimary(primaryEntity)) return false;
    if (
        inquiryChildrenSectionVisible &&
        !opportunityInquiryChildrenCoordinatedReady(primaryEntity, true)
    ) {
        return false;
    }
    return true;
}

/**
 * Parent household is ready when the full-payload key is present.
 * An empty array (single-adult household, no household connections) is a valid known-empty final state.
 * Before the full API response arrives, the key is absent, so readiness correctly blocks.
 */
export function parentDrawerHouseholdCoordinatedReady(
    record: Record<string, unknown> | null | undefined,
    _drawerId?: string | null
): boolean {
    if (!record) return false;
    return "_household_adult_links" in record;
}

/**
 * Parent address is ready when the full-payload key is present.
 * An empty array (no address on file) is a valid known-empty final state.
 */
export function parentDrawerAddressCoordinatedReady(record: Record<string, unknown> | null | undefined): boolean {
    if (!record) return false;
    return "_household_customer_addresses" in record;
}

export function parentDrawerEmployeeStatusCoordinatedReady(
    record: Record<string, unknown> | null | undefined
): boolean {
    if (!record) return false;
    return personEmployeeStatusRenderable(record);
}

/**
 * Child household is ready when the full-payload key is present.
 * An empty array (no household connections found) is a valid known-empty final state.
 */
export function childDrawerHouseholdCoordinatedReady(
    record: Record<string, unknown> | null | undefined,
    _drawerId?: string | null
): boolean {
    if (!record) return false;
    return "_household_adult_links" in record;
}

/**
 * Child medical is ready when the full payload has been fetched.
 * The persons API has no `medical` column — absence of medical data after bodyHydrated is the final known-empty answer.
 * Pre-hydration, only passes when actual medical data is already present in the record.
 */
export function childDrawerMedicalCoordinatedReady(
    record: Record<string, unknown> | null | undefined,
    bodyHydrated = false
): boolean {
    if (!record) return false;
    if (bodyHydrated) return true;
    const med = record.medical ?? record.health;
    return med != null && typeof med === "object";
}

/** Child summary ready when chrome profile is established (via hint or DB) and a display name is present. */
export function childDrawerSummaryCoordinatedReady(
    record: Record<string, unknown> | null | undefined,
    hint?: PersonDrawerChildChromeHint | null
): boolean {
    if (!record) return false;
    return (
        personDrawerChildChromeActive(record, hint) &&
        Boolean(resolvePersonDrawerChildSummaryModel(record).display_name?.trim())
    );
}

export function parentDrawerSummaryCoordinatedReady(record: Record<string, unknown> | null | undefined): boolean {
    if (!record) return false;
    return Boolean(String(record.display_name ?? record.name ?? record._person_name ?? "").trim());
}

/** Parent above-fold reveal — all visible operating sections must have final data. */
export function parentDrawerAboveFoldCoordinatedReady(args: {
    record: Record<string, unknown> | null | undefined;
    drawerId: string | null | undefined;
    bodyHydrated: boolean;
    requireHousehold: boolean;
    requireAddress: boolean;
    requireEmployeeStatus: boolean;
}): boolean {
    if (!args.bodyHydrated || !args.record) return false;
    if (!parentDrawerSummaryCoordinatedReady(args.record)) return false;
    if (args.requireHousehold && !parentDrawerHouseholdCoordinatedReady(args.record, args.drawerId)) {
        return false;
    }
    if (args.requireAddress && !parentDrawerAddressCoordinatedReady(args.record)) return false;
    if (args.requireEmployeeStatus && !parentDrawerEmployeeStatusCoordinatedReady(args.record)) {
        return false;
    }
    return true;
}

/** Child above-fold reveal — summary, household, medical, and chrome must be composed. */
export function childDrawerAboveFoldCoordinatedReady(args: {
    record: Record<string, unknown> | null | undefined;
    drawerId: string | null | undefined;
    bodyHydrated: boolean;
    requireHousehold: boolean;
    requireMedical: boolean;
    childChromeHint?: PersonDrawerChildChromeHint | null;
}): boolean {
    if (!args.bodyHydrated || !args.record) return false;
    if (!childDrawerSummaryCoordinatedReady(args.record, args.childChromeHint)) return false;
    if (!personDrawerChildChromeActive(args.record, args.childChromeHint)) return false;
    if (args.requireHousehold && !childDrawerHouseholdCoordinatedReady(args.record, args.drawerId)) {
        return false;
    }
    // Medical: known-empty after full fetch — bodyHydrated=true is the completion sentinel.
    if (args.requireMedical && !childDrawerMedicalCoordinatedReady(args.record, args.bodyHydrated)) return false;
    return true;
}
