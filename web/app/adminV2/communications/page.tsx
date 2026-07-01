/**
 * Deprecated standalone Communications Hub route.
 *
 * Operator IA: Templates and Announcements live in the Inbox / Command Center modal
 * (`InboxModal` → `CommunicationsModalTabPanel`). Settings → Communications remains
 * provider configuration only. This route is intentionally not linked from nav.
 */
export default function CommunicationsHubPage() {
    return (
        <main
            data-comms-hub-deprecated="true"
            className="flex h-[calc(100dvh-3.75rem)] items-center justify-center bg-[#F8F9FB] px-6 text-center text-sm text-alloy-midnight/55"
        >
            Communications templates and announcements are available from the Inbox modal in the workspace sidebar.
        </main>
    );
}
