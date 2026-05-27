/** Launch AdminV2 Quick message modal with a pre-selected person (queue / drawer). */

export type QuickMessageLaunchSeed = {
    personId: string;
    displayName?: string;
    email?: string | null;
    phone?: string | null;
};

export const ADMINV2_OPEN_QUICK_MESSAGE_EVENT = "adminv2:open-quick-message";

export function launchAdminV2QuickMessage(seed: QuickMessageLaunchSeed): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent<QuickMessageLaunchSeed>(ADMINV2_OPEN_QUICK_MESSAGE_EVENT, { detail: seed }),
    );
}
