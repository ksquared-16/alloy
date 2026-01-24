"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import PrimaryButton from "@/components/PrimaryButton";
import { REDIRECT_DELAY_MS } from "@/lib/ui";

interface FormData {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address_line1: string;
  city: string;
  notes: string;
}

interface FormErrors {
  [key: string]: string;
}

interface GutterLeadFormProps {
  onSuccess?: () => void;
}

export default function GutterLeadForm({ onSuccess }: GutterLeadFormProps = {} as GutterLeadFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    address_line1: "",
    city: "",
    notes: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  // Auto-redirect after delay on success
  useEffect(() => {
    if (submitStatus.type === "success") {
      // Call onSuccess callback if provided (e.g., to close modal)
      if (onSuccess) {
        onSuccess();
      }
      const timer = setTimeout(() => {
        router.push("/");
      }, REDIRECT_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [submitStatus.type, router, onSuccess]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.first_name.trim()) {
      newErrors.first_name = "First name is required";
    }

    if (!form.last_name.trim()) {
      newErrors.last_name = "Last name is required";
    }

    // Require at least phone OR email
    if (!form.phone.trim() && !form.email.trim()) {
      newErrors.phone = "Phone or email is required";
      newErrors.email = "Phone or email is required";
    }

    // Validate email format if provided
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Validate phone format if provided (basic: at least 10 digits)
    if (form.phone.trim()) {
      const digitsOnly = form.phone.replace(/\D/g, "");
      if (digitsOnly.length < 10) {
        newErrors.phone = "Please enter a valid phone number";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus({ type: null, message: "" });

    try {
      const response = await fetch("/api/leads/gutters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          address_line1: form.address_line1.trim() || undefined,
          city: form.city.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to submit. Please try again.");
      }

      setSubmitStatus({
        type: "success",
        message:
          "Thank you! We've received your information and will notify you when gutter cleaning becomes available in your area.",
      });

      // Reset form on success
      setForm({
        first_name: "",
        last_name: "",
        phone: "",
        email: "",
        address_line1: "",
        city: "",
        notes: "",
      });
    } catch (error: any) {
      setSubmitStatus({
        type: "error",
        message: error.message || "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Match cleaning form styling exactly
  const labelClass = "block text-xs font-semibold uppercase tracking-wide mb-1 text-alloy-midnight/70";
  const inputBase = "w-full rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2";
  const inputClass = inputBase + " border border-alloy-stone/80 bg-white focus:ring-alloy-blue focus:border-alloy-blue";
  const errorInputClass = inputBase + " border-red-500 bg-white focus:ring-red-500 focus:border-red-500";

  // If success, only show thank-you message
  if (submitStatus.type === "success") {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 md:p-8 border border-alloy-stone/30">
        <div className="rounded-lg border border-alloy-juniper/30 bg-alloy-juniper/10 p-6 text-center">
          <p className="text-lg font-semibold text-alloy-midnight mb-2">
            {submitStatus.message}
          </p>
          <p className="text-xs text-alloy-midnight/60">
            Redirecting to homepage...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 md:p-8 border border-alloy-stone/30">
      {submitStatus.type === "error" && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
          {submitStatus.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="first_name" className={labelClass}>
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="first_name"
              value={form.first_name}
              onChange={(e) =>
                setForm({ ...form, first_name: e.target.value })
              }
              className={errors.first_name ? errorInputClass : inputClass}
              required
            />
            {errors.first_name && (
              <p className="mt-1 text-xs text-red-600">{errors.first_name}</p>
            )}
          </div>

          <div>
            <label htmlFor="last_name" className={labelClass}>
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="last_name"
              value={form.last_name}
              onChange={(e) =>
                setForm({ ...form, last_name: e.target.value })
              }
              className={errors.last_name ? errorInputClass : inputClass}
              required
            />
            {errors.last_name && (
              <p className="mt-1 text-xs text-red-600">{errors.last_name}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone {!form.email.trim() && <span className="text-red-500">*</span>}
            </label>
            <input
              type="tel"
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(555) 123-4567"
              className={errors.phone ? errorInputClass : inputClass}
            />
            {errors.phone && (
              <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
            )}
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>
              Email {!form.phone.trim() && <span className="text-red-500">*</span>}
            </label>
            <input
              type="email"
              id="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              className={errors.email ? errorInputClass : inputClass}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="address_line1" className={labelClass}>
            Address
          </label>
          <input
            type="text"
            id="address_line1"
            value={form.address_line1}
            onChange={(e) =>
              setForm({ ...form, address_line1: e.target.value })
            }
            placeholder="123 Main St"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={4}
            placeholder="Any additional information about your gutter cleaning needs..."
            className={inputClass}
          />
        </div>

        <div className="pt-2 flex justify-center">
          <PrimaryButton
            type="submit"
            disabled={isSubmitting}
            className="w-full md:w-auto"
          >
            {isSubmitting ? "Submitting..." : "Get Early Access Discount"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

