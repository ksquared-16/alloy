"use client";

import clsx from "clsx";
import { StatusBadge } from "@/components/admin/StatusBadge";
import SecondaryButton from "@/components/SecondaryButton";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import {
    DISTRIBUTION_COPY,
    distributionIsPreviewLink,
    distributionLinkLabel,
    distributionLinkPurposeLine,
    resolveDistributionEmbedUrl,
    type DistributionCreatedLinkPayload,
    type DistributionLinkRow,
} from "@/lib/forms/distributionPresentation";
import { MEDICATION_AUTHORIZATION_DEMO_FORM_KEY } from "@/lib/forms/seeds/medicationAuthorizationDemo";
import {
    opActionLinkAccent,
    opPrimaryActionButton,
    opGroupedRowInner,
    opGroupedSurface,
    opMetadata,
    opMutedMeta,
} from "@/lib/operational/ui/operationalVisualTokens";

type SharedProps = {
    mode: "form" | "packet";
    subjectName: string;
    canMutate?: boolean;
    busy: boolean;
    error?: string | null;
    links: DistributionLinkRow[];
    createdLink: DistributionCreatedLinkPayload | null;
    viewerTz: string;
    copied?: string | null;
    copyWarn?: string | null;
    onCopy?: (key: string, text: string) => void;
    formKey?: string;
    shareIntakeBlocked?: boolean;
    shareIntakeBlockedLabel?: string;
    shareIntakeBlockedMessage?: string | null;
};

type FormDistributionProps = SharedProps & {
    mode: "form";
    onShareIntake: () => void;
};

type PacketDistributionProps = SharedProps & {
    mode: "packet";
    onLaunchPacket: () => void;
    onToggleLink: (link: DistributionLinkRow, nextActive: boolean) => void;
};

export type DistributionLinksPanelProps = FormDistributionProps | PacketDistributionProps;

