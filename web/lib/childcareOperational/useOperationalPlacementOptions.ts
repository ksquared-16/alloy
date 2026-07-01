"use client";

import { useInquiryChildPlacementCascade } from "@/lib/admin/hooks/useInquiryChildPlacementCascade";

/** Site-scoped program and room options for operational placement edits (fixed site). */
export function useOperationalPlacementOptions(siteLocationId: string, programCategoryId: string) {
    return useInquiryChildPlacementCascade({
        locationValue: siteLocationId,
        programValue: programCategoryId,
        programCategoryId,
    });
}
