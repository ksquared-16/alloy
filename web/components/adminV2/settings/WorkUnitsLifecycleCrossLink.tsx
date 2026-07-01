import Link from "next/link";
import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

export default function WorkUnitsLifecycleCrossLink() {
    return (
        <p
            className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.04] px-3 py-2 text-xs leading-relaxed text-alloy-midnight/70"
            data-testid="work-units-lifecycle-crosslink"
        >
            Queues group families by lifecycle stage. Configure what each stage requires on{" "}
            <Link href={ADMIN_V2_SETTINGS_LIFECYCLE_PATH} className="font-medium text-alloy-pine hover:underline">
                Lifecycle
            </Link>
            .
        </p>
    );
}
