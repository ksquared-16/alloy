/** Temporary drawer runtime instrumentation — remove after VM path debugging. */

export type DrawerDebugRoute = "legacy" | "opportunity-vm" | "person-vm" | "child-vm";

export type DrawerDebugSurface = "center-modal" | "right-side";

export type DrawerDebugSource = "work-unit" | "workspace" | "other";

export type DrawerDebugStatusComponent =
    | "legacy-dropdown"
    | "vm-readonly-pill"
    | "vm-dropdown"
    | "unknown";

export type DrawerRuntimeDebugInfo = {
    route: DrawerDebugRoute;
    surface: DrawerDebugSurface;
    source: DrawerDebugSource;
    path: string;
    entityType: string | null;
    entityId: string | null;
    statusComponent: DrawerDebugStatusComponent;
};

export function drawerRuntimeDebugEnabled(): boolean {
    if (typeof process === "undefined") return false;
    if (process.env.NODE_ENV === "development") return true;
    const v = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG?.trim().toLowerCase();
    return v === "1" || v === "true";
}

export function drawerDebugSourceFromPathname(pathname: string | null | undefined): DrawerDebugSource {
    const p = String(pathname ?? "").trim();
    if (p.includes("/work-unit/")) return "work-unit";
    if (p.startsWith("/adminV2/workspace")) return "workspace";
    return "other";
}

export function drawerDebugSurfaceFromPresentation(
    presentation: "sidebar" | "modal" | undefined
): DrawerDebugSurface {
    return presentation === "modal" ? "center-modal" : "right-side";
}

export function resolveLegacyDrawerStatusDebugComponent(params: {
    drawerType: string | null;
    opportunityInquiryWorkflow?: boolean;
}): DrawerDebugStatusComponent {
    if (params.drawerType === "opportunities" && params.opportunityInquiryWorkflow) {
        return "legacy-dropdown";
    }
    if (params.drawerType === "persons" || params.drawerType === "locations") {
        return "legacy-dropdown";
    }
    return "unknown";
}

export function formatDrawerRuntimeDebugLine(info: DrawerRuntimeDebugInfo): string {
    const entity =
        info.entityType && info.entityId ? `${info.entityType}:${info.entityId}` : "—";
    return [
        `route=${info.route}`,
        `surface=${info.surface}`,
        `source=${info.source}`,
        `path=${info.path}`,
        `entity=${entity}`,
        `statusComponent=${info.statusComponent}`,
    ].join(" | ");
}
