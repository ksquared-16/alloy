import Link from "next/link";
import FieldSectionsClient from "@/app/admin/system/field-sections/FieldSectionsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsFieldSectionsPage() {
    return (
        <div className="w-full max-w-6xl space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-alloy-midnight/40">Diagnostics · Advanced</p>
            <p className="text-xs text-alloy-midnight/50">
                <Link href="/adminV2/settings" className="font-medium text-alloy-pine hover:underline">
                    Settings
                </Link>
                {" · "}
                <Link href="/adminV2/settings/layouts" className="font-medium text-alloy-pine hover:underline">
                    Record layouts
                </Link>{" "}
                control drawer section order.
            </p>
            <FieldSectionsClient adminV2Chrome />
        </div>
    );
}
