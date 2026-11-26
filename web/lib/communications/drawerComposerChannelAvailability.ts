/**
 * Pure drawer composer channel availability — binding readiness + recipient address checks.
 * Does not treat another household member's missing email as a reason to disable SMS.
 */

export type DrawerComposerRecipient = {
    person_id: string;
    email?: string | null;
    phone?: string | null;
};

export type DrawerComposerChannelStatus = {
    available: boolean;
    reason: string | null;
};

function hasUsablePhone(r: DrawerComposerRecipient): boolean {
    return String(r.phone ?? "").replace(/\D/g, "").length >= 10;
}

function hasUsableEmail(r: DrawerComposerRecipient): boolean {
    const e = String(r.email ?? "").trim();
    return e.includes("@");
}

/** Whether a bindings channel list is safe to reuse without a network refetch. */
export function isReusableOutboundBindingsSnapshot(channels: readonly string[]): boolean {
    const hasEmail = channels.includes("email");
    const hasSms = channels.includes("sms");
    // Email-only snapshots must not lock SMS off after an SMS binding is activated.
    // SMS-only or both are reusable; empty is not.
    if (!hasEmail && !hasSms) return false;
    if (hasEmail && !hasSms) return false;
    return true;
}

/**
 * SMS tab availability for the drawer / Focus Panel composer.
 * Provider binding is required; then selected (or any eligible) recipient phone.
 */
export function resolveDrawerComposerSmsAvailability(opts: {
    smsProviderReady: boolean;
    loadingBindings?: boolean;
    bindingsError?: string | null;
    recipients: readonly DrawerComposerRecipient[];
    selectedRecipientIds: ReadonlySet<string> | readonly string[];
}): DrawerComposerChannelStatus {
    if (opts.loadingBindings) {
        return { available: false, reason: "Loading outbound configuration…" };
    }
    if (opts.bindingsError) {
        return { available: false, reason: opts.bindingsError };
    }
    if (!opts.smsProviderReady) {
        return { available: false, reason: "SMS outbound is not configured for this org yet" };
    }

    const selectedIds =
        opts.selectedRecipientIds instanceof Set
            ? opts.selectedRecipientIds
            : new Set(opts.selectedRecipientIds);
    const selected = opts.recipients.filter((r) => selectedIds.has(r.person_id));
    const pool = selected.length > 0 ? selected : opts.recipients;

    if (pool.length === 0) {
        return { available: false, reason: "No phone on file." };
    }
    if (pool.some(hasUsablePhone)) {
        return { available: true, reason: null };
    }
    return { available: false, reason: "No phone on file." };
}

/** Email tab availability — selected recipient's missing phone must not affect email. */
export function resolveDrawerComposerEmailAvailability(opts: {
    emailProviderReady: boolean;
    loadingBindings?: boolean;
    bindingsError?: string | null;
    recipients: readonly DrawerComposerRecipient[];
    selectedRecipientIds: ReadonlySet<string> | readonly string[];
}): DrawerComposerChannelStatus {
    if (opts.loadingBindings) {
        return { available: false, reason: "Loading outbound configuration…" };
    }
    if (opts.bindingsError) {
        return { available: false, reason: opts.bindingsError };
    }
    if (!opts.emailProviderReady) {
        return { available: false, reason: "Outbound email is not configured for this org" };
    }

    const selectedIds =
        opts.selectedRecipientIds instanceof Set
            ? opts.selectedRecipientIds
            : new Set(opts.selectedRecipientIds);
    const selected = opts.recipients.filter((r) => selectedIds.has(r.person_id));
    const pool = selected.length > 0 ? selected : opts.recipients;

    if (pool.length === 0) {
        return { available: false, reason: "No email on file." };
    }
    if (pool.some(hasUsableEmail)) {
        return { available: true, reason: null };
    }
    return { available: false, reason: "No email on file." };
}
