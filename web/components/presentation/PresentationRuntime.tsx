"use client";

/**
 * Presentation Runtime V2 — the root of the presentation tree
 * (docs/platform/experience/presentation-runtime-v2.md).
 *
 * Routes mount this and nothing else: `/workspace` → WorkspaceSurface,
 * `/workspace/work-unit/:slug` → WorkUnitSurface (identity provided by the slug route
 * host). Each surface resolves its models through the runtime hooks; everything below
 * this component is pure presentation.
 */

import { WorkspaceSurface } from "@/components/presentation/workspace";
import { WorkUnitSurface } from "@/components/presentation/workUnit";

export type PresentationSurface = "workspace" | "work-unit";

export function PresentationRuntime({ surface }: { surface: PresentationSurface }) {
    if (surface === "work-unit") return <WorkUnitSurface />;
    return <WorkspaceSurface />;
}
