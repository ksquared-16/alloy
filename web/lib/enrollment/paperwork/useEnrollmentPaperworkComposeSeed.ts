/**
 * Prepare this child's enrollment paperwork for the canonical New Message composer.
 *
 * The same shape the tour precedent uses: prepare through the registered action, turn the draft into
 * a `FamilyComposeDraftSeed`, and hand it to the composer that every other family message goes
 * through. It owns no send UI, and it renders no message of its own.
 *
 * The seed carries `enrollmentPaperworkSessionId` so a CONFIRMED send can record the operator-intent
 * audit against the one participant episode. It is the session id and not a fresh delivery id on
 * purpose: a resend is the same episode reached again, and keying the audit on the episode is what
 * makes that legible afterwards.
 */

"use client";

import { useEffect, useState } from "react";

import type { FamilyComposeDraftSeed } from "@/lib/communications/v2/familyWorkspace/familyComposeIntent";
import { SEND_ENROLLMENT_PAPERWORK_ACTION_KEY } from "@/lib/adminV2/actions/definitions/sendEnrollmentPaperworkAction";

export type EnrollmentPaperworkSeedState =
    | { phase: "preparing" }
    | { phase: "ready"; seed: FamilyComposeDraftSeed; accessUrl: string }
    | { phase: "error"; message: string };

type PrepareDetail = {
    session_id?: string;
    access_url?: string;
    recipient_person_id?: string;
    subject?: string;
    email_body?: string;
    sms_body?: string;
};

/** The link must already be in the editable body — the same Path A contract tour follows. */
function withUrl(body: string, url: string, separator: string): string {
    if (!url) return body;
    if (!body) return url;
    return body.includes(url) ? body : `${body}${separator}${url}`;
}

export function seedFromEnrollmentPaperworkDetail(
    detail: PrepareDetail,
    childCustomerMemberId: string,
): FamilyComposeDraftSeed {
    const url = String(detail.access_url ?? "").trim();
    const email = withUrl(String(detail.email_body ?? "").trim(), url, "\n\n");
    const sms = withUrl(String(detail.sms_body ?? "").trim(), url, " ");
    const recipientId = String(detail.recipient_person_id ?? "").trim();
    return {
        subject: String(detail.subject ?? "").trim() || null,
        body: email || sms,
        smsBody: sms || email,
        channel: "email",
        recipientPersonIds: recipientId ? [recipientId] : null,
        enrollmentPaperworkSessionId: String(detail.session_id ?? "").trim() || null,
        enrollmentPaperworkChildId: childCustomerMemberId || null,
    };
}

export function useEnrollmentPaperworkComposeSeed(
    customerMemberId: string,
    enabled: boolean,
): EnrollmentPaperworkSeedState {
    const [state, setState] = useState<EnrollmentPaperworkSeedState>({ phase: "preparing" });

    useEffect(() => {
        if (!enabled || !customerMemberId) {
            setState(
                enabled && !customerMemberId
                    ? {
                          phase: "error",
                          // The carrier's own rule: a wrong child is worse than no child, so absence
                          // refuses rather than picking one.
                          message: "Open the child whose paperwork you want to send, then try again.",
                      }
                    : { phase: "preparing" },
            );
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action_key: SEND_ENROLLMENT_PAPERWORK_ACTION_KEY,
                        entity_type: "child",
                        entity_id: customerMemberId,
                        context: { surface: "focus_panel", origin: "operator" },
                        payload: { mode: "prepare" },
                        confirmation: { confirmed: true },
                    }),
                });
                /*
                 * THE ENVELOPE IS THE ROUTE'S, NOT THE ACTION'S.
                 *
                 * `/api/admin/actions/execute` answers `{ok, data: {execution_result}, correlation_id}`,
                 * where `execution_result` IS the action result's `detail`. This read the action's own
                 * internal shape (`result.detail`) instead, so a prepare that succeeded — 200, the
                 * right session, the right packet, the right recipient, the whole draft — was reported
                 * to the operator as "could not be prepared". Measured: the execute call returned 200
                 * and the composer rendered its error state beside it.
                 */
                const body = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                    data?: { execution_result?: PrepareDetail };
                };
                if (cancelled) return;
                const detail = body.data?.execution_result;
                if (!res.ok || body.ok === false || !detail?.access_url) {
                    setState({
                        phase: "error",
                        message: body.error ?? "The enrollment paperwork could not be prepared.",
                    });
                    return;
                }
                setState({
                    phase: "ready",
                    seed: seedFromEnrollmentPaperworkDetail(detail, customerMemberId),
                    accessUrl: String(detail.access_url ?? ""),
                });
            } catch {
                if (!cancelled) {
                    setState({
                        phase: "error",
                        message: "The enrollment paperwork could not be prepared. Try again.",
                    });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [customerMemberId, enabled]);

    return state;
}
