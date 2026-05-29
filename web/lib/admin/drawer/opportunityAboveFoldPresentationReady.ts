import { opportunityInquiryFamilyBlockReadyOnPrimary } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { opportunityInquiryTourDisplayFromPrimaryMetadata } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import {
    opportunityLocationDisplayLabelSafe,
    opportunityStatusDisplayLabelSafe,
} from "@/lib/admin/drawer/opportunityRawValueGuard";
import { formatOpportunityInquiryDrawerTitle } from "@/lib/admin/drawer/opportunityInquiryDrawerTitle";
import type { RecordDrawerShellContract } from "@/lib/adminV2/shellContracts/types";
import type { ActivitySignalResult } from "@/lib/admin/activitySignals";

export type OpportunityAboveFoldPresentationLayoutModel = {
    family_contacts_in_summary?: boolean;
    summary_right_column_reserved?: boolean;
    what_matters_reserved?: boolean;
    inquiry_children_section_visible?: boolean;
    /** Tour bookings GET is armed — metadata-only tour must not paint before settle. */
    tour_bookings_fetch_armed?: boolean;
    tour_bookings_fetch_settled?: boolean;
};

export type OpportunityAboveFoldPresentationReport = {
    ready: boolean;
    missing: string[];
    skeleton_sections: string[];
    raw_value_suppressed: string[];
};

function trimNonEmpty(value: unknown): string | null {
    if (value == null) return null;
    const t = String(value).trim();
    return t.length > 0 ? t : null;
}

function activitySummaryReady(record: Record<string, unknown>): boolean {
    const embedded = record._activity_signal as ActivitySignalResult | null | undefined;
    if (embedded && typeof embedded === "object") {
        if (embedded.last_activity_at != null && String(embedded.last_activity_at).trim()) return true;
        if (embedded.last_activity_summary != null && String(embedded.last_activity_summary).trim()) return true;
        if (embedded.stale_signal != null) return true;
        return true;
    }
    return record._activity_signal_pending !== true;
}

function childCountPresentationReady(record: Record<string, unknown>, sectionVisible: boolean): boolean {
    if (!sectionVisible) return true;
    const summary = record._child_lifecycle_summary;
    if (summary && typeof summary === "object") {
        const headline = trimNonEmpty((summary as { headline_label?: unknown }).headline_label);
        if (headline) return true;
    }
    const shellCount = Number(record._inquiry_children_shell_count ?? record._inquiry_children_count ?? NaN);
    if (Number.isFinite(shellCount)) return true;
    const children = record._inquiry_children;
    if (Array.isArray(children)) return true;
    return false;
}

function tourPresentationReady(
    record: Record<string, unknown>,
    layout: OpportunityAboveFoldPresentationLayoutModel
): { ready: boolean; useSkeleton: boolean } {
    if (!layout.what_matters_reserved) return { ready: true, useSkeleton: false };

    const metadataTour = opportunityInquiryTourDisplayFromPrimaryMetadata(record);
    const needsTourSlot = metadataTour || layout.tour_bookings_fetch_armed === true;
    if (!needsTourSlot) return { ready: true, useSkeleton: false };

    if (!layout.tour_bookings_fetch_armed || !layout.tour_bookings_fetch_settled) {
        return { ready: false, useSkeleton: true };
    }

    return { ready: true, useSkeleton: false };
}

function rightColumnPresentationReady(layout: OpportunityAboveFoldPresentationLayoutModel): boolean {
    if (!layout.summary_right_column_reserved) return true;
    return true;
}

/**
 * Above-fold presentation contract — display-safe values required before overview body reveal.
 * Does not wait for full hydrate; skeleton sections may remain reserved after reveal.
 */
export function assessOpportunityAboveFoldPresentationReady(
    record: Record<string, unknown> | null | undefined,
    shell: RecordDrawerShellContract | null | undefined,
    layout: OpportunityAboveFoldPresentationLayoutModel,
    preview?: {
        statusLabel?: string | null;
        locationLabel?: string | null;
        title?: string | null;
        childLifecycleSummaryHeadline?: string | null;
    }
): OpportunityAboveFoldPresentationReport {
    const missing: string[] = [];
    const skeleton_sections: string[] = [];
    const raw_value_suppressed: string[] = [];

    if (!record || typeof record !== "object") {
        return { ready: false, missing: ["record"], skeleton_sections, raw_value_suppressed };
    }

    const title =
        trimNonEmpty(formatOpportunityInquiryDrawerTitle(record, "Inquiry")) ??
        trimNonEmpty(preview?.title);
    if (!title) missing.push("title");

    const statusKey = trimNonEmpty(record.status_key);
    const statusLabel = opportunityStatusDisplayLabelSafe(record, preview?.statusLabel);
    if (statusKey && !statusLabel) {
        missing.push("status_label");
        raw_value_suppressed.push("status_key");
    }

    const hasLocationFk =
        trimNonEmpty(record.location_id) != null || trimNonEmpty(record._location_id) != null;
    const locationLabel = opportunityLocationDisplayLabelSafe(record, preview?.locationLabel);
    if (hasLocationFk && !locationLabel) {
        missing.push("location_label");
        raw_value_suppressed.push("location_id");
    }

    const familyInSummary =
        layout.family_contacts_in_summary === true ||
        shell?.geometry.family_contacts_in_summary === true;
    if (familyInSummary && !opportunityInquiryFamilyBlockReadyOnPrimary(record)) {
        missing.push("family_contact_shell");
    }

    if (!activitySummaryReady(record)) {
        missing.push("last_activity_summary");
    }

    const childrenVisible =
        layout.inquiry_children_section_visible === true ||
        shell?.section_slots.some((s) => s.section_key === "inquiry_children") === true;
    if (!childCountPresentationReady(record, childrenVisible)) {
        missing.push("child_count");
    } else if (
        childrenVisible &&
        preview?.childLifecycleSummaryHeadline &&
        !trimNonEmpty((record._child_lifecycle_summary as { headline_label?: unknown } | undefined)?.headline_label)
    ) {
        // Queue preview headline is display-safe until lifecycle summary hydrates.
    }

    if (!shell?.tabs?.length) {
        missing.push("tab_strip");
    }

    const tour = tourPresentationReady(record, layout);
    if (!tour.ready) {
        missing.push("tour_summary");
        skeleton_sections.push("what_matters_tour");
    }

    if (!rightColumnPresentationReady(layout)) {
        missing.push("right_column_shell");
        skeleton_sections.push("inquiry_summary_right");
    } else if (layout.summary_right_column_reserved) {
        skeleton_sections.push("inquiry_summary_right");
    }

    if (layout.what_matters_reserved && tour.useSkeleton) {
        skeleton_sections.push("what_matters_tour");
    }

    return {
        ready: missing.length === 0,
        missing,
        skeleton_sections: [...new Set(skeleton_sections)],
        raw_value_suppressed: [...new Set(raw_value_suppressed)],
    };
}

export function isOpportunityAboveFoldPresentationReady(
    record: Record<string, unknown> | null | undefined,
    shell: RecordDrawerShellContract | null | undefined,
    layout: OpportunityAboveFoldPresentationLayoutModel,
    preview?: {
        statusLabel?: string | null;
        locationLabel?: string | null;
        title?: string | null;
        childLifecycleSummaryHeadline?: string | null;
    }
): boolean {
    return assessOpportunityAboveFoldPresentationReady(record, shell, layout, preview).ready;
}
