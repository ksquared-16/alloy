import type { LucideIcon } from "lucide-react";
import {
    BarChart3,
    GitBranch,
    LayoutGrid,
    Plug,
    Shield,
    Tags,
    TextCursorInput,
    Workflow,
    Zap,
} from "lucide-react";
import type { ConfigurationModeNavIcon } from "@/lib/adminV2/configurationModeNav";

const ICONS: Record<ConfigurationModeNavIcon, LucideIcon> = {
    processes: Workflow,
    layouts: LayoutGrid,
    fields: TextCursorInput,
    statuses: Tags,
    actions: Zap,
    automation: GitBranch,
    analytics: BarChart3,
    integrations: Plug,
    security: Shield,
};

export function configurationModeNavLucideIcon(icon: ConfigurationModeNavIcon): LucideIcon {
    return ICONS[icon];
}
