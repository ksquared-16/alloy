import type {
    GlobalAssistantEntityContext,
    GlobalAssistantWorkspaceScope,
} from "@/contexts/GlobalAssistantContext";

/** Operator-facing entity prefix for opportunity operational context chip. */
export function bosOpportunityContextKindPrefix(opportunitySingular: string): string {
    const singular = opportunitySingular.trim();
    if (!singular || singular === "Opportunity" || singular === "Inquiry") return "Lead";
    return singular;
}

/** Resolve the visible BOS context line for command surface / rail overlay. */
export function resolveBosCommandSurfaceContextLabel(args: {
    currentContext: GlobalAssistantEntityContext | null;
    workspaceScope: GlobalAssistantWorkspaceScope | null;
    surfaceOperationalLabel: string | null;
    opportunitySingular?: string;
}): string | null {
    const surface = args.surfaceOperationalLabel?.trim();
    if (surface) return surface;

    const ctx = args.currentContext;
    if (ctx?.label?.trim()) {
        const label = ctx.label.trim();
        if (label.includes(" — ")) return label;
        if (ctx.entity_type === "opportunities") {
            const prefix = bosOpportunityContextKindPrefix(args.opportunitySingular ?? "Lead");
            return `${prefix} — ${label}`;
        }
        return label;
    }

    const workUnitName = args.workspaceScope?.work_unit_name?.trim();
    if (workUnitName) return `Work Unit — ${workUnitName}`;

    const departmentName = args.workspaceScope?.department_name?.trim();
    if (departmentName) return `Department — ${departmentName}`;

    return null;
}
