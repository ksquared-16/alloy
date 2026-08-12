"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { filterInquiryChildSiteLocationOptions } from "@/lib/admin/drawer/inquiryChildPlacementScope";
import { fetchLocationProgramCategories } from "@/lib/admin/location/fetchLocationProgramCategories";
import {
    fetchOptionSetItemsBySetKey,
} from "@/lib/admin/location/locationDrawerFieldOptions";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { resolveProgramKeyForRoomCascade } from "@/lib/admin/location/inquiryChildLocationMismatch";
import {
    resolveProgramCategoryOptionsForSite,
    resolveProgramsOfferedForSite,
    resolveRoomsForSiteAndProgram,
    resolveDefaultInquiryChildSiteId,
    type InquiryChildPlacementHierarchyRow,
    type InquiryChildProgramOptionSetItem,
} from "@/lib/admin/location/inquiryChildPlacementOptions";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { WORKSPACE_INQUIRY_CHILD_LOCATIONS_URL } from "@/lib/workspace/workspaceChildcareInquiryOptionSets";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const HIERARCHY_TTL_MS = 1500;

/**
 * Warm placement option caches so Program/Room selects open with labels immediately
 * (Children card / Focus Panel mount). Safe to call repeatedly — TTL dedupe joins inflight.
 */
export function prefetchInquiryChildPlacementCascade(): void {
    if (typeof window === "undefined") return;
    const init = workspaceDataFetchInit();
    void dedupeAdminFetchWithTtl(WORKSPACE_INQUIRY_CHILD_LOCATIONS_URL, init, HIERARCHY_TTL_MS);
    void fetchOptionSetItemsBySetKey("childcare_program_type", init);
    void fetchLocationProgramCategories(init, { includeInactive: true }).catch(
        () => [] as LocationProgramCategoryRow[],
    );
}

export function useInquiryChildPlacementCascade(params: {
    locationValue: string;
    /**
     * Program picker value: `location_program_categories.id` for OCM-persisting selects,
     * or the stable program key for create_lead flows (`child_program`, FK resolved at persist).
     */
    programValue: string;
    programCategoryId?: string;
}): {
    siteOptions: { value: string; label: string }[];
    /** Stable program keys — create_lead / key-valued flows. */
    programOptions: { value: string; label: string }[];
    /** `location_program_categories.id` values — OCM / Focus Panel Program edits. */
    programCategoryIdOptions: { value: string; label: string }[];
    roomOptions: { value: string; label: string }[];
    programDisabled: boolean;
    roomDisabled: boolean;
    loading: boolean;
    defaultSiteId: string | null;
    siteSelectionReady: boolean;
} {
    const siteFilter = useWorkspaceSiteFilter();
    const [hierarchy, setHierarchy] = useState<InquiryChildPlacementHierarchyRow[]>([]);
    const [programItems, setProgramItems] = useState<InquiryChildProgramOptionSetItem[]>([]);
    const [locationCategories, setLocationCategories] = useState<LocationProgramCategoryRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        void (async () => {
            const init = workspaceDataFetchInit();
            const [locRes, items, categories] = await Promise.all([
                dedupeAdminFetchWithTtl(WORKSPACE_INQUIRY_CHILD_LOCATIONS_URL, init, HIERARCHY_TTL_MS),
                fetchOptionSetItemsBySetKey("childcare_program_type", init),
                fetchLocationProgramCategories(init, { includeInactive: true }).catch(
                    () => [] as LocationProgramCategoryRow[],
                ),
            ]);
            if (cancelled) return;

            const locJson = (await locRes.json().catch(() => ({}))) as { locations?: InquiryChildPlacementHierarchyRow[] };
            setHierarchy(Array.isArray(locJson.locations) ? locJson.locations : []);
            setProgramItems(items as InquiryChildProgramOptionSetItem[]);
            setLocationCategories(categories);
            setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const siteOptions = useMemo(() => {
        const bootstrapSites = siteFilter?.bootstrap?.sites ?? [];
        if (bootstrapSites.length > 0) {
            return bootstrapSites.map((s) => ({ value: s.id, label: s.label }));
        }
        return filterInquiryChildSiteLocationOptions(hierarchy).map((s) => ({
            value: s.id,
            label: s.label,
        }));
    }, [siteFilter?.bootstrap?.sites, hierarchy]);

    const defaultSiteId = useMemo(
        () =>
            resolveDefaultInquiryChildSiteId({
                currentSiteId: params.locationValue,
                headerSiteId: siteFilter?.selectedSiteId ?? null,
                siteOptions,
            }),
        [params.locationValue, siteFilter?.selectedSiteId, siteOptions]
    );

    // Prefer explicit child/lead site; otherwise workspace / single-site default so Program
    // options still resolve when Create Lead only set opportunity.location_id.
    const siteId = params.locationValue.trim() || defaultSiteId || "";
    const programCategoryId = (params.programCategoryId ?? "").trim();
    const programValue = params.programValue.trim();
    const programFilterKey = useMemo(() => {
        const fromCategory = resolveProgramKeyForRoomCascade({
            program_category_id: programCategoryId || programValue,
            categories: locationCategories,
        });
        if (fromCategory) return fromCategory;
        // create_lead flows carry the stable program key directly (child_program).
        return programCategoryId ? "" : programValue;
    }, [locationCategories, programCategoryId, programValue]);

    const programOptions = useMemo(
        () => resolveProgramsOfferedForSite(hierarchy, siteId, programItems, locationCategories),
        [hierarchy, siteId, programItems, locationCategories]
    );

    const programCategoryIdOptions = useMemo(
        () => resolveProgramCategoryOptionsForSite(siteId, locationCategories),
        [siteId, locationCategories],
    );

    const roomOptions = useMemo(
        () => resolveRoomsForSiteAndProgram(hierarchy, siteId, programFilterKey || undefined),
        [hierarchy, siteId, programFilterKey]
    );

    return {
        siteOptions,
        programOptions,
        programCategoryIdOptions,
        roomOptions,
        // Keep the control interactive while options resolve (site may come from
        // workspace default after hierarchy load). Disable only once we know there is no site.
        programDisabled: !loading && !siteId,
        roomDisabled: !loading && !siteId,
        loading,
        defaultSiteId,
        siteSelectionReady: siteFilter?.siteSelectionReady ?? true,
    };
}

/** Auto-select header/single-site default when location is empty. */
export function useInquiryChildPlacementDefaultSite(params: {
    locationFieldKey: string | null;
    locationValue: string;
    defaultSiteId: string | null;
    siteSelectionReady: boolean;
    onSelectSite: (siteId: string) => void;
}): void {
    const { locationFieldKey, locationValue, defaultSiteId, siteSelectionReady, onSelectSite } = params;

    useEffect(() => {
        if (!locationFieldKey) return;
        if (!siteSelectionReady) return;
        if (locationValue.trim()) return;
        if (!defaultSiteId) return;
        onSelectSite(defaultSiteId);
    }, [locationFieldKey, locationValue, defaultSiteId, siteSelectionReady, onSelectSite]);
}
