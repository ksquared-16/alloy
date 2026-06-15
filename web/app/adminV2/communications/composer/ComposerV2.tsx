"use client";

import { useState } from "react";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import {
    resolveAvailableChannels,
    validateComposerDraft,
    composerPreview,
    buildSendPayloads,
    type ComposerChannel,
    type ComposerDraft,
} from "@/lib/communications/v2/composerModel";

/**
 * Unified Composer V2 (PKG-12/18D) — DARK (self-gated behind comms_v2_composer; null when off).
 * Email / SMS / Internal Note with channel availability + validation + preview. Live send is wired to
 * the canonical /api/admin/communications/send endpoint, but ONLY on an explicit user click and ONLY
 * when a sendContext (entity + recipient) is supplied — no auto-send, no provider-specific behavior.
 * Field mapping to the send route is validated at the Integration/Final gate.
 */
export default function ComposerV2(props: {
    hasEmailBinding?: boolean;
    hasSmsBinding?: boolean;
    recipientHasEmail?: boolean;
    recipientHasPhone?: boolean;
    sendContext?: { primaryEntityType: string; primaryEntityId: string; recipientPersonId: string };
}) {
    if (!isCommsV2FlagEnabled("comms_v2_composer")) return null;

    const [channel, setChannel] = useState<ComposerChannel>("email");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const [sendNote, setSendNote] = useState<string | null>(null);

    const availability = resolveAvailableChannels({
        hasEmailBinding: props.hasEmailBinding ?? true,
        hasSmsBinding: props.hasSmsBinding ?? false,
        recipientHasEmail: props.recipientHasEmail ?? true,
        recipientHasPhone: props.recipientHasPhone ?? false,
    });
    const draft: ComposerDraft = {
        channel,
        subject,
        body,
        recipients: props.sendContext ? [props.sendContext.recipientPersonId] : ["__preview__"],
    };
    const errors = validateComposerDraft(draft);
    const preview = composerPreview(draft);

    async function handleSend() {
        if (!props.sendContext || errors.length > 0 || channel === "note") return;
        setSending(true);
        setSendNote(null);
        try {
            const payload = buildSendPayloads(draft)[0];
            const res = await fetch("/api/admin/communications/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: props.sendContext.primaryEntityType,
                    entity_id: props.sendContext.primaryEntityId,
                    channel,
                    body: payload?.body ?? body,
                    subject: payload?.subject ?? undefined,
                    recipient_person_id: props.sendContext.recipientPersonId,
                }),
            });
            setSendNote(res.ok ? "Sent." : "Send failed.");
        } catch {
            setSendNote("Send failed.");
        } finally {
            setSending(false);
        }
    }

    return (
        <div data-cc-composer="v2" className="rounded-xl border border-alloy-stone/15 bg-white p-3">
            <div data-cc-composer-channels className="flex gap-2">
                {(["email", "sms", "note"] as ComposerChannel[]).map((c) => (
                    <button
                        key={c}
                        type="button"
                        disabled={c !== "note" && !availability[c]}
                        onClick={() => setChannel(c)}
                        className="rounded-lg px-2 py-1 text-sm disabled:opacity-40"
                        data-cc-channel={c}
                    >
                        {c.toUpperCase()}
                    </button>
                ))}
            </div>
            {channel === "email" ? (
                <input
                    aria-label="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-alloy-stone/15 px-2 py-1 text-sm"
                    placeholder="Subject"
                />
            ) : null}
            <textarea
                aria-label="Message body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="mt-2 h-24 w-full rounded-lg border border-alloy-stone/15 px-2 py-1 text-sm"
                placeholder="Type your message…"
            />
            {errors.length > 0 ? (
                <ul data-cc-composer-errors className="mt-1 text-xs text-alloy-ember">
                    {errors.map((e) => (
                        <li key={e}>{e}</li>
                    ))}
                </ul>
            ) : null}
            <div className="mt-2 flex items-center justify-between">
                <div data-cc-composer-preview className="text-xs text-alloy-midnight/60">
                    Preview: {preview.desktop.body.slice(0, 60)}
                </div>
                <button
                    type="button"
                    data-cc-composer-send
                    disabled={!props.sendContext || errors.length > 0 || channel === "note" || sending}
                    onClick={handleSend}
                    className="rounded-lg bg-alloy-pine px-3 py-1 text-sm text-white disabled:opacity-40"
                >
                    {sending ? "Sending…" : "Send"}
                </button>
            </div>
            {sendNote ? <div data-cc-composer-sendnote className="mt-1 text-xs text-alloy-midnight/60">{sendNote}</div> : null}
        </div>
    );
}
