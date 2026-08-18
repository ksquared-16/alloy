"use client";

/**
 * The Email identity Alloy presents to the OPERATOR who owns it.
 *
 * The visible identity is not only what a parent sees. It is also the answer to
 * "what is my email address in Alloy?" — and a composer that cannot answer that
 * leaves an operator guessing which address a parent will see, and therefore
 * which address a parent will reply to.
 *
 * Everything is projected through `resolveVisibleEmailIdentity`, so a transport
 * address cannot reach this surface even if one were written into an identity
 * field. Absence is reported as absence; nothing is substituted.
 */

import { useEffect, useState } from "react";

import {
    resolveVisibleEmailIdentity,
    type VisibleEmailIdentity,
} from "@/lib/communications/identity/visibleEmailIdentity";

type IdentityPayload = {
    default_identity?: {
        canonical_address?: string | null;
        display_name?: string | null;
        channel?: string | null;
    } | null;
};

export type OrgSendingIdentityState = {
    identity: VisibleEmailIdentity | null;
    loading: boolean;
};

export function useOrgSendingIdentity(enabled: boolean): OrgSendingIdentityState {
    const [identity, setIdentity] = useState<VisibleEmailIdentity | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setLoading(true);
        void (async () => {
            try {
                const res = await fetch("/api/admin/communications/identities?channel=email", {
                    credentials: "include",
                });
                if (!res.ok) return;
                const json = (await res.json()) as IdentityPayload;
                const row = json.default_identity ?? null;
                if (cancelled) return;
                setIdentity(
                    resolveVisibleEmailIdentity({
                        fromEmail: row?.canonical_address ?? null,
                        displayName: row?.display_name ?? null,
                    })
                );
            } catch {
                // A composer must not fail because a label could not be fetched.
                // The From line simply does not render.
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [enabled]);

    return { identity, loading };
}
