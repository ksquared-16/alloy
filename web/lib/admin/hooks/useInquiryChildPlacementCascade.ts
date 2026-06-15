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
    resolveDefaultInquiryChildSiteId,
    resolveProgramsOfferedForSite,
    resolveRoomsForSiteAndProgram,
    type InquiryChildPlacementHierarchyRow,
    type InquiryChildProgramOptionSetItem,
} from "@/lib/admin/location/inquiryChildPlacementOptions";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { WORKSPACE_INQUIRY_CHILD_LOCATIONS_URL } from "@/lib/workspace/workspaceChildcareInquiryOptionSets";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const HIERARCHY_TTL_MS = 1500;

export function useInquiryChildPlacementCascade(params: {
    locationValue: string;
    /** Legacy program type key or category id when category-first mode is active. */
    programValue: string;
    programCategoryId?: string;
    programType?: string;
}): {
    siteOptions: { value: string; label: string }[];
    programOptions: { value: string; label: string }[];
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
                fetchLocationProgramCategories(init, { includeInactive: true }),
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

    const siteId = params.locationValue.trim();
    const programCategoryId = (params.programCategoryId ?? "").trim();
    const programType = (params.programType ?? params.programValue).trim();
    const programFilterKey = useMemo(
        () =>
            resolveProgramKeyForRoomCascade({
                desired_program_category_id: programCategoryId,
                desired_program_type: programType,
                categories: locationCategories,
            }) ?? "",
        [locationCategories, programCategoryId, programType],
    );

    const programOptions = useMemo(
        () => resolveProgramsOfferedForSite(hierarchy, siteId, programItems, locationCategories),
        [hierarchy, siteId, programItems, locationCategories]
    );

    const roomOptions = useMemo(
        () => resolveRoomsForSiteAndProgram(hierarchy, siteId, programFilterKey || undefined),
        [hierarchy, siteId, programFilterKey]
    );

    const defaultSiteId = useMemo(
        () =>
            resolveDefaultInquiryChildSiteId({
                currentSiteId: params.locationValue,
                headerSiteId: siteFilter?.selectedSiteId ?? null,
                siteOptions,
            }),
        [params.locationValue, siteFilter?.selectedSiteId, siteOptions]
    );

    return {
        siteOptions,
        programOptions,
        roomOptions,
        programDisabled: !siteId,
        roomDisabled: !siteId,
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
