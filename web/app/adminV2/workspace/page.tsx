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

import { PresentationRuntime } from "@/components/presentation/PresentationRuntime";
import { loadOperatorLifecycleLandingSeed } from "@/lib/admin/loadOperatorLifecycleLandingSeed";
import { WorkspaceLandingRouteVmBridge } from "./WorkspaceLandingRouteVmBridge";

export default async function AdminV2WorkspacePage() {
    const lifecycleCards = await loadOperatorLifecycleLandingSeed();
    return (
        <WorkspaceLandingRouteVmBridge lifecycleCards={lifecycleCards}>
            <PresentationRuntime surface="workspace" />
        </WorkspaceLandingRouteVmBridge>
    );
}
