"use client";

/**
 * How an administrator finishes Email receiving — without becoming a mail admin.
 *
 * The architecture is decided and this panel does not relitigate it: the
 * organization keeps its own MX, and ONE address is forwarded onward by an
 * address-level rule they create at their existing mail provider. Alloy never
 * touches root mail and never reads a mailbox.
 *
 * The panel exists because that arrangement is invisible otherwise. "Routing
 * setup required" is a truthful state and a useless instruction on its own — it
 * names a problem whose fix lives in a system Alloy cannot see, let alone
 * perform. So this shows the two addresses involved, says which is which, and
 * states plainly what Alloy does and does not do with the mailbox.
 *
 * This is the ONE place the hidden destination is allowed to render, and it is
 * fetched from a route that exists only for this purpose.
 */

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

export type IngressRouteRow = {
    id: string;
    binding_id: string;
    destination: string;
    verification_state: string;
    last_inbound_at: string | null;
    inbound_observed: boolean;
};

type Props = {
    /** The binding whose routing is being set up. */
    bindingId: string | null;
    /** The address families see and reply to. */
    visibleAddress: string | null;
};

function CopyableAddress({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-alloy-stone/[0.06] px-2 py-1 font-mono text-[12px] text-alloy-midnight">
                {value}
            </code>
            <button
                type="button"
                aria-label={`Copy ${label}`}
                onClick={() => {
                    void navigator.clipboard?.writeText(value).then(
                        () => {
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1500);
                        },
                        () => setCopied(false)
                    );
                }}
                className="shrink-0 rounded-md border border-alloy-stone/25 p-1 text-alloy-midnight/55 hover:bg-alloy-stone/[0.06]"
            >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
        </div>
    );
}

export default function MailRoutingSetupPanel({ bindingId, visibleAddress }: Props) {
    const [routes, setRoutes] = useState<IngressRouteRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/admin/communications/ingress-routes", { credentials: "include" });
                const json = (await res.json()) as { routes?: IngressRouteRow[]; error?: string };
                if (cancelled) return;
                if (!res.ok) {
                    setError(json.error ?? `HTTP ${res.status}`);
                    return;
                }
                setRoutes(json.routes ?? []);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Could not load routing setup");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const route = routes?.find((r) => r.binding_id === bindingId) ?? null;

    return (
        <div
            data-testid="communications-email-routing-setup"
            className="mt-3 rounded-xl border border-alloy-stone/20 bg-alloy-stone/[0.02] p-3"
        >
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/50">
                Mail routing setup
            </div>

            {error ? <p className="mt-2 text-[12px] text-alloy-ember">{error}</p> : null}

            <div className="mt-2 space-y-2.5">
                <div>
                    <div className="text-[11px] font-medium text-alloy-midnight/60">Visible address</div>
                    <p className="mb-1 text-[11px] leading-relaxed text-alloy-midnight/50">
                        What families see and reply to. This never changes.
                    </p>
                    {visibleAddress ? (
                        <CopyableAddress value={visibleAddress} label="visible address" />
                    ) : (
                        <p className="text-[12px] text-alloy-midnight/45">No receiving address set yet.</p>
                    )}
                </div>

                <div>
                    <div className="text-[11px] font-medium text-alloy-midnight/60">Hidden Alloy destination</div>
                    <p className="mb-1 text-[11px] leading-relaxed text-alloy-midnight/50">
                        Where your mail provider should forward that one address. Transport only — families never
                        see it, and it is not anyone&rsquo;s email address.
                    </p>
                    {route ? (
                        <CopyableAddress value={route.destination} label="hidden destination" />
                    ) : (
                        // Honest about the blocking step rather than showing a
                        // box an administrator cannot fill. Provisioning the
                        // destination is a provider call Alloy makes, not
                        // something they can type.
                        <p className="text-[12px] text-alloy-midnight/45">
                            No destination has been provisioned yet. One is needed before routing can be set up.
                        </p>
                    )}
                </div>

                <div>
                    <div className="text-[11px] font-medium text-alloy-midnight/60">What to do</div>
                    <ol className="mt-1 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-alloy-midnight/60">
                        <li>
                            In your existing mail provider, add an address-level routing or forwarding rule for{" "}
                            <span className="font-medium text-alloy-midnight/80">{visibleAddress ?? "this address"}</span>{" "}
                            to the hidden destination above.
                        </li>
                        <li>Send one test message to the visible address.</li>
                        <li>
                            Receiving turns to <span className="font-medium text-alloy-midnight/80">Connected</span>{" "}
                            when Alloy actually receives it.
                        </li>
                    </ol>
                </div>

                <div className="rounded-lg border border-alloy-stone/15 bg-white p-2.5">
                    <ul className="space-y-1 text-[11px] leading-relaxed text-alloy-midnight/55">
                        <li>Your domain&rsquo;s MX records stay exactly as they are.</li>
                        <li>Alloy does not sign in to, or read, the mailbox.</li>
                        <li>Only mail routed to this one identity reaches Alloy.</li>
                        {/*
                          * Stated because the status can otherwise be misread as
                          * live monitoring. Alloy sees mail arrive; it cannot see
                          * a rule inside someone else's mail provider, so it can
                          * never report that the rule still exists.
                          */}
                        <li>
                            Alloy cannot check whether this rule still exists — it can only report mail it has
                            actually received.
                        </li>
                    </ul>
                </div>

                {route?.inbound_observed ? (
                    <p data-testid="communications-email-routing-observed" className="text-[11px] text-alloy-juniper">
                        Last inbound verified {route.last_inbound_at}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
