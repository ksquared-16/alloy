import type { AdminV2DrawerSurface } from "@/lib/adminV2/runtime/contract/types";
import type { PersonOperatingSectionKey } from "@/lib/admin/person/personDrawerLayoutRuntime";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";

export type ComposedDrawerPayloadKind = "opportunity" | "parent" | "child";

export type ComposedDrawerPayloadEvaluation = {
    ready: boolean;
    missing: string[];
    blockingSections: string[];
};

export type ComposedPersonDrawerPayloadContext = {
    surface: Extract<AdminV2DrawerSurface, "parent" | "child">;
    drawerId: string;
    record: Record<string, unknown>;
    bodyHydrated: boolean;
    operatingSections: readonly PersonOperatingSectionKey[];
    overviewSectionKeys: readonly string[];
    /** Child chrome hint — resolves profile from open-source when DB relationships are incomplete. */
    childChromeHint?: PersonDrawerChildChromeHint | null;
};

export type ComposedOpportunityDrawerPayloadContext = {
    drawerId: string;
    record: Record<string, unknown>;
    /** Primary or full record has arrived. bodyHydrated = true once drawer_primary surface applied. */
    bodyHydrated: boolean;
    /**
     * Full record surface has been applied (`_record_surface === "full"`).
     * BOS/right-panel and below-fold data are only present in the full response — do not
     * gate their readiness on bodyHydrated alone or content will appear after first paint.
     */
    fullHydrateReady: boolean;
    headerActionsReady: boolean;
    inquiryChildrenSectionVisible: boolean;
};

export type ComposedDrawerPreparingCopy = {
    title: string;
    description: string;
};
