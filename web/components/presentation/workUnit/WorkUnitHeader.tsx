"use client";

/**
 * Presentation Runtime V2 — WU.HEADER (+ WU.HEADER_CALCULATIONS).
 *
 * Configurable work unit identity and KPI strip. Builder and runtime share
 * `WorkspaceHeader` with variant="work-unit" for grammar parity.
 */

import {
    WorkspaceHeader,
    type WorkspaceHeaderBuilderProps,
} from "@/components/presentation/workspace/WorkspaceHeader";
import type { WorkUnitHeaderPresentationModel } from "@/lib/presentation/runtime/workUnitHeaderSurfaceConfig";

export type WorkUnitHeaderBuilderField = WorkspaceHeaderBuilderProps["activeField"] extends infer F
    ? F
    : never;

export type WorkUnitHeaderBuilderProps = WorkspaceHeaderBuilderProps;

export function WorkUnitHeader({
    model,
    builder,
}: {
    model: WorkUnitHeaderPresentationModel;
    builder?: WorkUnitHeaderBuilderProps;
}) {
    return <WorkspaceHeader model={model} builder={builder} variant="work-unit" />;
}
