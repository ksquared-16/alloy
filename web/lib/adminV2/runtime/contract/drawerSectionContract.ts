import type {
    AdminV2DrawerSurface,
    DrawerSectionFallbackMode,
    DrawerSectionRenderContext,
    DrawerSectionReservedLayout,
} from "@/lib/adminV2/runtime/contract/types";

export type AdminV2DrawerSectionContract = {
    sectionKey: string;
    surface: AdminV2DrawerSurface;
    canRenderFromSeed: boolean;
    blocksFirstPaint: boolean;
    /** Required for above-fold sections that may mount before full hydrate. */
    reservedLayout?: DrawerSectionReservedLayout;
    /** May mount after coordinated reveal (scroll / post-reveal enrich). */
    belowFoldLazy?: boolean;
    hasRenderableData: (ctx: DrawerSectionRenderContext) => boolean;
    renderReady: (ctx: DrawerSectionRenderContext) => boolean;
    fallbackMode: DrawerSectionFallbackMode;
};

export type DrawerSectionContractValidationIssue = {
    sectionKey: string;
    code: string;
    message: string;
};

/**
 * Registry entries must declare geometry or seed readiness — prevents post-open pop-in.
 */
export function validateDrawerSectionContract(
    contract: AdminV2DrawerSectionContract
): DrawerSectionContractValidationIssue[] {
    const issues: DrawerSectionContractValidationIssue[] = [];
    const key = contract.sectionKey;

    if (!key.trim()) {
        issues.push({ sectionKey: key, code: "empty_key", message: "sectionKey is required" });
    }

    if (contract.blocksFirstPaint && !contract.belowFoldLazy) {
        const hasReserve = Boolean(contract.reservedLayout?.minHeightClass?.trim());
        const seedOk = contract.canRenderFromSeed && contract.fallbackMode !== "block-drawer-reveal";
        if (!hasReserve && !seedOk && contract.fallbackMode !== "hidden") {
            issues.push({
                sectionKey: key,
                code: "above_fold_missing_reserve",
                message:
                    "above-fold section blocksFirstPaint must set reservedLayout, canRenderFromSeed, hidden, or belowFoldLazy",
            });
        }
    }

    if (contract.fallbackMode === "skeleton-inside-reserved-box" && !contract.reservedLayout?.minHeightClass) {
        issues.push({
            sectionKey: key,
            code: "skeleton_reserve_missing_layout",
            message: "skeleton-inside-reserved-box requires reservedLayout.minHeightClass",
        });
    }

    if (contract.belowFoldLazy && contract.blocksFirstPaint && !contract.reservedLayout) {
        issues.push({
            sectionKey: key,
            code: "lazy_needs_collapse_reserve",
            message: "belowFoldLazy above-fold sections should reserve collapsed shell geometry",
        });
    }

    return issues;
}

export function validateDrawerSectionRegistry(
    contracts: readonly AdminV2DrawerSectionContract[]
): DrawerSectionContractValidationIssue[] {
    const seen = new Set<string>();
    const issues: DrawerSectionContractValidationIssue[] = [];
    for (const c of contracts) {
        if (seen.has(c.sectionKey)) {
            issues.push({
                sectionKey: c.sectionKey,
                code: "duplicate_key",
                message: "duplicate sectionKey in registry",
            });
        }
        seen.add(c.sectionKey);
        issues.push(...validateDrawerSectionContract(c));
    }
    return issues;
}

export function evaluateDrawerSectionPlan(
    contract: AdminV2DrawerSectionContract,
    ctx: DrawerSectionRenderContext
): "render" | "reserve" | "block" | "hidden" {
    if (contract.renderReady(ctx) || contract.hasRenderableData(ctx)) {
        return "render";
    }
    if (contract.fallbackMode === "hidden") return "hidden";
    if (contract.fallbackMode === "block-drawer-reveal") return "block";
    if (contract.fallbackMode === "reserved" || contract.fallbackMode === "skeleton-inside-reserved-box") {
        return contract.blocksFirstPaint || contract.canRenderFromSeed ? "reserve" : "hidden";
    }
    return "hidden";
}
