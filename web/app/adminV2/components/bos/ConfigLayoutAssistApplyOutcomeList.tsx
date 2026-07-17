"use client";

import { CommandSurfaceCardLink } from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink";
import type { ConfigAssistApplyOutcomePresentation } from "@/lib/agent/configLayoutAssist/configLayoutAssistApplyPresentation";
import { neutral } from "@/styles/tokens/colors";

const STATUS_LABEL: Record<ConfigAssistApplyOutcomePresentation["rows"][number]["status"], string> = {
    applied: "Applied",
    skipped: "Skipped",
    failed: "Failed",
    unverified: "Needs review",
};

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

export function ConfigLayoutAssistApplyOutcomeList({
    outcome,
    showIntegrityLink = true,
}: {
    outcome: ConfigAssistApplyOutcomePresentation;
    showIntegrityLink?: boolean;
}) {
    return (
        <div className="space-y-2" data-config-assist-apply-outcome="true">
            <p className="text-[11px] font-semibold" style={{ color: CMD.textBody }}>
                {outcome.headline} — {outcome.summary}
            </p>
            {outcome.rows.length > 0 ?
                <ul className="space-y-1 border-t border-alloy-stone/15 pt-1.5">
                    {outcome.rows.map((row) => (
                        <li key={row.operationId} className="text-[10px] leading-snug">
                            <div className="flex items-baseline justify-between gap-2">
                                <span style={{ color: CMD.textBody }}>{row.label}</span>
                                <span className="shrink-0 font-medium" style={{ color: CMD.textSupporting }}>
                                    {STATUS_LABEL[row.status]}
                                </span>
                            </div>
                            {row.detail ?
                                <p className="mt-0.5 pl-0" style={{ color: CMD.textLabel }}>
                                    {row.detail}
                                </p>
                            :   null}
                        </li>
                    ))}
                </ul>
            :   null}
            {showIntegrityLink && outcome.showLayoutIntegrityLink ?
                <CommandSurfaceCardLink
                    href="/admin/settings/layouts"
                    className="inline-block text-[10px] font-semibold text-alloy-blue hover:underline"
                    data-config-assist-layout-integrity-link="true"
                >
                    Check layout integrity in Configuration → Layouts
                </CommandSurfaceCardLink>
            :   null}
        </div>
    );
}
