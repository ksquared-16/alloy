import type { LucideIcon } from "lucide-react";
import {
    BarChart3,
    Banknote,
    GitBranch,
    LayoutGrid,
    Mail,
    MapPin,
    Plug,
    Shield,
    Tags,
    TextCursorInput,
    Workflow,
} from "lucide-react";
import type { ConfigurationModeNavIcon } from "@/lib/adminV2/configurationModeNav";

const ICONS: Record<ConfigurationModeNavIcon, LucideIcon> = {
    processes: Workflow,
    layouts: LayoutGrid,
    fields: TextCursorInput,
    statuses: Tags,
    automation: GitBranch,
    analytics: BarChart3,
    integrations: Plug,
    security: Shield,
    locations: MapPin,
    communications: Mail,
    financials: Banknote,
};

export function configurationModeNavLucideIcon(icon: ConfigurationModeNavIcon): LucideIcon {
    return ICONS[icon];
}
