"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import ProcessingAlloyDialog from "@/app/adminV2/pos/ProcessingAlloyDialog";
import {
    EnrollmentConversationCard,
    type ParticipantConversationApi,
} from "@/app/forms/embed/[token]/EnrollmentConversationCard";
import type { ParticipantObjectiveWire } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { opMutedMeta, opPrimaryActionButton } from "@/lib/operational/ui/operationalVisualTokens";

/**
 * "Okay. Show me." — answered by running the actual runtime.
 *
 * ## What this replaced, and why
 *
 * The first version of this surface rendered the configuration: a static list of the three
 * obligations, with the Form as 80 empty inputs and a Next/Back wizard. It was rejected on sight,
 * correctly — a family never meets that. They meet ONE guided conversation whose objective happens
 * to contain three obligations, and the runtime that drives it was already built and certified.
 * Showing them anything else made the preview a lie about the product.
 *
 * ## So this renders no conversation of its own
 *
 * It mounts `EnrollmentConversationCard` — the same component, not a copy — pointed at preview
 * endpoints that delegate to the same `handleParticipantObjective` and `handleParticipantTurn` the
 * public participant routes call. There is one conversation implementation in this codebase and
 * this is it; the only thing preview supplies is where the turns are sent and a client whose writes
 * land in memory.
 *
 * ## Generic family, honestly
 *
 * Preview starts with nothing on file, so Alloy asks for everything. That is the truthful V1: a
 * preview that manufactured "known information" would misrepresent the single most valuable thing
 * about the real experience — how much Alloy already knows and therefore does not ask.
 */

type Props = {
    open: boolean;
    onClose: () => void;
    packetDefId: string;
    packetName: string;
};

type State =
    | { k: "idle" }
    | { k: "loading" }
    | { k: "ready"; objective: ParticipantObjectiveWire; previewId: string }
    | { k: "error"; message: string };

export function PacketExperiencePreview({ open, onClose, packetDefId, packetName }: Props) {
    const [state, setState] = useState<State>({ k: "idle" });

    const start = useCallback(async () => {
        setState({ k: "loading" });
        try {
            const res = await fetch(
                `/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefId)}/packet-preview/objective`,
                { credentials: "same-origin" },
            );
            const body = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                data?: ParticipantObjectiveWire;
                error?: string;
                preview_id?: string;
            };
            if (!res.ok || !body.ok || !body.data || !body.preview_id) {
                setState({ k: "error", message: body.error ?? "The preview could not be started." });
                return;
            }
            setState({ k: "ready", objective: body.data, previewId: body.preview_id });
        } catch (e) {
            setState({ k: "error", message: (e as Error).message });
        }
    }, [packetDefId]);

    useEffect(() => {
        if (!open) {
            setState({ k: "idle" });
            return;
        }
        void start();
    }, [open, start]);

    const previewId = state.k === "ready" ? state.previewId : "";
    const api: ParticipantConversationApi = useMemo(() => {
        const base = `/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefId)}/packet-preview`;
        const post = (path: string, body: Record<string, unknown>) =>
            fetch(`${base}/${path}`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                // The conversation sends words; preview adds only which conversation they belong to.
                body: JSON.stringify({ ...body, preview_id: previewId }),
            });
        return {
            objective: () => fetch(`${base}/objective`, { credentials: "same-origin" }),
            turn: (body) => post("turn", body),
            /*
             * UPLOAD IS THE ONE BOUNDARY PREVIEW CANNOT CROSS, and it says so rather than pretending.
             *
             * `outstandingRequiredEvidence` computes what the family still owes from the `documents`
             * table — explicitly "read from `documents`, not from a submission payload, because the
             * obligation must be answerable before any artifact has been prepared". So an evidence
             * obligation is satisfied by a CANONICAL DOCUMENT and by nothing else. There is no
             * ephemeral representation to inject: the only way to satisfy it in preview would be to
             * fabricate a Document row, which would be preview claiming a real record exists.
             *
             * The real control stays on screen, because that is what a family meets. It refuses
             * locally — no request is made at all, so there is nothing to fail closed on server-side
             * either.
             */
            upload: async () =>
                new Response(
                    JSON.stringify({
                        ok: false,
                        error:
                            "File upload is disabled in preview. A real document is what satisfies this step, " +
                            "and preview does not create one.",
                    }),
                    { status: 200, headers: { "content-type": "application/json" } },
                ),
        };
    }, [packetDefId, previewId]);

    if (!open) return null;

    return (
        <ProcessingAlloyDialog
            open={open}
            onClose={onClose}
            title={packetName || "Packet"}
            subtitle="Preview — experience this packet as a family"
            size="wide"
            testId="packet-experience-preview"
            footer={
                <button type="button" className={opPrimaryActionButton} onClick={onClose}>
                    Close preview
                </button>
            }
        >
            <div className="space-y-4">
                <div
                    className="rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.05] px-3 py-2"
                    data-testid="packet-preview-banner"
                >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-bend-pine">Preview</p>
                    <p className="mt-0.5 text-[12px] leading-snug text-alloy-midnight/75">
                        Experience this packet as a family. Nothing is saved or sent.
                    </p>
                </div>

                {state.k === "loading" || state.k === "idle" ? (
                    <p className={opMutedMeta} data-testid="packet-preview-loading">
                        Starting the conversation…
                    </p>
                ) : null}

                {state.k === "error" ? (
                    <p className="text-[13px] font-medium text-alloy-ember" data-testid="packet-preview-error">
                        {state.message}
                    </p>
                ) : null}

                {state.k === "ready" ? (
                    <div data-testid="packet-preview-conversation">
                        <EnrollmentConversationCard
                            token={state.previewId}
                            api={api}
                            initialObjective={state.objective}
                            artifactRenderable={false}
                        />
                    </div>
                ) : null}
            </div>
        </ProcessingAlloyDialog>
    );
}
