"use client";

/**
 * Shown on config pages when org config is locked.
 * Industry and entity labels cannot be changed until unlocked.
 */
export default function ConfigLockBanner() {
    return (
        <div
            className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="alert"
        >
            Configuration is locked for this org. Industry and entity labels cannot be changed.
        </div>
    );
}
