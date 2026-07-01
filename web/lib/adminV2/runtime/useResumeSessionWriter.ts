"use client";

import { useEffect } from "react";

import {
    readOperatorScrollTop,
    writeResumeSession,
    type ResumeSessionScope,
    type ResumeSubjectEntityType,
} from "@/lib/adminV2/runtime/resumeSession";

type Params = {
    enabled: boolean;
    scope: ResumeSessionScope;
    workUnitSlug: string | null;
    workUnitName: string | null;
    departmentId: string | null;
    workUnitId: string | null;
    laneKey: string | null;
    laneLabel: string | null;
    perspectiveKey: string | null;
    subjectEntityId: string | null;
    subjectEntityType: ResumeSubjectEntityType | null;
    subjectLabel: string | null;
    focusPanelMode: string | null;
};

/**
 * Records a resume snapshot whenever the operator is working a subject inside a work unit.
 * Purely additive (writes sessionStorage) — does not gate reveal, cache, or queue behavior.
 * The bare-/workspace affordance reads this later; URL still wins on arrival.
 */
export function useResumeSessionWriter(params: Params): void {
    const {
        enabled,
        scope,
        workUnitSlug,
        workUnitName,
        departmentId,
        workUnitId,
        laneKey,
        laneLabel,
        perspectiveKey,
        subjectEntityId,
        subjectEntityType,
        subjectLabel,
        focusPanelMode,
    } = params;

    useEffect(() => {
        if (!enabled) return;
        if (!workUnitSlug || !workUnitId) return;
        // Only snapshot once an operational subject is open — that is the resumable position.
        if (!subjectEntityId) return;

        writeResumeSession(scope, {
            workUnitSlug,
            workUnitName,
            departmentId,
            workUnitId,
            laneKey,
            laneLabel,
            perspectiveKey,
            subjectEntityId,
            subjectEntityType,
            subjectLabel,
            focusPanelMode,
            queueScrollTop: readOperatorScrollTop(),
        });
    }, [
        enabled,
        scope,
        workUnitSlug,
        workUnitName,
        departmentId,
        workUnitId,
        laneKey,
        laneLabel,
        perspectiveKey,
        subjectEntityId,
        subjectEntityType,
        subjectLabel,
        focusPanelMode,
    ]);
}
