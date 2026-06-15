"use client";

import {
    BosButton,
    BosMark,
    FileText,
    Globe,
    Inbox,
    Mail,
    MessageSquare,
    Phone,
    V3ActionRow,
    V3BosShell,
    V3ChannelCard,
    V3Divider,
    V3EmptyNote,
    V3MockupSection,
    V3ShellChrome,
    V3WorkspaceFrame,
} from "./IntakeV3MockupShared";

/**
 * Action Workspace V3 — interaction model mockups (empty-state first).
 * No textarea. No document canvas. Design sign-off only.
 */
export default function ActionWorkspaceIntakeV3MockupGallery() {
    return (
        <div className="min-h-screen bg-[#dfe2e8] px-6 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1480px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Design sign-off · V3 interaction models · not production
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Action Workspace V3 — Abandon The Form
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Four fundamentally different intake models. Empty state only — no giant textarea, no
                        document canvas, no review surface before content exists. BOS receives information;
                        the workspace evolves after material arrives.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">
                        /dev/action-workspace-intake-v3-mockups
                    </p>
                </header>

                {/* Concept A — Inbox */}
                <V3MockupSection
                    mockupId="concept-a-inbox"
                    conceptLabel="Concept A"
                    title="Inbox — a new inquiry has arrived"
                    summary="Workspace opens as an empty inbox. Material enters through discrete actions. No document surface until content exists."
                >
                    <V3WorkspaceFrame>
                        <V3BosShell>
                            <V3ShellChrome />
                            <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
                                <div className="mx-auto flex w-full max-w-md flex-col gap-4">
                                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/40">
                                        <Inbox className="h-3.5 w-3.5" strokeWidth={2} />
                                        Inbox
                                    </div>
                                    <V3Divider />
                                    <div className="flex flex-col gap-2">
                                        <V3ActionRow icon={Mail} label="Drop email" hint="Forward or paste .eml" />
                                        <V3ActionRow icon={MessageSquare} label="Paste inquiry" />
                                        <V3ActionRow icon={Phone} label="Add call note" />
                                    </div>
                                    <V3Divider />
                                    <V3EmptyNote>No content yet — BOS is waiting for material</V3EmptyNote>
                                </div>
                            </div>
                        </V3BosShell>
                    </V3WorkspaceFrame>
                </V3MockupSection>

                {/* Concept B — Intake Tray */}
                <V3MockupSection
                    mockupId="concept-b-intake-tray"
                    conceptLabel="Concept B"
                    title="Intake Tray — BOS is waiting for material"
                    summary="Channel selection replaces the textarea. Choosing a channel changes what happens next — work entering the system, not data entering a form."
                >
                    <V3WorkspaceFrame>
                        <V3BosShell>
                            <V3ShellChrome
                                title="Work with BOS"
                                subtitle="Choose what BOS should review — the workspace adapts to your selection."
                            />
                            <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
                                <div className="mx-auto w-full max-w-lg">
                                    <p className="text-[15px] font-semibold text-alloy-midnight">
                                        What would you like BOS to review?
                                    </p>
                                    <p className="mt-1 text-[13px] text-alloy-midnight/45">
                                        Select a channel — no blank canvas until you choose.
                                    </p>
                                    <div className="mt-5 grid grid-cols-2 gap-3">
                                        <V3ChannelCard icon={Mail} label="Email" selected />
                                        <V3ChannelCard icon={Phone} label="Call Note" />
                                        <V3ChannelCard icon={Globe} label="Website Inquiry" />
                                        <V3ChannelCard icon={FileText} label="Paste Text" />
                                    </div>
                                    <div className="mt-5 rounded-xl border border-[#00A283]/15 bg-[#00A283]/[0.04] px-4 py-3">
                                        <p className="text-[12px] font-medium text-[#007A63]">
                                            Email selected
                                        </p>
                                        <p className="mt-1 text-[12px] text-alloy-midnight/55">
                                            Drop an email file or paste the message — a review surface appears
                                            only after content arrives.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </V3BosShell>
                    </V3WorkspaceFrame>
                </V3MockupSection>

                {/* Concept C — Conversation */}
                <V3MockupSection
                    mockupId="concept-c-conversation"
                    conceptLabel="Concept C"
                    title="Conversation — BOS prompts, operator responds"
                    summary="Minimal prompt with two paths. No document chrome. No blank canvas. The workspace transforms once information exists."
                >
                    <V3WorkspaceFrame>
                        <V3BosShell>
                            <V3ShellChrome showStepRail={false} />
                            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8">
                                <div className="flex w-full max-w-sm flex-col items-center text-center">
                                    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00A283]/10">
                                        <BosMark size="md" horizon />
                                    </div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#007A63]">
                                        BOS
                                    </p>
                                    <h3 className="mt-3 text-[22px] font-semibold tracking-tight text-alloy-midnight">
                                        Tell me about the family.
                                    </h3>
                                    <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-alloy-midnight/45">
                                        Paste an inquiry or enter details manually — I&apos;ll review and
                                        prepare findings for your approval.
                                    </p>
                                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                                        <BosButton variant="primary" size="md" label="Paste inquiry" />
                                        <BosButton variant="secondary" size="md" label="Enter manually" />
                                    </div>
                                </div>
                            </div>
                        </V3BosShell>
                    </V3WorkspaceFrame>
                </V3MockupSection>

                {/* Concept D — Drop Zone */}
                <V3MockupSection
                    mockupId="concept-d-drop-zone"
                    conceptLabel="Concept D"
                    title="Drop Zone — calm, premium whitespace"
                    summary="Modern creative-software feel. One focal area. Material arrives through drop or paste actions — no visible form until content exists."
                >
                    <V3WorkspaceFrame>
                        <V3BosShell>
                            <V3ShellChrome
                                title="Tell BOS about the family"
                                subtitle="Drop or paste inquiry material — BOS reviews when content arrives."
                            />
                            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 py-6">
                                <div className="flex w-full max-w-md flex-col items-center">
                                    <div className="flex h-28 w-28 items-center justify-center rounded-full border border-dashed border-alloy-stone/20 bg-[#FAFBFC]">
                                        <div className="flex flex-col items-center gap-1 text-alloy-midnight/30">
                                            <span className="text-2xl leading-none">↓</span>
                                        </div>
                                    </div>
                                    <p className="mt-6 text-[15px] font-medium text-alloy-midnight/70">
                                        Drop an email
                                    </p>
                                    <p className="mt-1 text-[13px] text-alloy-midnight/40">or</p>
                                    <div className="mt-4 flex flex-col items-center gap-2">
                                        <button
                                            type="button"
                                            className="text-[14px] font-medium text-[#007A63] hover:text-[#005f4d]"
                                        >
                                            Paste a note
                                        </button>
                                        <button
                                            type="button"
                                            className="text-[14px] font-medium text-[#007A63] hover:text-[#005f4d]"
                                        >
                                            Paste a website inquiry
                                        </button>
                                    </div>
                                    <V3EmptyNote>
                                        <span className="mt-8 block">
                                            No form visible until content arrives
                                        </span>
                                    </V3EmptyNote>
                                </div>
                            </div>
                        </V3BosShell>
                    </V3WorkspaceFrame>
                </V3MockupSection>

                <footer className="rounded-xl border border-alloy-midnight/10 bg-white/70 px-5 py-4 text-sm text-alloy-midnight/65">
                    <p className="font-semibold text-alloy-midnight">Abandoned patterns (V2 and production)</p>
                    <p className="mt-1">
                        Giant textarea · blank document canvas · review surface before content · lonely Analyze
                        button below a form field.
                    </p>
                </footer>
            </div>
        </div>
    );
}
