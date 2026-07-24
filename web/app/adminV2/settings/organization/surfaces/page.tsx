import SurfacesPublicationWorkspace from "@/components/adminV2/settings/surfaces/SurfacesPublicationWorkspace";
import type { SurfaceConfigSectionKey } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import type { SurfaceWorkspaceTab } from "@/lib/adminV2/settings/surfaces/surfacesNavigationModel";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{
        section?: string | string[];
        editor?: string | string[];
        layout?: string | string[];
        tab?: string | string[];
    }>;
};

const SURFACE_SECTIONS = new Set<string>([
    "focus-panels",
    "queue-rows",
    "workspaces",
    "work-units",
    "operational-intelligence",
]);

const SURFACE_WORKSPACE_TABS = new Set<string>([
    "edit",
    "assignments",
    "versions",
    "health",
    "history",
]);

function firstOf(value: string | string[] | undefined): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === "string" ? raw.trim() : undefined;
}

function asSurfaceSection(value: string): SurfaceConfigSectionKey | null {
    return SURFACE_SECTIONS.has(value) ? (value as SurfaceConfigSectionKey) : null;
}

function asSurfaceWorkspaceTab(value: string): SurfaceWorkspaceTab | null {
    return SURFACE_WORKSPACE_TABS.has(value) ? (value as SurfaceWorkspaceTab) : null;
}

/** Canonical Organization Surfaces entry — `/organization/surfaces`. */
export default async function OrganizationSurfacesPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const sectionRaw = firstOf(resolved.section)?.toLowerCase() ?? "";
    const section = asSurfaceSection(sectionRaw);
    const layoutId = firstOf(resolved.layout);
    const hasEditorParam = Boolean(firstOf(resolved.editor));
    const tabRaw = firstOf(resolved.tab)?.toLowerCase() ?? "";
    const requestedTab = asSurfaceWorkspaceTab(tabRaw);
    const initialTab: SurfaceWorkspaceTab | undefined = hasEditorParam ? "edit" : requestedTab ?? undefined;
    const effectiveSection =
        section ?? (layoutId || hasEditorParam ? ("focus-panels" as const) : null);

    return (
        <SurfacesPublicationWorkspace
            initialSection={effectiveSection}
            initialSurfaceId={layoutId}
            initialTab={initialTab}
        />
    );
}
