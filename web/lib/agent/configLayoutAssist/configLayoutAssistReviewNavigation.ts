import { buildConfigProposalReviewHref } from "@/lib/agent/configLayoutAssist/configLayoutAssistEntityResolve";
import { handleCommandSurfaceCardNavigate } from "@/lib/adminV2/aiCommandSurface/commandSurfaceCardNavigation";

export type ConfigProposalReviewClickEvent = {
    preventDefault: () => void;
    stopPropagation: () => void;
};

export type ConfigProposalReviewDebugLog = (message: string, detail?: Record<string, unknown>) => void;

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

/** Settings review URL for a persisted proposal id. */
export function configProposalReviewHrefForId(proposalId: string): string {
    return buildConfigProposalReviewHref(proposalId);
}

/**
 * Click handler for the command-surface Review proposal CTA.
 * Stops propagation so parent surfaces do not swallow the click.
 */
export function createConfigProposalReviewClickHandler(
    persistedProposalId: string | null | undefined,
    onReviewConfigProposal: (proposalId: string) => void,
    debugLog?: ConfigProposalReviewDebugLog
): (event: ConfigProposalReviewClickEvent) => void {
    const proposalId = resolveConfigProposalReviewId(persistedProposalId);
    if (proposalId && debugLog) {
        debugLog("card rendered with proposal id", { proposalId });
    }

    return (event) => {
        if (!proposalId) return;
        event.preventDefault();
        event.stopPropagation();
        debugLog?.("review button clicked", { proposalId });
        onReviewConfigProposal(proposalId);
    };
}

/**
 * @deprecated Prefer {@link createConfigProposalReviewClickHandler} + shell `adminV2CommitNavigation`.
 */
export function handleConfigProposalReviewClick(
    event: ConfigProposalReviewClickEvent,
    persistedProposalId: string | null | undefined,
    navigate: (href: string) => void
): void {
    const proposalId = resolveConfigProposalReviewId(persistedProposalId);
    if (!proposalId) return;
    handleCommandSurfaceCardNavigate(event, buildConfigProposalReviewHref(proposalId), navigate);
}
