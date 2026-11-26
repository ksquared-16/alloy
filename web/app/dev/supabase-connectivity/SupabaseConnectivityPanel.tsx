"use client";

import { useEffect, useState } from "react";

import { getPublicSupabaseAuthDebug } from "@/lib/supabase/publicAuthEnv";
import { authCookieNameFor, browserSupabaseUrl, isLoopbackSupabaseUrl } from "@/lib/supabase/browserTransport";

/**
 * Three origins, never conflated again.
 *
 * The panel this replaces printed ONE origin — the configured `NEXT_PUBLIC_SUPABASE_URL` — and
 * labelled it "Password sign-in expects: POST …". On a certification host that is a loopback
 * address, and the browser does not post there: `browserSupabaseUrl` rewrites a loopback URL onto
 * this app's own origin so that a remote browser is never sent to its own machine. One label, one
 * value, and a reader who concluded the wrong thing about which machine was failing.
 *
 * So each origin is now named for what it is:
 *
 *   database identity   what the server is configured with, and what the cookie name is pinned from
 *   browser transport   where THIS page's JavaScript actually sends auth requests
 *   server-side origin  what the server reports about itself, for the stale-bundle comparison
 */
export default function SupabaseConnectivityPanel() {
    const debug = getPublicSupabaseAuthDebug();
    const [serverOrigin, setServerOrigin] = useState<string | null | undefined>(undefined);
    const [browserTarget, setBrowserTarget] = useState<string | null>(null);

    useEffect(() => {
        if (debug.origin) {
            setBrowserTarget(browserSupabaseUrl(debug.origin, window.location.origin));
        }
        let cancelled = false;
        fetch("/api/dev/supabase-origin", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                if (!cancelled) setServerOrigin((j?.origin as string | null) ?? null);
            })
            .catch(() => {
                if (!cancelled) setServerOrigin(null);
            });
        return () => {
            cancelled = true;
        };
    }, [debug.origin]);

    const stale = Boolean(debug.origin && serverOrigin && debug.origin !== serverOrigin);
    const proxied = isLoopbackSupabaseUrl(debug.origin);

    return (
        <main style={S.page} data-testid="supabase-connectivity">
            <h1 style={S.h1}>Supabase connectivity</h1>
            <p style={S.lead}>
                Dev-only. Not part of the login product — this page exists so the three origins below
                can be told apart.
            </p>

            <section style={S.block}>
                <h2 style={S.h2}>Browser transport</h2>
                <p style={S.value}>{browserTarget ?? "(resolving…)"}</p>
                <p style={S.note}>
                    Where this page&apos;s JavaScript actually sends auth requests.{" "}
                    {proxied
                        ? "The configured database is loopback, so requests go to this app's own origin and the server forwards them. A remote browser is never asked to reach the host's loopback address."
                        : "The configured database is directly reachable, so requests go to it."}
                </p>
            </section>

            <section style={S.block}>
                <h2 style={S.h2}>Database identity</h2>
                <p style={S.value}>{debug.origin ?? "(none — check NEXT_PUBLIC_SUPABASE_URL)"}</p>
                <p style={S.note}>
                    What the server is configured with, and what the auth cookie name is pinned from
                    (<code>{authCookieNameFor(debug.origin) ?? "library default"}</code>). This is an
                    identity, not an address for your browser.
                </p>
            </section>

            <section style={S.block}>
                <h2 style={S.h2}>Server-side origin</h2>
                <p style={S.value}>
                    {serverOrigin === undefined ? "(asking…)" : (serverOrigin ?? "(no answer)")}
                </p>
                <p style={S.note}>
                    What the running server reports about itself. If this disagrees with the database
                    identity above, this page is running older JavaScript than the server.
                </p>
            </section>

            <section style={S.block}>
                <h2 style={S.h2}>Configuration</h2>
                <ul style={S.list}>
                    <li>NEXT_PUBLIC_SUPABASE_URL defined: {debug.urlDefined ? "yes" : "no"}</li>
                    <li>URL parses: {debug.urlParseError ? `no (${debug.urlParseError})` : debug.urlDefined ? "yes" : "n/a"}</li>
                    <li>NEXT_PUBLIC_SUPABASE_ANON_KEY defined: {debug.anonKeyDefined ? "yes" : "no"}</li>
                </ul>
            </section>

            {stale ? (
                <div style={S.stale}>
                    <strong>Stale bundle.</strong> This page&apos;s JavaScript was compiled against{" "}
                    <code>{debug.origin}</code> while the server is configured for{" "}
                    <code>{serverOrigin}</code>. Sign-in would reach the wrong project. Restart the dev
                    server and hard-reload.
                </div>
            ) : null}
        </main>
    );
}

const S: Record<string, React.CSSProperties> = {
    page: { maxWidth: 720, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#101828" },
    h1: { fontSize: 22, margin: "0 0 6px" },
    h2: { fontSize: 13, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#667085" },
    lead: { margin: "0 0 20px", color: "#475467", fontSize: 14, lineHeight: 1.6 },
    block: { marginTop: 18, padding: "12px 14px", border: "1px solid #e4e7ec", borderRadius: 10 },
    value: { margin: "0 0 6px", fontFamily: "ui-monospace, monospace", fontSize: 14, wordBreak: "break-all" },
    note: { margin: 0, fontSize: 13, color: "#475467", lineHeight: 1.6 },
    list: { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: "#344054" },
    stale: { marginTop: 18, padding: "12px 14px", border: "1px solid #fda29b", background: "#fef3f2", borderRadius: 10, fontSize: 13, color: "#912018", lineHeight: 1.6 },
};
