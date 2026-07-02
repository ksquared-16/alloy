"use client";

import { useMemo } from "react";
import {
    useLayoutRuntimeOptionSetLoader,
    useLayoutRuntimePlacementData,
} from "@/components/layout/LayoutRuntimePlacementDataProvider";
import {
    resolveLayoutRuntimeFieldDisplayLabel,
    resolveLayoutRuntimeSelectOptionLabel,
} from "@/lib/layout/runtime/resolveLayoutRuntimeFieldDisplayLabel";
import { resolveLayoutRuntimeFieldControl } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldControl";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function selectOptionsForRefKey(
    refKey: string,
    control: ReturnType<typeof resolveLayoutRuntimeFieldControl>,
    placementData: ReturnType<typeof useLayoutRuntimePlacementData>,
    optionSetOptions: { value: string; label: string }[],
    record?: ProofRuntimeRecord,
): { value: string; label: string }[] {
    if (control.option_source === "locations") return placementData?.siteOptions ?? [];
    if (control.option_source === "programs_for_location") {
        const locationId =
            String(record?.["inquiry_child.location_id"] ?? record?.location_id ?? "").trim();
        return placementData?.programOptionsForSite(locationId) ?? [];
    }
    if (control.option_source === "rooms_for_location_program") {
        const locationId =
            String(record?.["inquiry_child.location_id"] ?? record?.location_id ?? "").trim();
        const programCategoryId =
            String(record?.["inquiry_child.program_category_id"] ?? record?.program_category_id ?? "").trim();
        const programKey = placementData?.resolveRoomProgramFilterKey(programCategoryId) ?? "";
        return placementData?.roomOptionsForSiteAndProgram(locationId, programKey) ?? [];
    }
    if (control.option_source === "enrollment_child_status") {
        return placementData?.enrollmentChildStatusOptions ?? [];
    }
    if (control.option_source === "option_set") return optionSetOptions;
    void refKey;
    return [];
}

/** Client display label — resolves option catalogs for id-backed select fields. */
export function useLayoutRuntimeResolvedDisplayLabel(input: {
    refKey: string;
    rawValue: string;
    record?: ProofRuntimeRecord;
    row?: ProofRuntimeRecord;
    anchorRecord?: ProofRuntimeRecord;
    renderHint?: string | null;
}): string {
    const control = resolveLayoutRuntimeFieldControl(input.refKey);
    const placementData = useLayoutRuntimePlacementData();
    const optionSetOptions = useLayoutRuntimeOptionSetLoader(control.option_set_key);
    const sourceRecord = input.row ?? input.record;

    return useMemo(() => {
        const base = resolveLayoutRuntimeFieldDisplayLabel({
            refKey: input.refKey,
            rawValue: input.rawValue,
            record: input.record,
            row: input.row,
            anchorRecord: input.anchorRecord,
            renderHint: input.renderHint,
        });
        if (base !== input.rawValue.trim()) return base;

        if (control.controlType !== "select") return base;

        const options = selectOptionsForRefKey(
            input.refKey,
            control,
            placementData,
            optionSetOptions,
            sourceRecord,
        );
        return resolveLayoutRuntimeSelectOptionLabel(input.rawValue, options);
    }, [
        control,
        input.rawValue,
        input.refKey,
        input.record,
        input.row,
        input.renderHint,
        optionSetOptions,
        placementData,
        input.anchorRecord,
        sourceRecord,
    ]);
}

export function layoutRuntimeCompanionDisplayRefKey(editableRefKey: string): string | null {
    const map: Record<string, string> = {
        "inquiry_child.location_id": "child.location",
        "inquiry_child.program_category_id": "child.program",
        "inquiry_child.program_room_cohort_key": "child.room",
        "inquiry_child.schedule_type": "child.schedule",
        "inquiry_child.outcome_status_key": "child.status",
        "opportunity.location_id": "opportunity.location",
    };
    return map[editableRefKey] ?? null;
}

export function layoutRuntimeOnPickOptionCompanion(
    editableRefKey: string,
    label: string,
    setFieldValue: (refKey: string, value: string, rowKey?: string) => void,
    rowKey?: string,
): void {
    const companion = layoutRuntimeCompanionDisplayRefKey(editableRefKey);
    if (!companion || !label.trim()) return;
    setFieldValue(companion, label.trim(), rowKey);
}
