"use client";

/**
 * Operator workspace landing (`/workspace`) — Presentation Runtime V2.
 *
 * The route mounts the presentation tree and nothing else; the workspace layout owns
 * bootstrap (Route VM, providers, drawer host) and the runtime hooks own data
 * resolution (docs/platform/experience/presentation-runtime-v2.md).
 */

import { PresentationRuntime } from "@/components/presentation/PresentationRuntime";

export default function AdminV2WorkspacePage() {
    return <PresentationRuntime surface="workspace" />;
}
