"use client";

import { CONFIGURATION_WORKSPACE_ICON_STROKE } from "@/lib/adminV2/configuration/configurationWorkspaceOperatorUi";
import { ChevronDown } from "lucide-react";

type Props = {
    open: boolean;
    onToggle: () => void;
    label?: string;
};

export default function ConfigurationAdvancedToggle({
    open,
    onToggle,
    label = "Advanced",
}: Props) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-alloy-midnight/45 hover:text-alloy-midnight/70"
            data-testid="configuration-advanced-toggle"
            aria-expanded={open}
        >
            {label}
            <ChevronDown
                size={12}
                strokeWidth={CONFIGURATION_WORKSPACE_ICON_STROKE}
                className={open ? "rotate-180 transition-transform" : "transition-transform"}
                aria-hidden
            />
        </button>
    );
}
