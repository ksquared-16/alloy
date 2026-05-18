import Link from "next/link";
import FieldSectionsClient from "@/app/admin/system/field-sections/FieldSectionsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsFieldSectionsPage() {
    return (
        <div className="w-full max-w-6xl space-y-3 pb-2">
            <p className="text-xs text-alloy-midnight/45">
                <Link href="/adminV2/settings" className="font-medium text-alloy-pine hover:underline">
                    ← Back to Settings
                </Link>
            </p>
            <FieldSectionsClient adminV2Chrome />
        </div>
    );
}
