"use client";

/**
 * How an administrator finishes Email receiving — without becoming a mail admin.
 *
 * The architecture is settled and this panel does not relitigate it: the
 * organization keeps its own MX, and ONE address is forwarded onward by a rule
 * they create at their existing mail provider. Alloy never touches root mail and
 * never reads a mailbox.
 *
 * WHAT THIS SCREEN DELIBERATELY DOES NOT SAY. There is no "default Resend domain
 * vs custom receiving domain" choice, because that is Resend's internal shape and
 * an administrator has no way to reason about it. They are asked one product
 * question — where does Alloy receive? — and Alloy answers it for them when it
 * can, or asks for one value it cannot obtain when it cannot.
 *
 * This is also the ONE place a hidden destination is allowed to render. It is
 * fetched from a route that exists only for this purpose, so its absence from
 * Compose, conversation headers, sent history and parent-facing mail is a
 * property of the system rather than of each surface remembering to omit it.
 */

import { useCallback, useEffect, useState } from "react";
import { Copy, Check, Loader2 } from "lucide-react";

export type IngressRouteRow = {
    id: string;
    binding_id: string;
    destination: string;
    verification_state: string;
    last_inbound_at: string | null;
    inbound_observed: boolean;
};

type Props = {
    bindingId: string | null;
    /** The address families see and reply to. Never replaced by the destination. */
    visibleAddress: string | null;
};

type SetupResponse = {
    status?: "ready_for_routing" | "needs_receiving_domain";
    hidden_destination?: string;
    last_inbound_at?: string | null;
    discovered_domains?: string[];
    error?: string;
    reason?: string;
};

const DOMAIN_REFUSAL: Record<string, string> = {
    // Named separately because it is the likeliest mistake: the Resend page shows
    // a full address, so pasting the whole thing is the natural thing to do.
    looks_like_an_address: "That looks like a full email address. Paste only the domain part, after the @.",
    empty: "Enter the receiving domain.",
    malformed: "That does not look like a domain. Paste just the domain, with no spaces or https://.",
    not_a_domain: "That does not look like a domain — it should contain at least one dot.",
};

