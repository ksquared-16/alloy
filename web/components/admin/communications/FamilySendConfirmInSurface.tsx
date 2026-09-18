"use client";

import { useState } from "react";
import { Check, Link2, Send } from "lucide-react";

import { composerMarkupToPlainText } from "@/lib/communications/v2/familyWorkspace/composerBodyMarkup";
import type { FamilySendResult } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";

/**
 * Ready to send — inside the composer, not on top of it.
 *
 * ## What this replaces
 *
 * A centered modal, portalled above the composer modal, repeating the whole message inside its own
 * `max-h-[40vh]` scroller. Three things were wrong with that and only one of them is decoration:
 * it was a modal over a modal; it reproduced at full length a message the operator had just written
 * and was still looking at; and it introduced a second scroll region inside a surface that already
 * scrolled. The confirmation read as a system alert interrupting the workflow rather than the last
 * step of it.
 *
 * The safety requirement is untouched. Nothing sends until Confirm send is pressed, and Back to edit
 * returns to the draft exactly as it was.
 *
 * ## What a confirmation has to answer
 *
 * Who is receiving it, by which channel, what the subject is, and whether the thing the message
 * exists to carry is actually in it. Those four are stated plainly and none of them is behind a
 * scroll. The body is the one thing the operator does NOT need re-read in full — they wrote it — so
 * it opens as the first lines with the rest one click away.
 */
export default function FamilySendConfirmInSurface({
    sendResult,
    sending,
    channel,
    subjectDraft,
    bodyDraft,
    recipientName,
    recipientAddress,
    onBackToEdit,
    onConfirmSend,
}: {
    sendResult: FamilySendResult;
    sending: boolean;
    channel: "email" | "sms";
    subjectDraft: string;
    bodyDraft: string;
    recipientName: string;
    recipientAddress: string | null;
    onBackToEdit: () => void;
    onConfirmSend: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const plain = composerMarkupToPlainText(bodyDraft).trim();
    const lines = plain.split("\n").filter((l) => l.trim().length > 0);
    const preview = expanded ? plain : lines.slice(0, 3).join("\n");
    const hidden = Math.max(0, lines.length - 3);

    /*
     * The participant link is the REASON this particular message exists, and it is the one thing an
     * operator cannot verify by glancing at three lines of prose. Detected from the body itself
     * rather than from what the caller believes it seeded, so the claim is about what will actually
     * be sent.
     */
    const participantLink = /\/forms\/embed\/[A-Za-z0-9_-]+/.test(plain);
    const blocked = (sendResult.results ?? []).filter((r) => r.status === "blocked");

    return (
        <div
            className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto rounded-lg border border-[#00A283]/20 bg-[#E8F6F2]/25 px-3 py-3"
            data-cc-send-confirm="true"
            data-cc-send-review="true"
            data-cc-send-confirm-surface="in_composer"
            data-cc-send-confirm-phase="preflight"
            role="group"
            aria-label="Ready to send"
        >
            <p className="text-[13px] font-semibold tracking-tight text-alloy-midnight">Ready to send</p>

            <dl className="grid grid-cols-[3.25rem_1fr] gap-x-2 gap-y-1 text-[12px]">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/45">To</dt>
                <dd className="min-w-0 text-alloy-midnight" data-cc-send-confirm-recipient="true">
                    <span className="font-medium">{recipientName}</span>
                    {recipientAddress ? <span className="text-alloy-midnight/55"> · {recipientAddress}</span> : null}
                </dd>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/45">
                    {channel === "sms" ? "Text" : "Email"}
                </dt>
                <dd className="min-w-0 text-alloy-midnight">
                    {channel === "email" ? subjectDraft.trim() || "(no subject)" : "Text message"}
                </dd>
            </dl>

            <div
                className="rounded-md border border-alloy-stone/20 bg-white px-2.5 py-2 text-[12px] leading-relaxed text-alloy-midnight/85"
                data-cc-send-confirm-preview="true"
            >
                <p className="whitespace-pre-wrap">{preview}</p>
                {hidden > 0 ? (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        data-cc-send-confirm-expand="true"
                        className="mt-1 text-[11px] font-semibold text-[#00A283] hover:underline"
                    >
                        {expanded ? "Show less" : `Show ${hidden} more line${hidden === 1 ? "" : "s"}`}
                    </button>
                ) : null}
            </div>

            {participantLink ? (
                <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#00A283]" data-cc-send-confirm-link="true">
                    <Link2 className="h-3.5 w-3.5" aria-hidden />
                    Participant link included
                </p>
            ) : null}

            {blocked.length > 0 ? (
                <ul className="space-y-0.5 text-[11px] text-alloy-midnight/55">
                    {blocked.map((r) => (
                        <li key={r.person_id}>
                            {r.display_name}
                            {r.reason ? ` — ${r.reason}` : " — blocked"}
                        </li>
                    ))}
                </ul>
            ) : null}

            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                    type="button"
                    onClick={onBackToEdit}
                    disabled={sending}
                    data-cc-send-back-to-edit="true"
                    className="rounded-md border border-alloy-stone/20 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-alloy-midnight/70 hover:border-[#00A283]/25 hover:bg-[#E8F6F2]/40 disabled:opacity-45"
                >
                    Back to edit
                </button>
                <button
                    type="button"
                    onClick={onConfirmSend}
                    disabled={sending}
                    data-cc-send-confirm-button="true"
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#00A283] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-[#009276] disabled:opacity-45"
                >
                    {sending ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                    {sending ? "Sending…" : "Confirm send"}
                </button>
            </div>
        </div>
    );
}
