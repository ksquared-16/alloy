"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SenderPreviewState = {
    loading: boolean;
    error: string | null;
    resolution: {
        ok: boolean;
        safe_sender_metadata?: {
            identityId: string;
            displayName: string | null;
            fromAddress: string;
            channel: string;
        };
        failure_code?: string;
        message?: string;
        warnings?: string[];
        selection_reason?: string;
    } | null;
    eligibleIdentities: Array<{
        id: string;
        display_name: string | null;
        canonical_address: string;
        access?: { label: string };
    }>;
    canOverride: boolean;
};

const EMPTY: SenderPreviewState = {
    loading: false,
    error: null,
    resolution: null,
    eligibleIdentities: [],
    canOverride: false,
};

export function useSenderIdentityPreview(params: {
    channel: "email" | "sms";
    locationId?: string | null;
    selectedIdentityId?: string | null;
    enabled?: boolean;
}) {
    const { channel, locationId, selectedIdentityId, enabled = true } = params;
    const [state, setState] = useState<SenderPreviewState>(EMPTY);
    const requestSeqRef = useRef(0);

    const refresh = useCallback(async () => {
        if (!enabled || (channel !== "email" && channel !== "sms")) {
            setState(EMPTY);
            return;
        }
        const requestSeq = ++requestSeqRef.current;
        setState((s) => ({ ...s, loading: true, error: null }));
        try {
            const qs = new URLSearchParams({
                channel,
                eligible: "true",
            });
            if (locationId) qs.set("location_id", locationId);
            if (selectedIdentityId) qs.set("identity_id", selectedIdentityId);
            const res = await fetch(`/api/admin/communications/identity-platform/sender-preview?${qs}`);
            const json = (await res.json()) as {
                error?: string;
                resolution?: SenderPreviewState["resolution"];
                eligible_identities?: SenderPreviewState["eligibleIdentities"];
                can_override?: boolean;
            };
            if (requestSeq !== requestSeqRef.current) return;
            if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
            const eligible = json.eligible_identities ?? [];
            setState({
                loading: false,
                error: null,
                resolution: json.resolution ?? null,
                eligibleIdentities: eligible,
                canOverride: Boolean(json.can_override) && eligible.length > 1,
            });
        } catch (e) {
            if (requestSeq !== requestSeqRef.current) return;
            setState({
                loading: false,
                error: e instanceof Error ? e.message : "Failed to load sender",
                resolution: null,
                eligibleIdentities: [],
                canOverride: false,
            });
        }
    }, [channel, enabled, locationId, selectedIdentityId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return { ...state, refresh };
}
