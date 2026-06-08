"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmSearchResultRow } from "@/app/api/admin/forms/crm-entity-search/route";
import { buildExistingRecordAttachTargetView } from "@/lib/forms/existingRecord/existingRecordFormLaunch";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { opMetadata, opMutedMeta, opSectionTitle } from "@/lib/operational/ui/operationalVisualTokens";

type CreatedLink = {
    embed_url: string | null;
    embed_path: string;
    plaintext_token?: string;
};

type Props = {
    formId: string;
    formName: string;
    canMutate?: boolean;
    /** When set, skip search and send directly to this opportunity. */
    fixedOpportunity?: { id: string; label: string; familyLabel?: string | null } | null;
    compact?: boolean;
};

/** Send a form to an existing opportunity/family — Card 3. */
export function FormExistingRecordSendPanel({
    formId,
    formName,
    canMutate = false,
    fixedOpportunity = null,
    compact = false,
}: Props) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<CrmSearchResultRow[]>([]);
    const [searchBusy, setSearchBusy] = useState(false);
    const [selected, setSelected] = useState<CrmSearchResultRow | null>(
        fixedOpportunity ?
            { id: fixedOpportunity.id, label: fixedOpportunity.label, subtitle: fixedOpportunity.familyLabel ?? null }
        :   null
    );
    const [sendBusy, setSendBusy] = useState(false);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [created, setCreated] = useState<CreatedLink | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (fixedOpportunity) {
            setSelected({
                id: fixedOpportunity.id,
                label: fixedOpportunity.label,
                subtitle: fixedOpportunity.familyLabel ?? null,
            });
        }
    }, [fixedOpportunity]);

    const attachView = useMemo(() => {
        if (!selected) return null;
        return buildExistingRecordAttachTargetView({
            entityType: "opportunity",
            entityLabel: selected.label,
            familyLabel: selected.subtitle?.replace(/^Customer:\s*/i, "") ?? null,
        });
    }, [selected]);

    const search = useCallback(async (q: string) => {
        const token = q.trim();
        if (token.length < 2) {
            setResults([]);
            return;
        }
        setSearchBusy(true);
        try {
            const res = await fetch(
                `/api/admin/forms/crm-entity-search?entity_type=opportunity&q=${encodeURIComponent(token)}`,
                { credentials: "include" }
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setResults([]);
                return;
            }
            setResults((json as { results?: CrmSearchResultRow[] }).results ?? []);
        } finally {
            setSearchBusy(false);
        }
    }, []);

    useEffect(() => {
        if (fixedOpportunity) return;
        const t = setTimeout(() => void search(query), 250);
        return () => clearTimeout(t);
    }, [query, search, fixedOpportunity]);

    const sendForm = async () => {
        if (!selected || !canMutate) return;
        setSendBusy(true);
        setSendErr(null);
        setCreated(null);
        try {
            const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/public-links`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    label: `${formName} · ${selected.label}`,
                    launch_from_entity: {
                        entity_type: "opportunity",
                        entity_id: selected.id,
                    },
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((json as { error?: string }).error ?? "Could not send form");
            }
            const d = (json as { data?: CreatedLink & { embed_url?: string; embed_path?: string } }).data;
            const embedUrl =
                d?.embed_url ??
                (typeof window !== "undefined" && d?.embed_path ? `${window.location.origin}${d.embed_path}` : null);
            setCreated({ embed_url: embedUrl, embed_path: d?.embed_path ?? "", plaintext_token: d?.plaintext_token });
        } catch (e) {
            setSendErr(e instanceof Error ? e.message : "Send failed");
        } finally {
            setSendBusy(false);
        }
    };

    const copyLink = async () => {
        if (!created?.embed_url) return;
        try {
            await navigator.clipboard.writeText(created.embed_url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div
            className={clsx(
                "rounded-lg bg-white/95 ring-1 ring-alloy-midnight/[0.07]",
                compact ? "px-3 py-2.5" : "px-4 py-3"
            )}
            data-testid="form-existing-record-send-panel"
        >
            <h3 className={opSectionTitle}>Send to family</h3>
            <p className={opMutedMeta}>
                Send this form to an existing enrollment inquiry — known fields prefill and the response attaches back.
            </p>

            {!fixedOpportunity ?
                <div className="mt-3 space-y-2">
                    <label className="block space-y-1">
                        <span className="text-xs font-medium text-alloy-midnight">Find enrollment inquiry</span>
                        <input
                            className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm disabled:opacity-50"
                            value={query}
                            disabled={!canMutate}
                            placeholder="Search by family or inquiry name"
                            data-testid="existing-record-opportunity-search"
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </label>
                    {searchBusy ?
                        <p className={opMetadata}>Searching…</p>
                    : results.length > 0 ?
                        <ul className="max-h-36 overflow-y-auto rounded-lg border border-alloy-midnight/10 bg-white">
                            {results.map((row) => (
                                <li key={row.id}>
                                    <button
                                        type="button"
                                        className={clsx(
                                            "w-full px-2.5 py-2 text-left text-sm hover:bg-alloy-stone/10",
                                            selected?.id === row.id && "bg-alloy-blue/10"
                                        )}
                                        data-testid={`existing-record-opportunity-option-${row.id}`}
                                        onClick={() => setSelected(row)}
                                    >
                                        <span className="font-medium text-alloy-midnight">{row.label}</span>
                                        {row.subtitle ?
                                            <span className={clsx("mt-0.5 block", opMutedMeta)}>{row.subtitle}</span>
                                        :   null}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    : query.trim().length >= 2 ?
                        <p className={opMetadata}>No matching inquiries found.</p>
                    :   null}
                </div>
            :   null}

            {attachView && selected ?
                <div className="mt-3 rounded-lg bg-alloy-stone/10 px-3 py-2" data-testid="existing-record-attach-preview">
                    <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/60">After submission</p>
                    <ul className={clsx("mt-1 space-y-0.5", opMetadata)}>
                        {attachView.attachSummaryLines.map((line) => (
                            <li key={line}>· {line}</li>
                        ))}
                    </ul>
                </div>
            :   null}

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    className={intakeWorkspaceBtnPrimary}
                    disabled={!canMutate || !selected || sendBusy}
                    data-testid="existing-record-send-form"
                    onClick={() => void sendForm()}
                >
                    {sendBusy ? "Preparing…" : "Send form"}
                </button>
                {created?.embed_url ?
                    <>
                        <a
                            href={created.embed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={intakeWorkspaceBtnSecondary}
                            data-testid="existing-record-open-form"
                        >
                            Open form
                        </a>
                        <button
                            type="button"
                            className={intakeWorkspaceBtnSecondary}
                            data-testid="existing-record-copy-link"
                            onClick={() => void copyLink()}
                        >
                            {copied ? "Copied" : "Copy link"}
                        </button>
                    </>
                :   null}
            </div>

            {sendErr ?
                <p className="mt-2 text-sm text-alloy-ember" data-testid="existing-record-send-error">
                    {sendErr}
                </p>
            :   null}
        </div>
    );
}
