/**
 * Where the Processing certification suites may run: the shared certification stack (`alloy-cert`,
 * `web/.env.certification.local`, API :54421 / DB :54422 — the sanctioned stack, docs/platform/governance/
 * local-docker-containment.md) or the retired isolated stack (:55321 / :55322) it superseded. Never the
 * development stack (:54321 / :54322) and never a hosted project.
 */
export const CERT_API_PORTS = [":54421", ":55321"] as const;
export const CERT_DB_PORTS = [":54422", ":55322"] as const;

const local = (url: string) => /^(https?|postgres(ql)?):\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/i.test(url);

export function isCertApiUrl(url: string | null | undefined): boolean {
    const u = String(url ?? "").trim();
    return local(u) && CERT_API_PORTS.some((p) => u.includes(p)) && !/supabase\.co/i.test(u);
}

export function isCertDbUrl(url: string | null | undefined): boolean {
    const u = String(url ?? "").trim();
    return local(u) && CERT_DB_PORTS.some((p) => u.includes(`${p}/`));
}
