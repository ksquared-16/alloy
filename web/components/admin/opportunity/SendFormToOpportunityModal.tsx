"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildExistingRecordAttachTargetView } from "@/lib/forms/existingRecord/existingRecordFormLaunch";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";

type FormRow = { id: string; name: string; key: string; is_active?: boolean };

type CreatedLink = {
    embed_url: string | null;
    embed_path: string;
};

type Props = {
    open: boolean;
    onDismiss: () => void;
    opportunityId: string;
    opportunityLabel: string;
    familyLabel?: string | null;
    canMutate: boolean;
    onSent?: () => void;
};

/** Opportunity drawer — pick a form and send to existing family (Card 3). */
export default function SendFormToOpportunityModal({
    open,
    onDismiss,
    opportunityId,
    opportunityLabel,
    familyLabel = null,
    canMutate,
    onSent,
}: Props) {
    const [forms, setForms] = useState<FormRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [formId, setFormId] = useState("");
    const [sendBusy, setSendBusy] = useState(false);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [created, setCreated] = useState<CreatedLink | null>(null);
    const [copied, setCopied] = useState(false);

    const attachView = useMemo(
        () =>
            buildExistingRecordAttachTargetView({
                entityType: "opportunity",
                entityLabel: opportunityLabel,
                familyLabel,
            }),
        [opportunityLabel, familyLabel]
    );

    const loadForms = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/forms", { credentials: "include" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setForms([]);
                return;
            }
            const rows = (json as { data?: FormRow[] }).data ?? [];
            setForms(rows.filter((f) => f.is_active !== false));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        setCreated(null);
        setSendErr(null);
        setCopied(false);
        void loadForms();
    }, [open, loadForms]);

    const selectedForm = forms.find((f) => f.id === formId) ?? null;

    const sendForm = async () => {
        if (!formId || !canMutate) return;
        setSendBusy(true);
        setSendErr(null);
        try {
            const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/form-send`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    form_definition_id: formId,
                    label: selectedForm ? `${selectedForm.name} · ${opportunityLabel}` : undefined,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((json as { error?: string }).error ?? "Could not send form");
            }
            const d = (json as { data?: CreatedLink }).data;
            const embedUrl =
                d?.embed_url ??
                (typeof window !== "undefined" && d?.embed_path ? `${window.location.origin}${d.embed_path}` : null);
            setCreated({ embed_url: embedUrl, embed_path: d?.embed_path ?? "" });
            onSent?.();
        } catch (e) {
            setSendErr(e instanceof Error ? e.message : "Send failed");
        } finally {
            setSendBusy(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-form-opportunity-title"
            data-testid="send-form-to-opportunity-modal"
            onClick={onDismiss}
        >
            <div
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl ring-1 ring-alloy-midnight/10"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id="send-form-opportunity-title" className="text-base font-semibold text-alloy-midnight">
                    Send form
                </h2>
                <p className="mt-1 text-sm text-alloy-midnight/70">
                    Request information or collect an update from this family — the response attaches to this inquiry.
                </p>

                <div className="mt-3 rounded-lg bg-alloy-stone/10 px-3 py-2" data-testid="send-form-attach-preview">
                    <ul className="space-y-0.5 text-xs text-alloy-midnight/80">
                        {attachView.attachSummaryLines.map((line) => (
                            <li key={line}>· {line}</li>
                        ))}
                    </ul>
                </div>

                <label className="mt-4 block space-y-1">
                    <span className="text-sm font-medium text-alloy-midnight">Form</span>
                    <select
                        className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2 text-sm shadow-sm disabled:opacity-50"
                        value={formId}
                        disabled={!canMutate || loading || sendBusy}
                        data-testid="send-form-opportunity-form-select"
                        onChange={(e) => setFormId(e.target.value)}
                    >
                        <option value="">{loading ? "Loading forms…" : "Choose a form"}</option>
                        {forms.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.name}
                            </option>
                        ))}
                    </select>
                </label>

                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={intakeWorkspaceBtnPrimary}
                        disabled={!canMutate || !formId || sendBusy}
                        data-testid="send-form-opportunity-submit"
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
                                data-testid="send-form-opportunity-open"
                            >
                                Open form
                            </a>
                            <button
                                type="button"
                                className={intakeWorkspaceBtnSecondary}
                                data-testid="send-form-opportunity-copy"
                                onClick={() => {
                                    if (!created.embed_url) return;
                                    void navigator.clipboard.writeText(created.embed_url).then(() => {
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    });
                                }}
                            >
                                {copied ? "Copied" : "Copy link"}
                            </button>
                        </>
                    :   null}
                    <button type="button" className={clsx(intakeWorkspaceBtnSecondary, "ml-auto")} onClick={onDismiss}>
                        Close
                    </button>
                </div>

                {sendErr ?
                    <p className="mt-2 text-sm text-alloy-ember" data-testid="send-form-opportunity-error">
                        {sendErr}
                    </p>
                :   null}
            </div>
        </div>
    );
}
