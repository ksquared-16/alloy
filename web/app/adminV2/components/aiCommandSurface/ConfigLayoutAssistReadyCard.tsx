"use client";

import {
    CommandSurfaceActionCardShell,
    CommandSurfaceCardLink,
} from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink";
import { configProposalReviewHrefForId } from "@/lib/agent/configLayoutAssist/configLayoutAssistReviewNavigation";
import type { ConfigLayoutAssistReadySummaryV1 } from "@/lib/agent/configLayoutAssist/configLayoutAssistFieldSetup";
import { brand, derived, neutral } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

export function ConfigLayoutAssistReadyCard({
    readySummary,
    persistedProposalId,
    busy,
    canApproveAndApply,
    onApproveAndApply,
}: {
    readySummary: ConfigLayoutAssistReadySummaryV1;
    persistedProposalId: string;
    busy: boolean;
    canApproveAndApply: boolean;
    onApproveAndApply: () => void;
}) {
    const reviewHref = configProposalReviewHrefForId(persistedProposalId);

    return (
        <CommandSurfaceActionCardShell data-command-surface-config-assist-ready="true">
            <p className="text-[13px] font-semibold" style={{ color: CMD.textBody }}>
                Ready to apply
            </p>
            <p className="mt-1 text-[12px]" style={{ color: CMD.textSupporting }}>
                Your proposal is saved. Review the summary below, then apply when you are ready.
            </p>

            <dl className="mt-3 space-y-2 text-[12px]">
                <Row label="Field" value={readySummary.field_name} />
                <Row label="Type" value={readySummary.field_type_label} />
                <Row label="Required" value={readySummary.required_label} />
                <Row label="Appears in" value={readySummary.section_label} />
            </dl>

            <p
                className="mt-3 rounded border px-2 py-1.5 text-[11px]"
                style={{ borderColor: derived.border, color: CMD.textSupporting }}
            >
                No changes are live until you approve and apply.
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {canApproveAndApply ? (
                    <button
                        type="button"
                        disabled={busy}
                        className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                        style={{ backgroundColor: brand.secondary }}
                        data-command-surface-config-assist-approve-apply="true"
                        onClick={() => onApproveAndApply()}
                    >
                        {busy ? "Working…" : "Approve & apply"}
                    </button>
                ) : (
                    <p className="text-[11px] text-alloy-midnight/55">
                        Approve and apply require configuration assist permissions for your role.
                    </p>
                )}
                <CommandSurfaceCardLink
                    href={reviewHref}
                    className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-[12px] font-semibold"
                    style={{ borderColor: derived.border, color: CMD.textBody }}
                    data-command-surface-config-assist-advanced-review="true"
                >
                    View advanced review
                </CommandSurfaceCardLink>
            </div>
        </CommandSurfaceActionCardShell>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-2">
            <dt style={{ color: CMD.textLabel }}>{label}</dt>
            <dd className="font-medium" style={{ color: CMD.textBody }}>
                {value}
            </dd>
        </div>
    );
}
