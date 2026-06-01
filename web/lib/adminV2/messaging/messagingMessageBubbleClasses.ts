/** Shared Bend Pine / neutral bubble styling for Messaging V2 surfaces. */

export function messagingMessageBubbleShellClass(inbound: boolean): string {
    if (inbound) {
        return "border-[#00A283]/18 bg-[#E8F6F2]/90 text-alloy-midnight/90";
    }
    return "border-[#00A283]/28 bg-[#00A283]/12 text-alloy-midnight";
}

export function messagingMessageBubbleMetaClass(inbound: boolean): string {
    return inbound ? "text-alloy-midnight/45" : "text-alloy-midnight/50";
}

export function messagingMessageBubbleBodyClass(inbound: boolean): string {
    return inbound ? "text-alloy-midnight/90" : "text-alloy-midnight";
}
