"use client";

import { useMemo, useState } from "react";
import { COMMS_CARD_CLASS, COMMS_INPUT_CLASS, COMMS_SECTION_TITLE_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";
import {
    COMMUNICATION_TOKEN_GROUP_LABELS,
    filterCommunicationTokens,
    listCommunicationTokensByGroup,
} from "@/lib/communications/v2/templateTokens";

type Props = {
    onInsert: (path: string) => void;
};

export default function TemplateTokenPickerPanel({ onInsert }: Props) {
    const [query, setQuery] = useState("");
    const groups = useMemo(
        () => (query.trim() ? filterCommunicationTokens(query) : listCommunicationTokensByGroup()),
        [query]
    );

    return (
        <div data-template-token-picker="true" className={`${COMMS_CARD_CLASS} !p-2.5`}>
            <div className="mb-2 border-b border-alloy-stone/22 pb-1.5">
                <div className={COMMS_SECTION_TITLE_CLASS}>Insert token</div>
            </div>
            <input
                type="search"
                data-token-search="true"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tokens…"
                aria-label="Search tokens"
                className={`${COMMS_INPUT_CLASS} mb-2`}
            />
            <div className="flex max-h-[min(18rem,42vh)] flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
                {groups.map(({ group, tokens }) => (
                    <div key={group}>
                        <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                            {COMMUNICATION_TOKEN_GROUP_LABELS[group] ?? group}
                        </div>
                        <div className="flex flex-col gap-1">
                            {tokens.map((t) => (
                                <button
                                    key={t.path}
                                    type="button"
                                    data-token-path={t.path}
                                    onClick={() => onInsert(t.path)}
                                    title={`{{${t.path}}}`}
                                    className="flex items-start justify-between gap-2 rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.03] px-2 py-1.5 text-left hover:border-alloy-juniper/35 hover:bg-alloy-juniper/5"
                                >
                                    <span className="text-[11px] font-medium text-alloy-midnight/85">{t.label}</span>
                                    <code className="shrink-0 text-[9px] text-alloy-midnight/45">{`{{${t.path}}}`}</code>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
                {groups.length === 0 ? <div className="text-[10px] text-alloy-midnight/45">No tokens match.</div> : null}
            </div>
        </div>
    );
}
