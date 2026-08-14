/**
 * Operator workspace landing (`/workspace`) — Presentation Runtime V2.
 *
 * The route mounts the presentation tree; the workspace layout owns bootstrap (Route VM **context**,
 * providers, drawer host) and the runtime hooks own data resolution
 * (docs/platform/experience/presentation-runtime-v2.md).
 *
 * This landing page also loads its own `lifecycleCards` first-paint seed server-side and merges it
 * into the layout's Route VM (via `WorkspaceLandingRouteVmBridge`). That load lives HERE, in the
 * landing route — not in the shared `/workspace` layout — so work-unit routes that share the layout
 * never pay ~600 ms of dead-weight DB work for a landing-only seed they do not consume.
 */

import { Suspense } from "react";

import { PresentationRuntime } from "@/components/presentation/PresentationRuntime";
import WorkspaceModalDeepLink from "@/components/admin/workspace/WorkspaceModalDeepLink";
import { loadOperatorLifecycleLandingSeed } from "@/lib/admin/loadOperatorLifecycleLandingSeed";
import { WorkspaceLandingRouteVmBridge } from "./WorkspaceLandingRouteVmBridge";

export default async function AdminV2WorkspacePage() {
    const lifecycleCards = await loadOperatorLifecycleLandingSeed();
    return (
        <WorkspaceLandingRouteVmBridge lifecycleCards={lifecycleCards}>
            {/* `?workspace=records&section=staff` — how a link from OUTSIDE the shell names a
                workspace modal, which is shell state rather than a route. Suspense-wrapped because
                `useSearchParams` opts the subtree into client rendering. */}
            <Suspense fallback={null}>
                <WorkspaceModalDeepLink />
            </Suspense>
            <PresentationRuntime surface="workspace" />
        </WorkspaceLandingRouteVmBridge>
    );
}