function OneTimeLinkPanel({
    createdLink,
    copied,
    copyWarn,
    onCopy,
}: {
    createdLink: DistributionCreatedLinkPayload;
    copied?: string | null;
    copyWarn?: string | null;
    onCopy?: (key: string, text: string) => void;
}) {
    const intakeUrl = resolveDistributionEmbedUrl(createdLink);

    return (
        <div
            className="mt-4 rounded-lg bg-amber-50/80 px-4 py-3 ring-1 ring-amber-200/60"
            data-testid="distribution-one-time-panel"
        >
            <p className="text-sm font-semibold text-alloy-midnight">{DISTRIBUTION_COPY.copyLinkNow}</p>
            <p className={clsx("mt-1", opMetadata)}>{DISTRIBUTION_COPY.copySecurityNote}</p>
            <div className="mt-3">
                <span className={opMutedMeta}>{DISTRIBUTION_COPY.intakeUrl}</span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                    <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs">{intakeUrl}</code>
                    {onCopy ?
                        <button
                            type="button"
                            className={opActionLinkAccent}
                            onClick={() => onCopy("url", intakeUrl)}
                            data-testid="distribution-copy-intake-url"
                        >
                            {copied === "url" ? "Copied" : "Copy"}
                        </button>
                    :   null}
                    <a
                        className={opActionLinkAccent}
                        href={intakeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="distribution-open-intake-url"
                    >
                        Open
                    </a>
                </div>
            </div>
            {createdLink.plaintext_token ?
                <details className="mt-3 rounded-md border border-dashed border-alloy-midnight/15 bg-white/60 px-3 py-2">
                    <summary className={clsx("cursor-pointer", opActionLinkAccent)}>
                        {DISTRIBUTION_COPY.advancedCredential}
                    </summary>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs">
                            {createdLink.plaintext_token}
                        </code>
                        {onCopy ?
                            <button
                                type="button"
                                className={opActionLinkAccent}
                                onClick={() => onCopy("credential", createdLink.plaintext_token!)}
                            >
                                {copied === "credential" ? "Copied" : "Copy"}
                            </button>
                        :   null}
                    </div>
                </details>
            :   null}
            {copyWarn ?
                <p className={clsx("mt-3", opMetadata)}>{copyWarn}</p>
            :   null}
        </div>
    );
}

function LinkRow({
    link,
    fallbackLabel,
    viewerTz,
    mode,
    busy,
    onToggleLink,
}: {
    link: DistributionLinkRow;
    fallbackLabel: string;
    viewerTz: string;
    mode: "form" | "packet";
    busy: boolean;
    onToggleLink?: (link: DistributionLinkRow, nextActive: boolean) => void;
}) {
    const label = distributionLinkLabel(link, fallbackLabel);
    const purpose = distributionLinkPurposeLine(link);
    const isPreview = distributionIsPreviewLink(link);

    return (
        <li className={clsx(opGroupedRowInner, !link.is_active && "opacity-75")} data-testid={`distribution-link-${link.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-alloy-midnight">{label}</p>
                    {purpose ?
                        <p className={clsx("mt-0.5 line-clamp-2", opMutedMeta)}>{purpose}</p>
                    :   null}
                    <p className={clsx("mt-0.5", opMutedMeta)}>
                        Created {formatDateTimeForUserDisplay(link.created_at, viewerTz)}
                        {link.expires_at ?
                            ` · Expires ${formatDateTimeForUserDisplay(link.expires_at, viewerTz)}`
                        :   ""}
                    </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {isPreview ?
                        <StatusBadge label={DISTRIBUTION_COPY.previewBadge} variant="info" />
                    :   null}
                    <StatusBadge
                        label={link.is_active ? DISTRIBUTION_COPY.activeBadge : DISTRIBUTION_COPY.inactiveBadge}
                        variant={link.is_active ? "success" : "neutral"}
                    />
                </div>
            </div>
            {mode === "packet" && onToggleLink ?
                <div className="mt-2">
                    <button
                        type="button"
                        className={opActionLinkAccent}
                        disabled={busy}
                        onClick={() => onToggleLink(link, !link.is_active)}
                        data-testid={`distribution-toggle-${link.id}`}
                    >
                        {link.is_active ? "Deactivate" : "Activate"}
                    </button>
                </div>
            :   null}
        </li>
    );
}

/** Shared distribution panel for forms and packets (OW-7). */
export function DistributionLinksPanel(props: DistributionLinksPanelProps) {
    const {
        mode,
        subjectName,
        canMutate = true,
        busy,
        error = null,
        links,
        createdLink,
        viewerTz,
        copied,
        copyWarn,
        onCopy,
        formKey,
        shareIntakeBlocked = false,
        shareIntakeBlockedLabel = "Add required fields first",
        shareIntakeBlockedMessage = null,
    } = props;

    const activeLinks = links.filter((l) => l.is_active);
    const inactiveLinks = links.filter((l) => !l.is_active);
    const fallbackLabel = mode === "form" ? "Intake link" : `${subjectName} link`;
    const intro = mode === "form" ? DISTRIBUTION_COPY.formIntro : DISTRIBUTION_COPY.packetIntro;
    const emptyCopy = mode === "form" ? DISTRIBUTION_COPY.emptyForm : DISTRIBUTION_COPY.emptyPacket;
    const primaryLabel = mode === "form" ? DISTRIBUTION_COPY.shareIntake : DISTRIBUTION_COPY.launchPacket;

    return (
        <div data-testid="distribution-links-panel" data-distribution-mode={mode}>
            {/*
              * ONE sentence, not two saying the same thing.
              *
              * `packetIntro` used to end with "Completed runs appear in the session inbox for
              * review" and this paragraph then said it again with a link. Where completed runs go is
              * the business of the Sessions region directly below, which already owns that link; a
              * send control does not need to explain review twice before the operator has sent
              * anything.
              */}
            <p className={opMetadata}>{intro}</p>

            {mode === "form" && shareIntakeBlocked && shareIntakeBlockedMessage ?
                <p className="mt-2 text-sm text-amber-900" data-testid="distribution-share-intake-blocked">
                    {shareIntakeBlockedMessage}
                </p>
            :   null}

            <div className="mt-3">
                {!canMutate ?
                    <p className={opMetadata}>{DISTRIBUTION_COPY.adminRequired}</p>
                :   <button
                        type="button"
                        className={opPrimaryActionButton}
                        disabled={busy || (mode === "form" && shareIntakeBlocked)}
                        onClick={mode === "form" ? props.onShareIntake : props.onLaunchPacket}
                        data-testid={mode === "form" ? "distribution-share-intake" : "distribution-launch-packet"}
                    >
                        {busy ?
                            mode === "form" ? "Creating…" : "Launching…"
                        : mode === "form" && shareIntakeBlocked ?
                            shareIntakeBlockedLabel
                        :   primaryLabel}
                    </button>
                }
            </div>

            {error ?
                <p className="mt-2 text-sm text-alloy-ember">{error}</p>
            :   null}
            {mode === "form" && formKey === MEDICATION_AUTHORIZATION_DEMO_FORM_KEY ?
                <p className={clsx("mt-2 max-w-2xl", opMetadata)}>
                    Demo links enable CRM intake when your org has an active cleaning vertical configured.
                </p>
            :   null}

            {createdLink ?
                <OneTimeLinkPanel createdLink={createdLink} copied={copied} copyWarn={copyWarn} onCopy={onCopy} />
            :   null}

            {/*
              * WHAT IS LIVE, AND THEN THE REST — KEPT, NOT SHOWN.
              *
              * Every link ever minted rendered as a full-width row, so on the certified Enrollment
              * packet this list was nine rows of mostly retired QA links and the whole section grew
              * to 1283px inside a 1250px viewport: the secondary capability was taller than the
              * screen and taller than the packet it belongs to. It also pushed the recipient input
              * so low that its own results menu opened past the fold.
              *
              * A deactivated link is still a record — what was sent, to whom, and when — so nothing
              * is dropped. It simply stops being first-class product content: active sends lead, the
              * retired ones sit behind one disclosure that says how many there are.
              */}
            <p className={clsx("mt-4 font-medium", opMetadata)}>
                {mode === "packet" ? DISTRIBUTION_COPY.packetLinksLead : DISTRIBUTION_COPY.activeLinksLead}
            </p>

            {activeLinks.length === 0 && inactiveLinks.length === 0 ?
                <p className={clsx("mt-3", opMetadata)}>{emptyCopy}</p>
            :   <>
                    {activeLinks.length > 0 ?
                        <ul className={clsx(opGroupedSurface, "mt-3")} data-testid="distribution-link-list">
                            {activeLinks.map((link) => (
                                <LinkRow
                                    key={link.id}
                                    link={link}
                                    fallbackLabel={fallbackLabel}
                                    viewerTz={viewerTz}
                                    mode={mode}
                                    busy={busy}
                                    onToggleLink={mode === "packet" ? props.onToggleLink : undefined}
                                />
                            ))}
                        </ul>
                    :   <p className={clsx("mt-3", opMetadata)}>{emptyCopy}</p>}

                    {inactiveLinks.length > 0 ?
                        <details className="mt-3" data-testid="distribution-link-history">
                            <summary className={clsx("cursor-pointer", opActionLinkAccent)}>
                                {`${DISTRIBUTION_COPY.historyToggle} (${inactiveLinks.length})`}
                            </summary>
                            <ul className={clsx(opGroupedSurface, "mt-2")} data-testid="distribution-link-history-list">
                                {inactiveLinks.map((link) => (
                                    <LinkRow
                                        key={link.id}
                                        link={link}
                                        fallbackLabel={fallbackLabel}
                                        viewerTz={viewerTz}
                                        mode={mode}
                                        busy={busy}
                                        onToggleLink={mode === "packet" ? props.onToggleLink : undefined}
                                    />
                                ))}
                            </ul>
                        </details>
                    :   null}
                </>
            }
        </div>
    );
}

/** Packet helper — copy URL when panel manages its own clipboard. */
export function copyDistributionIntakeUrl(payload: DistributionCreatedLinkPayload): void {
    const url = resolveDistributionEmbedUrl(payload);
    void navigator.clipboard.writeText(url).catch(() => {});
}

export function DistributionCopyUrlButton({
    createdLink,
    className,
}: {
    createdLink: DistributionCreatedLinkPayload;
    className?: string;
}) {
    return (
        <SecondaryButton
            type="button"
            className={clsx("!px-3 !py-2 text-sm", className)}
            onClick={() => copyDistributionIntakeUrl(createdLink)}
            data-testid="distribution-copy-url-button"
        >
            Copy link
        </SecondaryButton>
    );
}
