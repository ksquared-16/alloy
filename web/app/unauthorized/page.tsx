import Link from "next/link";

export default function UnauthorizedPage() {
    return (
        <div className="min-h-screen bg-alloy-stone flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg border border-alloy-stone/30 p-8 text-center">
                <h1 className="text-2xl font-bold text-alloy-midnight mb-2">Access denied</h1>
                <p className="text-alloy-midnight/70 mb-6">
                    You don’t have permission to access the admin portal. If you believe this is an error, contact your administrator.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        href="/login"
                        className="px-4 py-2 bg-alloy-blue text-white rounded-md font-medium hover:opacity-90"
                    >
                        Sign in again
                    </Link>
                    <Link
                        href="/"
                        className="px-4 py-2 border border-alloy-stone/60 text-alloy-midnight rounded-md font-medium hover:bg-alloy-stone/30"
                    >
                        Go to home
                    </Link>
                </div>
            </div>
        </div>
    );
}
