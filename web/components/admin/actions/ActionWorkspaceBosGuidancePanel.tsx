"use client";

import type { CreateLeadBosGuidance } from "@/lib/admin/actions/createLeadBosGuidance";
import { ActionWorkspaceBosBanner } from "@/components/admin/actions/ActionWorkspaceBosBanner";

type Props = {
    guidance: CreateLeadBosGuidance;
};

/** Keeps BOS presence during manual entry — guidance only, no workflow changes. */
export function ActionWorkspaceBosGuidancePanel({ guidance }: Props) {
    return (
        <ActionWorkspaceBosBanner title="BOS Guidance" compact>
            <p className="font-medium text-alloy-midnight/85">{guidance.headline}</p>
            {!guidance.ready && guidance.missingItems.length > 0 ?
                <ul
                    className="mt-1.5 space-y-0.5 text-[12px] text-alloy-midnight/70"
                    data-testid="action-workspace-bos-guidance-missing"
                >
                    {guidance.missingItems.map((item) => (
                        <li key={item} className="flex items-center gap-1.5">
                            <span className="text-[#00A283]/70" aria-hidden>
                                ·
                            </span>
                            <span>
                                Missing: <span className="font-medium text-alloy-midnight/85">{item}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            :   null}
            {guidance.advisoryItems.length > 0 ?
                <p
                    className="mt-1.5 text-[12px] text-alloy-midnight/55"
                    data-testid="action-workspace-bos-guidance-advisory"
                >
                    Optional:{" "}
                    <span className="font-medium text-alloy-midnight/65">
                        {guidance.advisoryItems.join(", ")}
                    </span>
                </p>
            :   null}
        </ActionWorkspaceBosBanner>
    );
}
