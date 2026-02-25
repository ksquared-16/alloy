"use client";

/**
 * Shown on config pages (Entity Labels, Statuses, Workflows) when org config is locked.
 * Tells user to unlock in System Settings; use with disabled Save/Reset when locked.
 */
export default function ConfigLockBanner() {
    return (
        <div
            className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="alert"
        >
            <strong>Configuration is locked.</strong> Unlock in System Settings to change
            entity labels, statuses, or workflows.
        </div>
    );
}
