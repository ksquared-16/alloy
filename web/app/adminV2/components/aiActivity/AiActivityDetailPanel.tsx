"use client";

import type { ReactNode } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import {
    activityStatusWord,
    formatActivityTs,
    shortActivityId,
    type ActivityItem,
} from "@/lib/adminV2/aiActivity/activityTypes";

type Props = {
    selected: ActivityItem;
    techOpen: boolean;
    onToggleTech: () => void;
    footer?: ReactNode;
};

export default function AiActivityDetailPanel(props: Props) {
    const { selected, techOpen, onToggleTech, footer } = props;

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold" style={{ color: neutral.textPrimary }}>
                    {activityStatusWord(selected.status)} · Job overview layout
                </h2>
                <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                        backgroundColor: derived.kpiBandBusinessWash,
                        color: brand.secondary,
                        border: `1px solid ${derived.border}`,
                    }}
                >
                    {selected.agent_domain}
                </span>
            </div>
            <p className="mt-1 text-xs" style={{ color: derived.textSecondary }}>
                {formatActivityTs(selected.created_at)} · {selected.outcome_summary}
            </p>

            <dl className="mt-4 grid gap-2 text-xs" style={{ color: neutral.textPrimary }}>
                <div>
                    <dt className="font-semibold tracking-wide" style={{ color: derived.inspectorSectionMuted }}>
                        Request (command)
                    </dt>
                    <dd className="mt-0.5">
                        {selected.request_text?.trim()
                            ? selected.request_text
                            : "Not stored for this audit row — structured intent only."}
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold tracking-wide" style={{ color: derived.inspectorSectionMuted }}>
                        Target
                    </dt>
                    <dd className="mt-0.5">
                        {selected.target_kind} · {selected.entity_type} · {selected.surface}
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold tracking-wide" style={{ color: derived.inspectorSectionMuted }}>
                        User / org
                    </dt>
                    <dd className="mt-0.5 font-mono text-[11px]">
                        User {shortActivityId(selected.user_id)} · Org {shortActivityId(selected.org_id)}
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold tracking-wide" style={{ color: derived.inspectorSectionMuted }}>
                        IDs
                    </dt>
                    <dd className="mt-0.5 break-all font-mono text-[10px]" style={{ color: derived.textSecondary }}>
                        request {selected.request_id} · correlation {selected.correlation_id}
                    </dd>
                </div>
            </dl>

            <div className="mt-4 border-t pt-3" style={{ borderColor: derived.border }}>
                <button
                    type="button"
                    onClick={onToggleTech}
                    className="flex w-full items-center justify-between text-left text-[11px] font-semibold"
                    style={{ color: derived.inspectorSectionMuted }}
                >
                    <span>Technical details (JSON)</span>
                    <span>{techOpen ? "−" : "+"}</span>
                </button>
                {techOpen ? (
                    <pre
                        className="mt-2 max-h-64 overflow-auto rounded border p-2 font-mono text-[10px] leading-relaxed"
                        style={{
                            borderColor: derived.border,
                            backgroundColor: neutral.background,
                            color: derived.textSecondary,
                        }}
                    >
                        {JSON.stringify(selected.intent_json, null, 2)}
                    </pre>
                ) : null}
            </div>

            {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
    );
}
