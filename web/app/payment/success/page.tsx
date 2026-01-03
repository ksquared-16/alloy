import { Suspense } from "react";
import PaymentSuccessClient from "./SuccessClient";
import Section from "@/components/Section";

export default function PaymentSuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center py-12 px-4">
                <Section className="max-w-md w-full">
                    <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-lg p-8 md:p-10 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alloy-blue border-t-transparent mb-4"></div>
                        <p className="text-alloy-midnight/70">Loading...</p>
                    </div>
                </Section>
            </div>
        }>
            <PaymentSuccessClient />
        </Suspense>
    );
}