function CopyableAddress({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="flex items-center gap-2">
            <code
                data-testid={`communications-routing-${label}`}
                className="min-w-0 flex-1 truncate rounded-md bg-alloy-stone/[0.06] px-2 py-1 font-mono text-[12px] text-alloy-midnight"
            >
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
    const [route, setRoute] = useState<IngressRouteRow | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [domainChoices, setDomainChoices] = useState<string[] | null>(null);
    const [domainDraft, setDomainDraft] = useState("");
    const [domainError, setDomainError] = useState<string | null>(null);

    const loadExisting = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/communications/ingress-routes", { credentials: "include" });
            const json = (await res.json()) as { routes?: IngressRouteRow[] };
            if (!res.ok) return;
            setRoute((json.routes ?? []).find((r) => r.binding_id === bindingId) ?? null);
        } catch {
            /* the panel simply shows the setup action */
        }
    }, [bindingId]);

    useEffect(() => {
        void loadExisting();
    }, [loadExisting]);

    const runSetup = useCallback(
        async (receivingDomain?: string) => {
            if (!bindingId) return;
            setLoading(true);
            setError(null);
            setDomainError(null);
            try {
                const res = await fetch("/api/admin/communications/ingress-routes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        binding_id: bindingId,
                        ...(receivingDomain ? { receiving_domain: receivingDomain } : {}),
                    }),
                });
                const json = (await res.json()) as SetupResponse;
                if (!res.ok) {
                    if (json.error === "invalid_receiving_domain") {
                        setDomainError(DOMAIN_REFUSAL[json.reason ?? ""] ?? "That receiving domain was not accepted.");
                        return;
                    }
                    setError(json.error ?? `Setup failed (${res.status}).`);
                    return;
                }
                if (json.status === "needs_receiving_domain") {
                    // Discovered domains are OFFERED, never auto-selected: a
                    // silent pick would have the administrator create a
                    // forwarding rule against a domain they never saw.
                    setDomainChoices(json.discovered_domains ?? []);
                    return;
                }
                setDomainChoices(null);
                await loadExisting();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Setup failed.");
            } finally {
                setLoading(false);
            }
        },
        [bindingId, loadExisting]
    );

    return (
        <div
            data-testid="communications-email-routing-setup"
            className="mt-3 rounded-xl border border-alloy-stone/20 bg-alloy-stone/[0.02] p-3"
        >
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/50">
                Alloy receiving connection
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-alloy-midnight/55">
                Alloy uses a private receiving destination to bring replies into Communications. Families will
                continue to see and reply to{" "}
                <span className="font-medium text-alloy-midnight/80">{visibleAddress ?? "your email address"}</span>.
            </p>

            {error ? <p className="mt-2 text-[12px] text-alloy-ember">{error}</p> : null}

            {/* STEP 1 — no destination yet. */}
            {!route ? (
                domainChoices === null ? (
                    <button
                        type="button"
                        data-testid="communications-routing-setup-start"
                        disabled={loading || !bindingId}
                        onClick={() => void runSetup()}
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-alloy-juniper px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Set up mail routing
                    </button>
                ) : (
                    <div className="mt-2.5 space-y-2" data-testid="communications-routing-domain-step">
                        {domainChoices.length > 0 ? (
                            <>
                                <div className="text-[11px] font-medium text-alloy-midnight/70">
                                    {domainChoices.length === 1 ? "Receiving domain found" : "Choose a receiving domain"}
                                </div>
                                <ul className="space-y-1">
                                    {domainChoices.map((d) => (
                                        <li key={d}>
                                            <button
                                                type="button"
                                                data-testid={`communications-routing-domain-option-${d}`}
                                                disabled={loading}
                                                onClick={() => void runSetup(d)}
                                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-2.5 py-1.5 text-left font-mono text-[12px] text-alloy-midnight hover:border-alloy-juniper/45 disabled:opacity-40"
                                            >
                                                {d}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-[11px] text-alloy-midnight/45">Continue with one of these.</p>
                            </>
                        ) : (
                            <>
                                <div className="text-[11px] font-medium text-alloy-midnight/70">
                                    Find your Resend receiving domain
                                </div>
                                <p className="text-[11px] leading-relaxed text-alloy-midnight/55">
                                    In Resend → Receiving, copy the domain ending in <code>resend.app</code>.
                                </p>
                            </>
                        )}
                        <div className="flex items-center gap-2">
                            <input
                                data-testid="communications-routing-domain-input"
                                value={domainDraft}
                                onChange={(e) => setDomainDraft(e.target.value)}
                                placeholder="your-id.resend.app"
                                className="min-w-0 flex-1 rounded-md border border-alloy-stone/25 px-2 py-1 font-mono text-[12px]"
                            />
                            <button
                                type="button"
                                data-testid="communications-routing-domain-continue"
                                disabled={loading || !domainDraft.trim()}
                                onClick={() => void runSetup(domainDraft.trim())}
                                className="shrink-0 rounded-lg bg-alloy-juniper px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                            >
                                Continue
                            </button>
                        </div>
                        {domainError ? (
                            <p data-testid="communications-routing-domain-error" className="text-[11px] text-alloy-ember">
                                {domainError}
                            </p>
                        ) : null}
                    </div>
                )
            ) : (
                /* STEP 2 — destination exists; show the routing instruction. */
                <div className="mt-2.5 space-y-2.5">
                    <div className="text-[11px] font-medium text-alloy-midnight/70">Route this email to Alloy</div>
                    <div>
                        <div className="text-[11px] text-alloy-midnight/50">From</div>
                        {visibleAddress ? (
                            <CopyableAddress value={visibleAddress} label="visible-address" />
                        ) : (
                            <p className="text-[12px] text-alloy-midnight/45">No receiving address set yet.</p>
                        )}
                    </div>
                    <div>
                        <div className="text-[11px] text-alloy-midnight/50">Route to</div>
                        <CopyableAddress value={route.destination} label="hidden-destination" />
                    </div>
                    <div className="rounded-lg border border-alloy-stone/15 bg-white p-2.5">
                        <ul className="space-y-1 text-[11px] leading-relaxed text-alloy-midnight/55">
                            <li>
                                Add an address-level routing rule in your current email provider. Your normal mailbox
                                and domain mail remain unchanged. Alloy does not access your mailbox.
                            </li>
                            <li>Your domain&rsquo;s MX records stay exactly as they are.</li>
                            {/*
                              * Stated because the status could otherwise be read as
                              * live monitoring. Alloy sees mail arrive; it cannot
                              * see a rule inside someone else's mail provider.
                              */}
                            <li>
                                Alloy cannot check whether this rule still exists — it can only report mail it has
                                actually received.
                            </li>
                        </ul>
                    </div>
                    {route.inbound_observed ? (
                        <p data-testid="communications-email-routing-observed" className="text-[11px] text-alloy-juniper">
                            Last inbound verified {route.last_inbound_at}
                        </p>
                    ) : (
                        <p data-testid="communications-email-routing-waiting" className="text-[11px] text-alloy-midnight/55">
                            Waiting for routed email. Receiving turns to Connected once Alloy actually receives one.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
