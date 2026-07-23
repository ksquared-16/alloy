"use client";

/**
 * Generic form-delivery surface (the canonical send-form capability, v1).
 *
 * Answers the four contract questions with no entity-type branching:
 *   Form        → configured active forms
 *   Send to     → eligible recipients (person truth from drawer-recipients)
 *   Related to  → eligible related subjects (opaque {id,label,entity_type} from delivery-subjects)
 *   Delivery    → only channels that can actually execute for the current recipients
 *
 * Execution reuses the canonical comms send + form-link runtimes (POST form-deliver): it records a
 * real communication + activity and drives recomposition. When nothing can execute (no form / no
 * recipients for a channel) it presents a blocked reason — never a fake success.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { peekWarmFormDelivery } from "@/lib/adminV2/runtime/focusPanel/currentWork/formDeliveryWarmCache";

type Props = {
    opportunityId: string;
    onClose: () => void;
    onComplete: () => void;
};

type FormOption = { id: string; name: string };
type RecipientOption = { person_id: string; display_name: string; email: string | null; phone: string | null };
type SubjectOption = { id: string; label: string; entity_type: string };
type DeliverChannel = "email" | "sms" | "link";

export default function FormDeliverySurface({ opportunityId, onClose, onComplete }: Props) {
    // Warm-first: if operator intent warmed the delivery inputs, render them synchronously (no
    // "Loading…" gate) and re-verify fresh in the background.
    const warm = peekWarmFormDelivery(opportunityId);
    const [forms, setForms] = useState<FormOption[]>(warm?.forms ?? []);
    const [recipients, setRecipients] = useState<RecipientOption[]>(warm?.recipients ?? []);
    const [subjects, setSubjects] = useState<SubjectOption[]>(warm?.subjects ?? []);
    const [loading, setLoading] = useState(!warm);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [formId, setFormId] = useState<string>(warm && warm.forms.length === 1 ? warm.forms[0]!.id : "");
    const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(() => {
        const suggested = (warm?.recipients ?? []).filter((r) => r.email);
        return suggested.length > 0 ? new Set([suggested[0]!.person_id]) : new Set();
    });
    const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
    const [channel, setChannel] = useState<DeliverChannel>("email");
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [doneNote, setDoneNote] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        (async () => {
            // Only show the loading gate when there is nothing warm to show yet; otherwise verify silently.
            if (!peekWarmFormDelivery(opportunityId)) setLoading(true);
            setLoadError(null);
            try {
                const [formsRes, recRes, subjRes] = await Promise.all([
                    fetch("/api/admin/forms", { credentials: "include" }),
                    fetch(`/api/admin/communications/drawer-recipients?entity_type=opportunities&entity_id=${encodeURIComponent(opportunityId)}`, { credentials: "include" }),
                    fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/delivery-subjects`, { credentials: "include" }),
                ]);
                const formsJ = (await formsRes.json().catch(() => ({}))) as { forms?: Array<{ id: string; name: string; is_active?: boolean }>; data?: { forms?: Array<{ id: string; name: string; is_active?: boolean }> } };
                const recJ = (await recRes.json().catch(() => ({}))) as { recipients?: RecipientOption[] };
                const subjJ = (await subjRes.json().catch(() => ({}))) as { subjects?: SubjectOption[]; data?: { subjects?: SubjectOption[] } };
                if (!live) return;
                const formList = (formsJ.forms ?? formsJ.data?.forms ?? []).filter((f) => f.is_active !== false).map((f) => ({ id: f.id, name: f.name }));
                setForms(formList);
                setRecipients(recJ.recipients ?? []);
                setSubjects(subjJ.subjects ?? subjJ.data?.subjects ?? []);
                if (formList.length === 1) setFormId(formList[0]!.id);
                const suggested = (recJ.recipients ?? []).filter((r) => r.email);
                if (suggested.length > 0) setSelectedRecipients(new Set([suggested[0]!.person_id]));
            } catch (e) {
                if (live) setLoadError(e instanceof Error ? e.message : String(e));
            } finally {
                if (live) setLoading(false);
            }
        })();
        return () => {
            live = false;
        };
    }, [opportunityId]);

    const anyEmail = recipients.some((r) => r.email);
    const anyPhone = recipients.some((r) => r.phone);
    const channels = useMemo<DeliverChannel[]>(() => {
        const c: DeliverChannel[] = [];
        if (anyEmail) c.push("email");
        if (anyPhone) c.push("sms");
        c.push("link");
        return c;
    }, [anyEmail, anyPhone]);

    useEffect(() => {
        if (!channels.includes(channel)) setChannel(channels[0] ?? "link");
    }, [channels, channel]);

    const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
        const next = new Set(set);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setter(next);
    };

    const blockedReason =
        forms.length === 0 ? "No active forms are configured for this organization."
        : channel !== "link" && recipients.length === 0 ? "No eligible recipients are linked to this record."
        : null;

    const canSend =
        !sending
        && !blockedReason
        && formId.trim().length > 0
        && (channel === "link" || selectedRecipients.size > 0);

    const handleSend = useCallback(async () => {
        if (!canSend) return;
        setSending(true);
        setSendError(null);
        try {
            const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/form-deliver`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    form_definition_id: formId,
                    recipient_person_ids: [...selectedRecipients],
                    subject_ids: [...selectedSubjects],
                    channel,
                }),
            });
            const j = (await res.json().catch(() => ({}))) as { data?: { channel?: string; embed_url?: string; delivered?: unknown[] }; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            const result = j.data ?? (j as { channel?: string });
            if (channel === "link") {
                setDoneNote("Form link ready.");
            } else {
                setDoneNote("Form sent.");
            }
            // Recompose the What's Next surface (same signal the comms/tour paths use).
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("adminv2:opportunity-updated", { detail: { id: opportunityId, action_key: "send_form" } }));
            }
            void result;
            onComplete();
        } catch (e) {
            setSendError(e instanceof Error ? e.message : String(e));
        } finally {
            setSending(false);
        }
    }, [canSend, channel, formId, onComplete, opportunityId, selectedRecipients, selectedSubjects]);

    return (
        <aside
            className="alloy-os-currentwork__action-panel alloy-os-currentwork__action-panel--composer"
            data-work-action-panel="true"
            data-work-action-surface="form_delivery"
            aria-label="Send form"
        >
            <div className="alloy-os-currentwork__action-panel-header">
                <div>
                    <p className="alloy-os-currentwork__action-panel-eyebrow">Send form</p>
                    <h3 className="alloy-os-currentwork__action-panel-title">Deliver a form</h3>
                </div>
                <button
                    type="button"
                    className="alloy-os-currentwork__action-panel-close"
                    onClick={onClose}
                    aria-label="Close"
                    data-work-action-panel-close="true"
                >
                    Close
                </button>
            </div>

            {loading ?
                <p className="alloy-os-household__row-detail" aria-busy="true">Loading…</p>
            : loadError ?
                <p className="alloy-os-currentwork__error" role="alert">{loadError}</p>
            : blockedReason ?
                <p className="alloy-os-currentwork__handoff-notice" role="status" data-work-form-delivery-blocked="true">{blockedReason}</p>
            :   <div className="alloy-os-formdelivery" data-work-form-delivery="true">
                    <div className="alloy-os-formdelivery__section">
                        <p className="alloy-os-currentwork__focused-section-title">Form</p>
                        <select
                            className="alloy-os-formdelivery__select"
                            data-work-form-delivery-form="true"
                            value={formId}
                            onChange={(e) => setFormId(e.target.value)}
                        >
                            <option value="">Select a form…</option>
                            {forms.map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="alloy-os-formdelivery__section">
                        <p className="alloy-os-currentwork__focused-section-title">Send to</p>
                        <div className="alloy-os-formdelivery__options">
                            {recipients.length === 0 ?
                                <p className="alloy-os-household__row-detail">No recipients available.</p>
                            :   recipients.map((r) => {
                                    const disabled = channel === "email" ? !r.email : channel === "sms" ? !r.phone : false;
                                    return (
                                        <label key={r.person_id} className="alloy-os-formdelivery__option" data-disabled={disabled ? "true" : undefined}>
                                            <input
                                                type="checkbox"
                                                data-work-form-recipient={r.person_id}
                                                checked={selectedRecipients.has(r.person_id)}
                                                disabled={disabled || channel === "link"}
                                                onChange={() => toggle(selectedRecipients, r.person_id, setSelectedRecipients)}
                                            />
                                            <span>{r.display_name}</span>
                                            <span className="alloy-os-formdelivery__hint">{channel === "sms" ? r.phone ?? "no phone" : r.email ?? "no email"}</span>
                                        </label>
                                    );
                                })}
                        </div>
                    </div>

                    {subjects.length > 0 ?
                        <div className="alloy-os-formdelivery__section">
                            <p className="alloy-os-currentwork__focused-section-title">Related to</p>
                            <div className="alloy-os-formdelivery__options">
                                {subjects.map((s) => (
                                    <label key={s.id} className="alloy-os-formdelivery__option">
                                        <input
                                            type="checkbox"
                                            data-work-form-subject={s.id}
                                            checked={selectedSubjects.has(s.id)}
                                            onChange={() => toggle(selectedSubjects, s.id, setSelectedSubjects)}
                                        />
                                        <span>{s.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    :   null}

                    <div className="alloy-os-formdelivery__section">
                        <p className="alloy-os-currentwork__focused-section-title">Delivery</p>
                        <div className="alloy-os-formdelivery__channels">
                            {channels.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    className="alloy-os-currentwork__focused-outcome-pill"
                                    data-work-form-channel={c}
                                    aria-pressed={channel === c}
                                    onClick={() => setChannel(c)}
                                >
                                    {c === "email" ? "Email" : c === "sms" ? "SMS" : "Shareable link"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {sendError ? <p className="alloy-os-currentwork__error" role="alert">{sendError}</p> : null}
                    {doneNote ? <p className="alloy-os-currentwork__handoff-notice" role="status">{doneNote}</p> : null}

                    <div className="alloy-os-currentwork__focused-confirm-controls">
                        <button
                            type="button"
                            className="alloy-os-currentwork__primary-action"
                            data-work-action="send-form"
                            disabled={!canSend}
                            onClick={handleSend}
                        >
                            {sending ? "Sending…" : channel === "link" ? "Create link" : "Send form"}
                        </button>
                    </div>
                </div>
            }
        </aside>
    );
}
