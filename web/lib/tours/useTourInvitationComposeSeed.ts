/**
 * Prepare Tour invitation draft for the canonical New Message composer.
 * Reuses the warm-on-intent cache; does not own send UI.
 */

"use client";

import { useEffect, useState } from "react";

import type { FamilyComposeDraftSeed } from "@/lib/communications/v2/familyWorkspace/familyComposeIntent";
import {
    provisionTourInvitationPrepare,
    type TourInvitationPrepareDraft,
} from "@/lib/tours/tourInvitationPrepareWarmCache";

export type TourInvitationComposeSeedState =
    | { phase: "preparing" }
    | { phase: "ready"; seed: FamilyComposeDraftSeed }
    | { phase: "error"; message: string };

function seedFromPrepared(prepared: TourInvitationPrepareDraft): FamilyComposeDraftSeed {
    const recipientId = String(prepared.recipientPersonId ?? "").trim();
    const emailBody = String(prepared.emailBody ?? "").trim();
    const smsBody = String(prepared.smsBody ?? "").trim();
    const url = String(prepared.invitationActionUrl ?? "").trim();
    // Path A contract: fresh link must already be in the editable body.
    const ensuredEmail =
        url && emailBody && !emailBody.includes(url) ? `${emailBody}\n\n${url}`
        : url && !emailBody ? url
        : emailBody;
    const ensuredSms =
        url && smsBody && !smsBody.includes(url) ? `${smsBody} ${url}`
        : url && !smsBody ? url
        : smsBody;
    return {
        subject: prepared.emailSubject,
        body: ensuredEmail || ensuredSms,
        smsBody: ensuredSms || ensuredEmail,
        channel: "email",
        recipientPersonIds: recipientId ? [recipientId] : null,
        tourInvitationId: prepared.invitationId,
    };
}

export function useTourInvitationComposeSeed(
    opportunityId: string,
    enabled: boolean,
): TourInvitationComposeSeedState {
    const [state, setState] = useState<TourInvitationComposeSeedState>({ phase: "preparing" });

    useEffect(() => {
        if (!enabled) {
            setState({ phase: "preparing" });
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const prepared = await provisionTourInvitationPrepare(opportunityId);
                if (cancelled) return;
                if (!prepared?.invitationId || !prepared.invitationActionUrl) {
                    setState({
                        phase: "error",
                        message: "Could not prepare the tour invitation. Try again.",
                    });
                    return;
                }
                setState({ phase: "ready", seed: seedFromPrepared(prepared) });
            } catch {
                if (!cancelled) {
                    setState({
                        phase: "error",
                        message: "Could not prepare the tour invitation. Try again.",
                    });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [enabled, opportunityId]);

    return state;
}
