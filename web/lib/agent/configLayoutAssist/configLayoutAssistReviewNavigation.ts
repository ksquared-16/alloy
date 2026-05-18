import { buildConfigProposalReviewHref } from "@/lib/agent/configLayoutAssist/configLayoutAssistEntityResolve";

export type ConfigProposalReviewClickEvent = {
    preventDefault: () => void;
    stopPropagation: () => void;
};

/** Normalizes persisted proposal id from orchestrator / API. */
export function resolveConfigProposalReviewId(
    persistedProposalId: string | null | undefined
): string | null {
    const trimmed = persistedProposalId?.trim();
    return trimmed || null;
}

/** Reads proposal selection id from Settings deep-link query params. */
export function readConfigProposalIdFromSearchParams(params: {
    get: (key: string) => string | null;
}): string | null {
    return resolveConfigProposalReviewId(params.get("proposalId") ?? params.get("id"));
}

/**
 * Navigates to Settings → Configuration proposals with the proposal selected.
 * Stops propagation so command-surface overlays do not swallow the click.
 */
export function handleConfigProposalReviewClick(
    event: ConfigProposalReviewClickEvent,
    persistedProposalId: string | null | undefined,
    navigate: (href: string) => void
): void {
    const proposalId = resolveConfigProposalReviewId(persistedProposalId);
    if (!proposalId) return;
    event.preventDefault();
    event.stopPropagation();
    navigate(buildConfigProposalReviewHref(proposalId));
}
