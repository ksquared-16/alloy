"use client";

import type { ReactNode } from "react";

/**
 * @deprecated Site filter provider is app-shell-owned in `AdminV2Shell` via `WorkspaceSiteFilterProvider`.
 * This gate is a passthrough for legacy imports only.
 */
export default function WorkspaceSiteFilterGate({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
