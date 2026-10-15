"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z } from "@/components/admin/Drawer";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { hasInnerDismissibleLayer } from "@/lib/adminV2/runtime/focusPanel/escapeLayerOwnership";
import type { FamilyComposeDraftSeed } from "@/lib/communications/v2/familyWorkspace/familyComposeIntent";

// Shell chrome mounts this modal on every page; the composer subtree loads only when it opens.
const FamilyNewMessageComposer = dynamic(
    () => import("@/components/admin/communications/FamilyNewMessageComposer"),
    {
        ssr: false,
        loading: () => (
            <div className="flex min-h-[16rem] flex-1 items-center justify-center px-4 text-[12px] text-alloy-midnight/55">
                Opening message…
            </div>
        ),
    },
);

/** What a record-scoped message launch carries (Manage → Send Message / Email / SMS / Tour Invitation). */
export type RecordMessageComposerSeed = {
    opportunityId: string;
    personId?: string | null;
    recordDisplayName?: string | null;
    defaultChannel?: "email" | "sms";
    draftSubject?: string | null;
    draftBody?: string | null;
    tourInvitationId?: string | null;
};

/**
 * Whether a record-scoped launch is hosted by the canonical Family Communication composer.
 *
 * The composer is opportunity-scoped, so a launch must name a real opportunity — the contextual
 * launcher falls back to putting a PERSON id in `opportunityId` when there is no opportunity, and
 * that launch stays on the person-search Compose New. The flags are the ones the family runtime and
 * `family-send` already require; with any of them off there is no family lifecycle to converge on.
 */
export function canHostRecordMessageInFamilyComposer(seed: {
    opportunityId?: string | null;
    personId?: string | null;
    recordScoped?: boolean;
} | null | undefined): boolean {
    const opportunityId = seed?.opportunityId?.trim() ?? "";
    if (!seed?.recordScoped || !opportunityId) return false;
    if (seed.personId?.trim() && seed.personId.trim() === opportunityId) return false;
    return (
        isCommsV2FlagEnabled("comms_v2_command_center")
        && isCommsV2FlagEnabled("comms_v2_record_tab")
        && isCommsV2FlagEnabled("comms_v2_live_workspace")
    );
}

/**
 * Manage → Send Message (and the other record message actions) on the SAME composer and send
 * lifecycle as Current Work → Contact Family.
 *
 * This is only a shell: a portal, a title and Close. It declares no work consequence — a message
 * sent from Manage is a message, and never completes the open Contact Family item. A prepared Tour
 * invitation travels as `draftSeed.tourInvitationId`, which is what activates it after a confirmed
 * send (see useFamilyCommunicationRuntime).
 */
export default function RecordMessageComposerModal({
    open,
    seed,
    onClose,
}: {
    open: boolean;
    seed: RecordMessageComposerSeed | null;
    onClose: () => void;
}) {
    const [portalReady, setPortalReady] = useState(false);
    useEffect(() => {
        setPortalReady(true);
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            // One Escape closes one layer: a preference popover, menu, Send later or the review
            // dialog closes itself first; only then does Escape close the composer.
            if (hasInnerDismissibleLayer(document)) return;
            onClose();
        };
        // Capture, like the Focus Panel grid: the check must see inner layers before they close.
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, onClose]);

    const draftSeed = useMemo<FamilyComposeDraftSeed | null>(() => {
        if (!seed) return null;
        const personId = seed.personId?.trim() || "";
        return {
            channel: seed.defaultChannel ?? null,
            subject: seed.draftSubject ?? null,
            body: seed.draftBody ?? null,
            recipientPersonIds: personId && personId !== seed.opportunityId ? [personId] : null,
            tourInvitationId: seed.tourInvitationId ?? null,
        };
    }, [seed]);

    if (!open || !seed || !portalReady || typeof document === "undefined") return null;

    const title = seed.recordDisplayName?.trim() || "Message";

    return createPortal(
        <div
            className="fixed inset-0 flex items-center justify-center bg-alloy-midnight/45 px-3 py-6 backdrop-blur-[2px] sm:px-4"
            style={{ zIndex: ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z }}
            data-record-message-composer-modal="true"
        >
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close message" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`Message ${title}`}
                className="relative flex h-[min(80vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/12 px-4 py-2">
                    <p className="min-w-0 truncate text-[13px] font-semibold text-alloy-midnight">{title}</p>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="shrink-0 rounded-md p-1 text-alloy-midnight/55 hover:bg-alloy-stone/[0.08] hover:text-alloy-midnight"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col p-2">
                    <FamilyNewMessageComposer
                        opportunityId={seed.opportunityId}
                        draftSeed={draftSeed}
                        onSendAcknowledged={onClose}
                    />
                </div>
            </div>
        </div>,
        document.body,
    );
}
