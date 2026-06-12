/**
 * Communications V2 — template render engine (PKG-14). PURE, no I/O, no React.
 *
 * Variable extraction + resolution ({{var}}), graceful missing-variable handling (no broken
 * tokens), approval gating, and desktop/mobile preview model. Visual-first builder UI consumes this.
 */

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Distinct variable names referenced in a template body/subject. */
export function extractVariables(body: string): string[] {
    const set = new Set<string>();
    let m: RegExpExecArray | null;
    VAR_RE.lastIndex = 0;
    while ((m = VAR_RE.exec(body)) !== null) set.add(m[1]);
    return [...set];
}

export type RenderResult = { rendered: string; missing: string[] };

/** Resolve {{var}} against values. Missing → empty (or kept token if opts.keepMissingToken), reported in `missing`. */
export function renderTemplate(
    body: string,
    values: Record<string, unknown>,
    opts?: { keepMissingToken?: boolean }
): RenderResult {
    const missing = new Set<string>();
    const rendered = body.replace(VAR_RE, (_full, name: string) => {
        const has = Object.prototype.hasOwnProperty.call(values, name) && values[name] != null;
        if (has) return String(values[name]);
        missing.add(name);
        return opts?.keepMissingToken ? `{{${name}}}` : "";
    });
    return { rendered, missing: [...missing] };
}

/** True if any unresolved {{token}} remains (used to block broken sends). */
export function hasUnresolvedTokens(rendered: string): boolean {
    VAR_RE.lastIndex = 0;
    return VAR_RE.test(rendered);
}

/** Only approved templates are sendable where approval is required. */
export function canSendTemplate(approvalStatus: string): boolean {
    return approvalStatus === "approved";
}

export function templatePreview(
    subject: string | null,
    body: string,
    values: Record<string, unknown>,
    channel: "email" | "sms"
): { desktop: { subject: string | null; body: string }; mobile: { subject: string | null; body: string }; missing: string[] } {
    const r = renderTemplate(body, values);
    const subj = subject ? renderTemplate(subject, values).rendered : null;
    const view = { subject: channel === "email" ? subj : null, body: r.rendered };
    return { desktop: view, mobile: view, missing: r.missing };
}
