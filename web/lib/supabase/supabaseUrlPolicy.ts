/**
 * The one rule for whether a Supabase URL is usable, shared by every client that validates one.
 *
 * HTTPS is required for real hosts because the anon key and auth tokens travel on that connection.
 * Loopback is the exception: traffic to 127.0.0.1 / ::1 / localhost never leaves the machine, so
 * there is nothing for TLS to protect, and a local Supabase (`supabase start`) only serves HTTP.
 * Requiring HTTPS there rejects the correct configuration.
 *
 * This replaces an earlier exception that allowed HTTP only on port 55321 behind
 * PROCESSING_LOCAL_CERT_ALLOW_HTTP. That hardcoded one stack's port, so every other local project
 * — which the Supabase CLI assigns different ports — hit "must use https" despite being loopback.
 * The property that makes local HTTP safe is the host, not the port, so the rule keys on the host.
 */

/**
 * True for hosts that cannot leave the machine. `URL.hostname` returns IPv6 hosts wrapped in
 * brackets (`[::1]`), so both forms are matched. `*.localhost` resolves to loopback per RFC 6761.
 * Deliberately excludes 0.0.0.0 and LAN/private ranges: those are reachable from other hosts, so
 * HTTP there is a real exposure, not a local convenience.
 */
export function isLoopbackHostname(hostname: string): boolean {
    const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
    if (h === "localhost" || h.endsWith(".localhost")) return true;
    if (h === "::1" || h === "::ffff:127.0.0.1") return true;
    // The whole 127.0.0.0/8 block is loopback, not just 127.0.0.1.
    return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

/** Throws with an actionable message when `supabaseUrl` is not a usable Supabase URL. */
export function assertValidSupabaseHttpUrl(supabaseUrl: string): void {
    let u: URL;
    try {
        u = new URL(supabaseUrl);
    } catch {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL is not a valid URL. Use https://<project-ref>.supabase.co from Project Settings → API, or a local URL such as http://127.0.0.1:54321."
        );
    }

    if (!u.hostname || u.hostname.includes(" ")) {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL has an invalid hostname. Check for typos, quotes, or whitespace in .env.local."
        );
    }

    const isHttps = u.protocol === "https:";
    const isLoopbackHttp = u.protocol === "http:" && isLoopbackHostname(u.hostname);
    if (!isHttps && !isLoopbackHttp) {
        throw new Error(
            u.protocol === "http:"
                ? `NEXT_PUBLIC_SUPABASE_URL must use https for non-local hosts (${u.hostname} is not loopback). HTTP is only allowed for localhost / 127.0.0.1 / ::1.`
                : `NEXT_PUBLIC_SUPABASE_URL must use https (got "${u.protocol}").`
        );
    }

    const lower = supabaseUrl.toLowerCase();
    if (
        lower.includes("your_project_ref") ||
        lower.includes("placeholder") ||
        lower.includes("example.supabase.co")
    ) {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL still looks like a placeholder. Set the real project URL from Supabase Dashboard → Project Settings → API."
        );
    }
}
