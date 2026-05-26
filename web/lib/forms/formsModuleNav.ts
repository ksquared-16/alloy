import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";

/** Forms module primary navigation (OW-1). */
export const FORMS_MODULE_ROUTES = {
    workspace: ADMIN_FORMS_UI_BASE,
    packetDefinitions: `${ADMIN_FORMS_UI_BASE}/packet-definitions`,
    packetSessions: `${ADMIN_FORMS_UI_BASE}/packets`,
    submissionsHub: `${ADMIN_FORMS_UI_BASE}/submissions`,
} as const;

export type FormsModuleNavKey = "workspace" | "packets" | "sessions" | "submissions";

export type FormsModuleNavItem = {
    key: FormsModuleNavKey;
    label: string;
    href: string;
    description: string;
};

export const FORMS_MODULE_NAV_ITEMS: FormsModuleNavItem[] = [
    {
        key: "workspace",
        label: "Workspace",
        href: FORMS_MODULE_ROUTES.workspace,
        description: "Intake command surface — forms, health, and review entry",
    },
    {
        key: "packets",
        label: "Packets",
        href: FORMS_MODULE_ROUTES.packetDefinitions,
        description: "Multi-step intake orchestration definitions",
    },
    {
        key: "sessions",
        label: "Sessions",
        href: FORMS_MODULE_ROUTES.packetSessions,
        description: "Packet runs awaiting or after family completion",
    },
    {
        key: "submissions",
        label: "Submissions",
        href: FORMS_MODULE_ROUTES.submissionsHub,
        description: "Standalone and packet step submissions across forms",
    },
];

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolve active module nav key from pathname (App Router).
 */
export function resolveFormsModuleNavKey(pathname: string): FormsModuleNavKey | null {
    const base = ADMIN_FORMS_UI_BASE;
    if (!pathname.startsWith(base)) return null;

    const rest = pathname.slice(base.length) || "/";
    if (rest === "/" || rest === "") return "workspace";

    if (rest.startsWith("/packet-definitions")) return "packets";
    if (rest.startsWith("/packets")) return "sessions";
    if (rest.startsWith("/submissions")) return "submissions";

    const segments = rest.split("/").filter(Boolean);
    if (segments.length >= 2 && segments[1] === "submissions") return "submissions";
    if (segments.length === 1 && UUID_SEGMENT.test(segments[0]!)) return "workspace";

    return "workspace";
}

export type FormsBreadcrumbItem = {
    label: string;
    href?: string;
};

export function formsWorkspaceBreadcrumbs(
    items: FormsBreadcrumbItem[]
): FormsBreadcrumbItem[] {
    return [{ label: "Intake operations", href: FORMS_MODULE_ROUTES.workspace }, ...items];
}
