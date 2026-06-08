import type { InboxFolder, InboxScheduledSendListItem, InboxThreadListItem } from "@/lib/communications/inboxThreadTypes";
import { INBOX_FOLDERS } from "@/lib/communications/inboxThreadTypes";

export type InboxFolderCacheEntry = {
    threads: InboxThreadListItem[];
    scheduledSends: InboxScheduledSendListItem[];
    fetchedAt: number;
    error: string | null;
};

export type InboxFolderCacheState = Partial<Record<InboxFolder, InboxFolderCacheEntry>>;

export const INBOX_FOLDER_STALE_MS = 60_000;

export function inboxFoldersToPrefetch(): InboxFolder[] {
    return [...INBOX_FOLDERS];
}

export function shouldShowFolderInitialLoading(
    cache: InboxFolderCacheState,
    folder: InboxFolder
): boolean {
    return cache[folder] == null;
}

export function isFolderCacheStale(entry: InboxFolderCacheEntry | undefined, now = Date.now()): boolean {
    if (!entry) return true;
    return now - entry.fetchedAt > INBOX_FOLDER_STALE_MS;
}

export function mergeFolderCacheEntry(
    cache: InboxFolderCacheState,
    folder: InboxFolder,
    entry: InboxFolderCacheEntry
): InboxFolderCacheState {
    return { ...cache, [folder]: entry };
}

/** Preserve selected thread when switching folders if it still exists; modal avoids auto-select. */
export function resolveSelectedThreadIdAfterFolderLoad(args: {
    folder: InboxFolder;
    threads: InboxThreadListItem[];
    previousSelectedId: string | null;
    autoSelectFirst: boolean;
}): string | null {
    if (args.folder === "scheduled") return null;
    if (args.previousSelectedId && args.threads.some((t) => t.id === args.previousSelectedId)) {
        return args.previousSelectedId;
    }
    if (args.autoSelectFirst) return args.threads[0]?.id ?? null;
    return null;
}
