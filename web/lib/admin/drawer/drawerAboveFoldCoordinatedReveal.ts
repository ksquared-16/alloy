import { snapshotInquiryChildrenNeedHydrate } from "@/lib/admin/drawer/opportunityDrawerRecordNeedsRevalidate";
import { opportunityInquiryFamilyBlockReadyOnPrimary } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import {
    personDrawerHouseholdAddressHasContent,
    resolvePersonDrawerHouseholdAddressModel,
} from "@/lib/admin/person/resolvePersonDrawerHouseholdAddress";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";

function personAddressRenderable(record: Record<string, unknown>): boolean {
    const model = resolvePersonDrawerHouseholdAddressModel(record);
    return personDrawerHouseholdAddressHasContent(model);
}

function personMedicalRenderable(record: Record<string, unknown>): boolean {
    const med = record.medical ?? record.health;
    return med != null && typeof med === "object";
}

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

export function parentDrawerHouseholdCoordinatedReady(
    record: Record<string, unknown> | null | undefined,
    drawerId: string | null | undefined
): boolean {
    if (!record) return false;
    return resolvePersonDrawerHouseholdModel(record, { viewing_person_id: drawerId }).groups.length > 0;
}

export function parentDrawerAddressCoordinatedReady(record: Record<string, unknown> | null | undefined): boolean {
    if (!record) return false;
    return personAddressRenderable(record);
}

export function parentDrawerEmployeeStatusCoordinatedReady(
    record: Record<string, unknown> | null | undefined
): boolean {
    if (!record) return false;
    return personEmployeeStatusRenderable(record);
}

export function childDrawerHouseholdCoordinatedReady(
    record: Record<string, unknown> | null | undefined,
    drawerId: string | null | undefined
): boolean {
    if (!record) return false;
    return resolvePersonDrawerHouseholdModel(record, { viewing_person_id: drawerId }).groups.length > 0;
}

export function childDrawerMedicalCoordinatedReady(record: Record<string, unknown> | null | undefined): boolean {
    if (!record) return false;
    return personMedicalRenderable(record);
}

export function childDrawerSummaryCoordinatedReady(record: Record<string, unknown> | null | undefined): boolean {
    if (!record) return false;
    return (
        personDrawerChildChromeActive(record) &&
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
}): boolean {
    if (!args.bodyHydrated || !args.record) return false;
    if (!childDrawerSummaryCoordinatedReady(args.record)) return false;
    if (!personDrawerChildChromeActive(args.record)) return false;
    if (args.requireHousehold && !childDrawerHouseholdCoordinatedReady(args.record, args.drawerId)) {
        return false;
    }
    if (args.requireMedical && !childDrawerMedicalCoordinatedReady(args.record)) return false;
    return true;
}
