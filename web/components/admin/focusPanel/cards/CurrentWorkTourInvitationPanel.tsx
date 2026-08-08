/**
 * Current Work — Send Tour Invitation centered compose.
 *
 * Shell mounts immediately. Draft prepare (mint + template) hydrates inside.
 * Send uses the canonical `/api/admin/communications/send` path; invitation
 * activation is recorded only after a successful confirmed send.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { dispatchOpportunityDrawerScopedUpdate } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

type Props = {
    action: CurrentWorkActionVM;
    opportunityId: string;
    onClose: () => void;
    onComplete: () => void;
};

type Recipient = {
    person_id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
};

type DraftState =
    | { phase: "preparing" }
    | {
          phase: "ready";
          subject: string;
          body: string;
          invitationId: string | null;
          recipient: Recipient | null;
      }
    | { phase: "error"; message: string };

export default function CurrentWorkTourInvitationPanel({
    action,
    opportunityId,
    onClose,
    onComplete,
}: Props) {
    const [draft, setDraft] = useState<DraftState>({ phase: "preparing" });
    const [channel, setChannel] = useState<"email" | "sms">("email");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const submitLock = useRef(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [prepRes, recipRes] = await Promise.all([
                    fetch("/api/admin/actions/execute", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action_key: "send_tour_invitation",
                            entity_type: "opportunity",
                            entity_id: opportunityId,
                            context: { surface: "focus_panel", origin: "operator" },
                            payload: { mode: "prepare" },
                            confirmation: { confirmed: true },
                        }),
                    }),
                    fetch(
                        `/api/admin/opportunities/${encodeURIComponent(opportunityId)}/drawer-recipients`,
                    ).catch(() => null),
                ]);
                const json = (await prepRes.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string | { message?: string };
                    data?: {
                        execution_result?: {
                            detail?: {
                                invitation_id?: string;
                                draft?: {
                                    emailSubject?: string | null;
                                    emailBody?: string | null;
                                    smsBody?: string | null;
                                    invitationId?: string | null;
                                    recipientDisplayName?: string | null;
                                    recipientEmail?: string | null;
                                    recipientPhone?: string | null;
                                } | null;
                            };
                        };
                    };
                };
                if (cancelled) return;
                if (!prepRes.ok || json.ok === false) {
                    const message =
                        typeof json.error === "string"
                            ? json.error
                            : json.error?.message ?? "Could not prepare the tour invitation.";
                    setDraft({ phase: "error", message });
                    return;
                }
                const detail = json.data?.execution_result?.detail;
                const d = detail?.draft;
                const emailBody = String(d?.emailBody ?? "").trim();
                const smsBody = String(d?.smsBody ?? "").trim();
                const emailSubject = String(d?.emailSubject ?? "").trim();
                const invitationId =
                    String(detail?.invitation_id ?? d?.invitationId ?? "").trim() || null;

                let recipient: Recipient | null = null;
                if (d?.recipientEmail || d?.recipientPhone || (d as { recipientPersonId?: string })?.recipientPersonId) {
                    recipient = {
                        person_id: String((d as { recipientPersonId?: string }).recipientPersonId ?? "").trim(),
                        display_name: String(d.recipientDisplayName ?? "Primary contact").trim(),
                        email: d.recipientEmail ?? null,
                        phone: d.recipientPhone ?? null,
                    };
                }
                if (recipRes?.ok) {
                    const rj = (await recipRes.json().catch(() => ({}))) as {
                        data?: { recipients?: Recipient[] };
                        recipients?: Recipient[];
                    };
                    const list = rj.data?.recipients ?? rj.recipients ?? [];
                    const suggested =
                        list.find((r) => r.email || r.phone)
                        ?? list[0]
                        ?? null;
                    if (suggested) recipient = suggested;
                }

                setSubject(emailSubject);
                setBody(emailBody || smsBody);
                setDraft({
                    phase: "ready",
                    subject: emailSubject,
                    body: emailBody || smsBody,
                    invitationId,
                    recipient,
                });
            } catch {
                if (!cancelled) {
                    setDraft({
                        phase: "error",
                        message: "Could not prepare the tour invitation. Try again.",
                    });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [opportunityId]);

    const onChannelChange = (next: "email" | "sms") => {
        setChannel(next);
        if (draft.phase !== "ready") return;
        // Keep operator edits; only switch when body still matches the other channel seed is hard —
        // leave body as-is so free edits are preserved.
        void draft;
    };

    const confirmSend = useCallback(async () => {
        if (submitLock.current || draft.phase !== "ready") return;
        if (!body.trim()) {
            setError("Enter a message to send.");
            return;
        }
        const personId = draft.recipient?.person_id?.trim();
        if (!personId) {
            setError("Choose a recipient with contact details before sending.");
            return;
        }
        submitLock.current = true;
        setBusy(true);
        setError(null);
        try {
            const payload: Record<string, unknown> = {
                entity_type: "opportunities",
                entity_id: opportunityId,
                channel,
                body: body.trim(),
                recipient_person_id: personId,
            };
            if (channel === "email") payload.subject = subject.trim();
            const res = await fetch("/api/admin/communications/send", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                throw new Error(j.error ?? "Send failed");
            }
            if (draft.invitationId) {
                await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action_key: "send_tour_invitation",
                        entity_type: "opportunity",
                        entity_id: opportunityId,
                        payload: {
                            mode: "mark_sent",
                            invitation_id: draft.invitationId,
                            channel,
                        },
                        confirmation: { confirmed: true },
                    }),
                }).catch(() => null);
            }
            dispatchOpportunityDrawerScopedUpdate(opportunityId, "send_tour_invitation", [
                "activity",
                "header_actions",
            ]);
            onComplete();
        } catch (e) {
            setBusy(false);
            submitLock.current = false;
            setError(e instanceof Error ? e.message : "Send failed");
        }
    }, [body, channel, draft, onComplete, opportunityId, subject]);

    return (
        <aside
            className="alloy-os-currentwork__action-panel"
            data-work-action-panel="true"
            data-work-action-panel-key={action.key}
            data-work-action-surface="communications_composer"
            data-tour-invitation-compose="true"
            aria-label={`${action.label} composer`}
        >
            <div className="alloy-os-currentwork__action-panel-header">
                <div>
                    <p className="alloy-os-currentwork__action-panel-eyebrow">Tour</p>
                    <h3 className="alloy-os-currentwork__action-panel-title">{action.label}</h3>
                    <p className="alloy-os-currentwork__action-panel-desc">
                        Review and edit the invitation. Nothing is sent until you confirm.
                    </p>
                </div>
                <button
                    type="button"
                    className="alloy-os-currentwork__action-panel-close"
                    onClick={onClose}
                    aria-label="Close action panel"
                    disabled={busy}
                >
                    Close
                </button>
            </div>

            {draft.phase === "preparing" ?
                <div
                    className="alloy-os-currentwork__action-panel-body"
                    data-command-surface-section="input_fields"
                >
                    <p className="text-sm text-alloy-midnight/70">Preparing invitation draft…</p>
                </div>
            : draft.phase === "error" ?
                <div
                    className="alloy-os-currentwork__action-panel-body"
                    data-command-surface-section="blocker"
                >
                    <p className="text-sm text-alloy-midnight/80">{draft.message}</p>
                    <button
                        type="button"
                        className="mt-3 text-sm font-semibold text-alloy-pine"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            :   <div
                    className="alloy-os-currentwork__action-panel-body space-y-3"
                    data-command-surface-section="input_fields"
                    data-testid="tour-invitation-compose"
                >
                    {draft.recipient ?
                        <p className="text-sm text-alloy-midnight/70">
                            To:{" "}
                            <span className="font-medium text-alloy-midnight">
                                {draft.recipient.display_name}
                            </span>
                            {channel === "email" && draft.recipient.email ?
                                <span className="text-alloy-midnight/60"> · {draft.recipient.email}</span>
                            : null}
                            {channel === "sms" && draft.recipient.phone ?
                                <span className="text-alloy-midnight/60"> · {draft.recipient.phone}</span>
                            : null}
                        </p>
                    :   null}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                                channel === "email"
                                    ? "bg-alloy-pine text-white"
                                    : "bg-alloy-midnight/5 text-alloy-midnight/70"
                            }`}
                            onClick={() => onChannelChange("email")}
                            disabled={busy}
                        >
                            Email
                        </button>
                        <button
                            type="button"
                            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                                channel === "sms"
                                    ? "bg-alloy-pine text-white"
                                    : "bg-alloy-midnight/5 text-alloy-midnight/70"
                            }`}
                            onClick={() => onChannelChange("sms")}
                            disabled={busy}
                        >
                            SMS
                        </button>
                    </div>
                    {channel === "email" ?
                        <label className="block text-xs">
                            <span className="mb-1 block font-medium text-alloy-midnight/70">Subject</span>
                            <input
                                type="text"
                                className="w-full rounded-md border border-alloy-midnight/15 px-2 py-1.5 text-sm"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                disabled={busy}
                            />
                        </label>
                    :   null}
                    <label className="block text-xs">
                        <span className="mb-1 block font-medium text-alloy-midnight/70">Message</span>
                        <textarea
                            className="min-h-[12rem] w-full rounded-md border border-alloy-midnight/15 px-2 py-1.5 text-sm"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            disabled={busy}
                        />
                    </label>
                    {error ?
                        <p className="text-sm text-red-700" role="alert">
                            {error}
                        </p>
                    :   null}
                    <div className="flex items-center justify-end gap-2 pt-1" data-command-surface-footer>
                        <button
                            type="button"
                            className="rounded-md px-3 py-1.5 text-sm text-alloy-midnight/70 hover:bg-alloy-midnight/5"
                            onClick={onClose}
                            disabled={busy}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="rounded-md bg-alloy-pine px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                            disabled={busy || !body.trim()}
                            data-command-surface-primary
                            data-testid="tour-invitation-confirm-send"
                            onClick={() => void confirmSend()}
                        >
                            {busy ? "Sending…" : "Confirm send"}
                        </button>
                    </div>
                </div>
            }
        </aside>
    );
}
