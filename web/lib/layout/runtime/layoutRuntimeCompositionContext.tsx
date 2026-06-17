"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Platform composition hints — layout items/sections remain config-owned (see leadOverviewComposition). */
export type LayoutRuntimeCompositionHints = {
    /** Lead overview composition is routing sections into dashboard slots. */
    leadOverviewComposition?: boolean;
    /** Summary-strip children widget shows count/status only. */
    childrenListSummaryOnly?: boolean;
    /** Cap enrollment related-list rows in the centerpiece (+ overflow footer). */
    enrollmentMaxVisibleRows?: number | null;
    /** Flat section chrome inside composition cards. */
    compositionSectionSurface?: boolean;
    /** Prefer layout item metadata compositionPrimaryColumnRefs when grid is tight. */
    enrollmentPrimaryColumnsOnly?: boolean;
    /** Patch 9 — compact summary strip single-row layout. */
    summaryStripCompactRow?: boolean;
    /** Patch 11 — enrollment roster defaults to read mode; edit on explicit row action. */
    enrollmentRosterReadFirst?: boolean;
    /** Patch 12 — premium operating summary cards in strip. */
    leadOperatingSummaryCards?: boolean;
    /** Patch 19 — person relationship workspace summary cards. */
    personOperatingSummaryCards?: boolean;
    /** Patch 21 — connected children card list instead of table in person workspace. */
    personConnectedChildrenCardList?: boolean;
    /** Patch 21 — connected children roster is read-first (no inline edit). */
    personConnectedChildrenReadFirst?: boolean;
    /** Patch 12 — enrollment card list instead of table/grid roster. */
    leadEnrollmentCardList?: boolean;
    /** Phase 5.8 — visual editor + published layout honor LayoutDoc household/contact blocks. */
    honorLayoutDocBlocks?: boolean;
    /** Patch 19 — person overview composition active. */
    personOverviewComposition?: boolean;
    /** Summary-strip connected children widget shows count only. */
    connectedChildrenSummaryOnly?: boolean;
    /** Cap connected children repeater rows in person workspace. */
    connectedChildrenMaxVisibleRows?: number | null;
    /** Prefer layout metadata primary column refs for person connected children. */
    connectedChildrenPrimaryColumnsOnly?: boolean;
    /** Patch 20 — child family card list instead of table in child workspace. */
    childFamilyCardList?: boolean;
    /** Patch 20 — child overview composition active. */
    childOverviewComposition?: boolean;
    /** Experience Builder canvas preview — card title is edited outside runtime chrome. */
    suppressDrawerOverviewSectionHeader?: boolean;
    /** Patch 20 — child enrollment/care summary cards in strip. */
    childOperatingSummaryCards?: boolean;
    /** Summary-strip family widget shows count only. */
    familySummaryOnly?: boolean;
    /** Cap family related-list rows in child workspace. */
    familyMaxVisibleRows?: number | null;
    /** Prefer layout metadata primary column refs for child family table. */
    familyPrimaryColumnsOnly?: boolean;
};

const LayoutRuntimeCompositionContext = createContext<LayoutRuntimeCompositionHints>({});

export function LayoutRuntimeCompositionProvider({
    value,
    children,
}: {
    value: LayoutRuntimeCompositionHints;
    children: ReactNode;
}) {
    return (
        <LayoutRuntimeCompositionContext.Provider value={value}>{children}</LayoutRuntimeCompositionContext.Provider>
    );
}

export function useLayoutRuntimeCompositionHints(): LayoutRuntimeCompositionHints {
    return useContext(LayoutRuntimeCompositionContext);
}
