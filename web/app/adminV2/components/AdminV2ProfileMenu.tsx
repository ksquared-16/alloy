"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { clearVolatileRuntimeSessionState } from "@/lib/adminV2/runtime/runtimeSessionState";
import { palette, neutral, derived } from "@/styles/tokens/colors";
import { brand } from "@/styles/tokens/colors";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import { CANONICAL_ADMIN_CONFIG_LANDING } from "@/lib/admin/canonicalAdminRoutes";

const SETTINGS_HREF = CANONICAL_ADMIN_CONFIG_LANDING;

function displayInitial(email: string): string {
    const local = email.split("@")[0]?.trim() ?? "";
    if (!local) return "?";
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
    }
    return local.slice(0, 2).toUpperCase();
}

function displayNameFromEmail(email: string): string {
    const local = email.split("@")[0]?.trim() ?? "";
    if (!local) return "Account";
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) {
        return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    }
    return local.charAt(0).toUpperCase() + local.slice(1);
}

export default function AdminV2ProfileMenu() {
    const router = useRouter();
    const menuId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const supabase = createClient();
                const { data } = await supabase.auth.getUser();
                if (cancelled) return;
                const user = data.user;
                const e = user?.email?.trim();
                setEmail(e && e.length > 0 ? e : null);
                const meta = user?.user_metadata as { avatar_url?: string; picture?: string } | undefined;
                const url =
                    (typeof meta?.avatar_url === "string" && meta.avatar_url) ||
                    (typeof meta?.picture === "string" && meta.picture) ||
                    null;
                setAvatarUrl(url);
            } catch {
                if (!cancelled) {
                    setEmail(null);
                    setAvatarUrl(null);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onDoc = (ev: MouseEvent) => {
            if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
        };
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const onSignOut = useCallback(async () => {
        setOpen(false);
        clearVolatileRuntimeSessionState();
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    }, [router]);

    const accountLabel = email ? displayNameFromEmail(email) : "Account";

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                type="button"
                id={`${menuId}-trigger`}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={`${menuId}-menu`}
                aria-label={accountLabel}
                title={accountLabel}
                onClick={() => setOpen((o) => !o)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                style={{
                    backgroundColor: derived.searchBgOnPrimary,
                    border: `1px solid ${derived.topBarDivider}`,
                    color: neutral.surface,
                }}
            >
                {avatarUrl ? (
                    <img
                        src={avatarUrl}
                        alt=""
                        className="h-full w-full rounded-full object-cover"
                        referrerPolicy="no-referrer"
                    />
                ) : email ? (
                    <span className="text-sm font-semibold" aria-hidden>
                        {displayInitial(email)}
                    </span>
                ) : (
                    <User size={18} strokeWidth={1.75} aria-hidden />
                )}
            </button>
            {open ? (
                <div
                    id={`${menuId}-menu`}
                    role="menu"
                    aria-labelledby={`${menuId}-trigger`}
                    className="absolute right-0 top-full z-[200] mt-2 min-w-[14rem] rounded-md border py-1 shadow-lg"
                    style={{
                        backgroundColor: neutral.surface,
                        borderColor: neutral.border,
                        color: palette.midnightForge,
                    }}
                >
                    <div
                        className="border-b px-3 py-2.5"
                        style={{ borderColor: neutral.border }}
                        role="presentation"
                    >
                        <div className="text-sm font-semibold text-alloy-midnight truncate">{accountLabel}</div>
                        {email ? (
                            <div className="text-xs text-alloy-midnight/60 truncate mt-0.5">{email}</div>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        role="menuitem"
                        disabled
                        className="block w-full px-3 py-2.5 text-left text-sm opacity-50 cursor-not-allowed"
                        title="Profile page coming soon"
                    >
                        Profile
                    </button>
                    <AdminV2NavLink
                        href={SETTINGS_HREF}
                        className="block px-3 py-2.5 text-sm font-medium hover:bg-alloy-stone/10 no-underline"
                        style={{ color: brand.primary }}
                        onClick={() => setOpen(false)}
                    >
                        Settings
                    </AdminV2NavLink>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => void onSignOut()}
                        className="block w-full px-3 py-2.5 text-left text-sm font-medium hover:bg-alloy-stone/10"
                        style={{ color: palette.midnightForge }}
                    >
                        Sign out
                    </button>
                </div>
            ) : null}
        </div>
    );
}
