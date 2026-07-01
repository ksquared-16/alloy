import FieldSectionsClient from "@/app/legacy-admin/system/field-sections/FieldSectionsClient";
import { SETTINGS_FIELD_SECTIONS_SUBTITLE } from "@/lib/adminV2/settingsPageSubtitles";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsFieldSectionsPage() {
    return (
        <div className="w-full min-w-0 space-y-3 pb-2">
            <header className="space-y-0.5">
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Field grouping</h1>
                <p className="max-w-2xl text-sm text-alloy-midnight/60">{SETTINGS_FIELD_SECTIONS_SUBTITLE}</p>
            </header>
            <FieldSectionsClient adminV2Chrome hidePageHeader />
        </div>
    );
}
