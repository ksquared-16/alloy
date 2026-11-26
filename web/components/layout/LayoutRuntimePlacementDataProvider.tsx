"use client";

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { filterInquiryChildSiteLocationOptions } from "@/lib/admin/drawer/inquiryChildPlacementScope";
import { fetchLocationProgramCategories } from "@/lib/admin/location/fetchLocationProgramCategories";
import {
    fetchOptionSetItemsBySetKey,
    mapOptionItemsToSelectOptions,
} from "@/lib/admin/location/locationDrawerFieldOptions";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import {
    resolveProgramsOfferedForSite,
    resolveRoomsForSiteAndProgram,
    type InquiryChildPlacementHierarchyRow,
    type InquiryChildProgramOptionSetItem,
} from "@/lib/admin/location/inquiryChildPlacementOptions";
import { resolveProgramKeyForRoomCascade } from "@/lib/admin/location/inquiryChildLocationMismatch";
import { ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { WORKSPACE_INQUIRY_CHILD_LOCATIONS_URL } from "@/lib/workspace/workspaceChildcareInquiryOptionSets";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type LayoutRuntimeSelectOption = { value: string; label: string };

type LayoutRuntimePlacementDataContextValue = {
    loading: boolean;
    siteOptions: LayoutRuntimeSelectOption[];
    programOptionsForSite: (siteId: string) => LayoutRuntimeSelectOption[];
    roomOptionsForSiteAndProgram: (siteId: string, programKey: string) => LayoutRuntimeSelectOption[];
    resolveRoomProgramFilterKey: (programCategoryId: string) => string;
    scheduleOptions: LayoutRuntimeSelectOption[];
    enrollmentChildStatusOptions: LayoutRuntimeSelectOption[];
    optionSetOptions: (setKey: string) => LayoutRuntimeSelectOption[];
};

const LayoutRuntimePlacementDataContext = createContext<LayoutRuntimePlacementDataContextValue | null>(null);

const HIERARCHY_TTL_MS = 1500;

export function useLayoutRuntimePlacementData(): LayoutRuntimePlacementDataContextValue | null {
    return useContext(LayoutRuntimePlacementDataContext);
}

export default function LayoutRuntimePlacementDataProvider({ children }: { children: ReactNode }) {
    const siteFilter = useWorkspaceSiteFilter();
    const [hierarchy, setHierarchy] = useState<InquiryChildPlacementHierarchyRow[]>([]);
    const [programItems, setProgramItems] = useState<InquiryChildProgramOptionSetItem[]>([]);
    const [locationCategories, setLocationCategories] = useState<LocationProgramCategoryRow[]>([]);
    const [scheduleOptions, setScheduleOptions] = useState<LayoutRuntimeSelectOption[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        void (async () => {
            const init = workspaceDataFetchInit();
            const [locRes, programItemsRaw, scheduleItems, categories] = await Promise.all([
                dedupeAdminFetchWithTtl(WORKSPACE_INQUIRY_CHILD_LOCATIONS_URL, init, HIERARCHY_TTL_MS),
                fetchOptionSetItemsBySetKey("childcare_program_type", init),
                fetchOptionSetItemsBySetKey("childcare_schedule_type", init),
                fetchLocationProgramCategories(init, { includeInactive: true }).catch(
                    () => [] as LocationProgramCategoryRow[],
                ),
            ]);
            if (cancelled) return;

            const locJson = (await locRes.json().catch(() => ({}))) as { locations?: InquiryChildPlacementHierarchyRow[] };
            setHierarchy(Array.isArray(locJson.locations) ? locJson.locations : []);
            setProgramItems(programItemsRaw as InquiryChildProgramOptionSetItem[]);
            setLocationCategories(categories);
            setScheduleOptions(mapOptionItemsToSelectOptions(scheduleItems));
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

    const enrollmentChildStatusOptions = useMemo(
        (): LayoutRuntimeSelectOption[] =>
            ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY.map((row) => ({
                value: row.status_key,
                label: row.status_label,
            })),
        [],
    );

    const value = useMemo(
        (): LayoutRuntimePlacementDataContextValue => ({
            loading,
            siteOptions,
            programOptionsForSite: (siteId: string) =>
                resolveProgramsOfferedForSite(hierarchy, siteId, programItems, locationCategories),
            roomOptionsForSiteAndProgram: (siteId: string, programKey: string) =>
                resolveRoomsForSiteAndProgram(hierarchy, siteId, programKey || undefined),
            resolveRoomProgramFilterKey: (programCategoryId: string) =>
                resolveProgramKeyForRoomCascade({
                    program_category_id: programCategoryId,
                    categories: locationCategories,
                }) ?? "",
            scheduleOptions,
            enrollmentChildStatusOptions,
            optionSetOptions: (setKey: string) => {
                const k = setKey.trim();
                if (!k) return [];
                if (k === "childcare_schedule_type") return scheduleOptions;
                return [];
            },
        }),
        [enrollmentChildStatusOptions, hierarchy, loading, programItems, locationCategories, scheduleOptions, siteOptions],
    );

    return (
        <LayoutRuntimePlacementDataContext.Provider value={value}>
            {children}
        </LayoutRuntimePlacementDataContext.Provider>
    );
}

/** Fetch one option set into cache on demand. */
export function useLayoutRuntimeOptionSetLoader(setKey: string | null | undefined): LayoutRuntimeSelectOption[] {
    const ctx = useLayoutRuntimePlacementData();
    const key = (setKey ?? "").trim();
    const [options, setOptions] = useState<LayoutRuntimeSelectOption[]>([]);

    useEffect(() => {
        if (!key || key === "childcare_schedule_type") {
            setOptions(ctx?.scheduleOptions ?? []);
            return undefined;
        }
        if (ctx && ctx.optionSetOptions(key).length > 0) {
            setOptions(ctx.optionSetOptions(key));
            return undefined;
        }

        let cancelled = false;
        void (async () => {
            const items = await fetchOptionSetItemsBySetKey(key, workspaceDataFetchInit());
            if (cancelled) return;
            setOptions(mapOptionItemsToSelectOptions(items));
        })();

        return () => {
            cancelled = true;
        };
    }, [ctx, key]);

    return options;
}
