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
    ACCESS_WORKSPACE_CHAPTERS,
    ACCESS_WORKSPACE_CHAPTER_META,
    accessWorkspaceChapterHref,
    type AccessWorkspaceChapter,
} from "@/lib/access/accessChapterRoutes";

function ChapterTabs({
    active,
    onSelect,
}: {
    active: AccessWorkspaceChapter;
    onSelect: (chapter: AccessWorkspaceChapter) => void;
}) {
    return (
        <div
            className="flex flex-wrap items-end gap-1 border-b border-alloy-stone/20"
            data-testid="access-workspace-chapter-tabs"
            role="tablist"
            aria-label="Access sections"
        >
            {ACCESS_WORKSPACE_CHAPTERS.map((chapter) => {
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

export default function AccessWorkspaceSurface({
    section,
    canManage,
}: {
    section: AccessWorkspaceChapter;
    canManage: boolean;
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
                    <ChapterTabs active={section} onSelect={selectChapter} />
                </div>
            </ConfigurationContext>

            <ConfigurationShell testId={`access-chapter-shell-${section}`}>
                {!canManage ?
                    <div
                        className="rounded-lg border border-alloy-forge/12 bg-white/60 px-4 py-3 text-sm text-alloy-midnight/75"
                        data-testid="access-permission-denied"
                    >
                        You need org <span className="font-medium text-alloy-midnight">admin</span> or the{" "}
                        <code className="rounded bg-alloy-forge/10 px-1">settings.users_roles</code> permission to view
                        or change users, roles, access scopes, or security.
                    </div>
                : section === "users" ?
                    <div data-testid="access-chapter-users">
                        <AccessUsersConfigurationPage />
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
