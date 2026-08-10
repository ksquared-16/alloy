"use client";

/**
 * Organization Access workspace — Collection → Selected → Focused Workspace, Locations/Financials
 * quality shell around Users / Roles / Access Scopes / Security.
 *
 * Replaces the old technical-tab `UsersRolesSettingsClient` as the primary section=users|roles
 * experience. See `.alloy-agent-evidence/access-ui-discovery/ACCESS-UI-DISCOVERY.md`.
 */

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import AccessUsersConfigurationPage from "@/components/adminV2/settings/access/AccessUsersConfigurationPage";
import AccessRolesConfigurationPage from "@/components/adminV2/settings/access/AccessRolesConfigurationPage";
import AccessScopesPage from "@/components/adminV2/settings/access/AccessScopesPage";
import AccessSecurityPage from "@/components/adminV2/settings/access/AccessSecurityPage";
import {
    ACCESS_WORKSPACE_CHAPTER_META,
    accessWorkspaceChapterHref,
    type AccessCommandKey,
    type AccessWorkspaceChapter,
} from "@/lib/access/accessChapterRoutes";

/**
 * Tabs render the chapters the *server* said this principal may see — never the full chapter
 * constant. Drawing every chapter and letting the route refuse the click is how navigation and
 * admission drift apart; `05…§7.7` requires them to filter from one declaration. The tier A check
 * `tests/access/surfaceCapabilityDeclaration.test.ts` asserts this file cannot reach that constant.
 */
function ChapterTabs({
    active,
    chapters,
    onSelect,
}: {
    active: AccessWorkspaceChapter;
    chapters: readonly AccessWorkspaceChapter[];
    onSelect: (chapter: AccessWorkspaceChapter) => void;
}) {
    return (
        <div
            className="flex flex-wrap items-end gap-1 border-b border-alloy-stone/20"
            data-testid="access-workspace-chapter-tabs"
            role="tablist"
            aria-label="Access sections"
        >
            {chapters.map((chapter) => {
                const selected = chapter === active;
                return (
                    <button
                        key={chapter}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        data-testid={`access-chapter-tab-${chapter}`}
                        onClick={() => onSelect(chapter)}
                        className={`px-3 py-1.5 text-[12px] -mb-px border-b-2 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/35 rounded-sm ${
                            selected
                                ? "border-alloy-bend-pine text-alloy-bend-pine font-semibold"
                                : "border-transparent text-alloy-midnight/55 hover:text-alloy-midnight"
                        }`}
                    >
                        {ACCESS_WORKSPACE_CHAPTER_META[chapter].label}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * **W-49: this component no longer carries a `canManage` prop.**
 *
 * It used to render a *notice* — "You need org admin or the `settings.users_roles` permission" —
 * inside the fully-rendered workspace shell, chapter tabs and all. That is a surface reached, and
 * `07/AE-4` rejects it. The gate is now at the route boundary, where a refusal is a refusal:
 * both pages that render this surface redirect before they reach it.
 *
 * A prop that can only ever be `true` reads like a second gate and is none — it is the display
 * prop `05…§3.3` describes as *"a display prop, not an access decision"*, and leaving it would
 * invite the next author to trust it. What keeps the property true instead is a tier A check
 * (`web/tests/access/surfaceCapabilityDeclaration.test.ts`): every page rendering this surface
 * must call the declared capability's gate, and it discovers those pages from disk.
 *
 * `chapters` is not that prop returning under a new name. It carries no *decision* — the decision
 * was made and enforced at the boundary; this is the enforced result, so navigation cannot offer
 * a chapter admission would refuse.
 */
export default function AccessWorkspaceSurface({
    section,
    chapters,
    commands,
}: {
    section: AccessWorkspaceChapter;
    chapters: readonly AccessWorkspaceChapter[];
    /**
     * W49-F1. Same standing as `chapters`, one level in: controls whose route enforces something
     * other than the capability that admitted the chapter. An enforced result, not a decision.
     */
    commands: readonly AccessCommandKey[];
}) {
    const router = useRouter();
    const meta = ACCESS_WORKSPACE_CHAPTER_META[section];

    const selectChapter = (next: AccessWorkspaceChapter) => {
        router.push(accessWorkspaceChapterHref(next), { scroll: false });
    };

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="access-workspace-surface" data-chapter={section}>
            <ConfigurationContext
                title="Access"
                titleIcon={<KeyRound className="h-5 w-5" strokeWidth={2} />}
                subtitle={meta.description}
                testId="access-configuration-context"
            >
                <div className="mt-1.5">
                    <ChapterTabs active={section} chapters={chapters} onSelect={selectChapter} />
                </div>
            </ConfigurationContext>

            <ConfigurationShell testId={`access-chapter-shell-${section}`}>
                {section === "users" ?
                    <div data-testid="access-chapter-users">
                        <AccessUsersConfigurationPage commands={commands} />
                    </div>
                : section === "roles" ?
                    <div data-testid="access-chapter-roles">
                        <AccessRolesConfigurationPage />
                    </div>
                : section === "scopes" ?
                    <div data-testid="access-chapter-scopes">
                        <AccessScopesPage />
                    </div>
                :   <div data-testid="access-chapter-security">
                        <AccessSecurityPage />
                    </div>
                }
            </ConfigurationShell>
        </div>
    );
}
