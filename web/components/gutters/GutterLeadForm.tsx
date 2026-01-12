"use client";

import { useState, FormEvent } from "react";
import PrimaryButton from "@/components/PrimaryButton";

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

export default function GutterLeadForm() {
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

  return (
    <div className="bg-white rounded-lg shadow-md p-6 md:p-8 border border-alloy-stone/30">
      <h2 className="text-2xl font-bold text-alloy-pine mb-6">
        Get Early Access Discount
      </h2>

      {submitStatus.type === "success" && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {submitStatus.message}
        </div>
      )}

      {submitStatus.type === "error" && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {submitStatus.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="first_name"
              className="block text-sm font-medium text-alloy-midnight mb-2"
            >
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="first_name"
              value={form.first_name}
              onChange={(e) =>
                setForm({ ...form, first_name: e.target.value })
              }
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper ${
                errors.first_name
                  ? "border-red-500"
                  : "border-alloy-stone/50"
              }`}
              required
            />
            {errors.first_name && (
              <p className="mt-1 text-sm text-red-600">{errors.first_name}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="last_name"
              className="block text-sm font-medium text-alloy-midnight mb-2"
            >
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="last_name"
              value={form.last_name}
              onChange={(e) =>
                setForm({ ...form, last_name: e.target.value })
              }
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper ${
                errors.last_name ? "border-red-500" : "border-alloy-stone/50"
              }`}
              required
            />
            {errors.last_name && (
              <p className="mt-1 text-sm text-red-600">{errors.last_name}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-alloy-midnight mb-2"
            >
              Phone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(555) 123-4567"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper ${
                errors.phone ? "border-red-500" : "border-alloy-stone/50"
              }`}
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-alloy-midnight mb-2"
            >
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              id="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper ${
                errors.email ? "border-red-500" : "border-alloy-stone/50"
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="address_line1"
            className="block text-sm font-medium text-alloy-midnight mb-2"
          >
            Address (Optional)
          </label>
          <input
            type="text"
            id="address_line1"
            value={form.address_line1}
            onChange={(e) =>
              setForm({ ...form, address_line1: e.target.value })
            }
            placeholder="123 Main St"
            className="w-full px-4 py-2 border border-alloy-stone/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper"
          />
        </div>

        <div>
          <label
            htmlFor="city"
            className="block text-sm font-medium text-alloy-midnight mb-2"
          >
            City (Optional)
          </label>
          <input
            type="text"
            id="city"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="Bend"
            className="w-full px-4 py-2 border border-alloy-stone/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper"
          />
        </div>

        <div>
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-alloy-midnight mb-2"
          >
            Notes (Optional)
          </label>
          <textarea
            id="notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={4}
            placeholder="Any additional information about your gutter cleaning needs..."
            className="w-full px-4 py-2 border border-alloy-stone/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper"
          />
        </div>

        <div className="pt-4">
          <PrimaryButton
            type="submit"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Get Early Access Discount"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

