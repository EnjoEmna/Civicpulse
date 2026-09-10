import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, UploadSimple, CheckCircle, Warning, X } from "@phosphor-icons/react";
import type { ComplaintCategory } from "../types/complaint";

const CATEGORY_OPTIONS: { value: ComplaintCategory; label: string }[] = [
  { value: "roads", label: "Roads & Potholes" },
  { value: "water_supply", label: "Water Supply" },
  { value: "electricity", label: "Electricity / Streetlights" },
  { value: "sanitation", label: "Sanitation & Garbage" },
  { value: "public_safety", label: "Public Safety" },
  { value: "other", label: "Other" },
];

type Step = "details" | "location" | "review" | "submitted";

export default function ReportIssue() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("details");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ComplaintCategory | "">("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function validateDetails() {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give your report a short title.";
    if (!category) next.category = "Choose the category that best fits.";
    if (description.trim().length < 15) next.description = "Add a bit more detail (at least 15 characters).";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateLocation() {
    const next: Record<string, string> = {};
    if (!address.trim()) next.address = "Enter or pin the location of the issue.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // TODO: build FormData and call api.createComplaint(formData)
    await new Promise((r) => setTimeout(r, 900));
    setSubmitting(false);
    setStep("submitted");
  }

  const steps: { key: Step; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "location", label: "Location" },
    { key: "review", label: "Review" },
  ];

  if (step === "submitted") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-surface px-6 py-14 text-center">
        <CheckCircle size={48} weight="fill" className="text-status-resolved" />
        <h1 className="text-xl font-bold text-ink">Report submitted</h1>
        <p className="text-sm text-ink-soft">
          Your complaint has been logged and assigned reference{" "}
          <span className="font-mono font-semibold text-ink">#CP-10482</span>. You'll get updates as it
          progresses.
        </p>
        <div className="mt-2 flex gap-3">
          <button
            onClick={() => navigate("/complaints")}
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-strong"
          >
            Track this complaint
          </button>
          <button
            onClick={() => navigate("/")}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-ink hover:bg-primary-soft/50"
          >
            Back home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-ink">Report an Issue</h1>
      <p className="mb-6 text-sm text-ink-soft">Takes about two minutes.</p>

      {/* Step indicator */}
      <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
        {steps.map((s, i) => {
          const isActive = s.key === step;
          const isDone = steps.findIndex((x) => x.key === step) > i;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isDone
                    ? "bg-status-resolved text-white"
                    : isActive
                      ? "bg-primary text-white"
                      : "bg-primary-soft text-primary"
                }`}
              >
                {isDone ? <CheckCircle size={16} weight="fill" /> : i + 1}
              </span>
              <span className={`text-sm font-medium ${isActive ? "text-ink" : "text-ink-soft"}`}>{s.label}</span>
              {i < steps.length - 1 && <span className="mx-1 h-px flex-1 bg-border" />}
            </li>
          );
        })}
      </ol>

      {step === "details" && (
        <form
          className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (validateDetails()) setStep("location");
          }}
          noValidate
        >
          <Field label="Title" htmlFor="title" error={errors.title}>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Large pothole near bus stop"
              className={inputClass(!!errors.title)}
            />
          </Field>

          <Field label="Category" htmlFor="category" error={errors.category}>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
              className={inputClass(!!errors.category)}
            >
              <option value="">Select a category</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            error={errors.description}
            helper="What's wrong, and how long has it been like this?"
          >
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={inputClass(!!errors.description)}
            />
          </Field>

          <Field label="Photos (optional)" htmlFor="evidence">
            <label
              htmlFor="evidence"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-border py-6 text-center hover:border-primary hover:bg-primary-soft/30"
            >
              <UploadSimple size={22} className="text-ink-soft" />
              <span className="text-sm text-ink-soft">Tap to add photos as evidence</span>
              <input
                id="evidence"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs text-primary"
                  >
                    {f.name}
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remove ${f.name}`}
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <button
            type="submit"
            className="mt-2 rounded-md bg-primary py-3 text-sm font-semibold text-white transition-all hover:bg-primary-strong active:translate-y-px"
          >
            Continue to Location
          </button>
        </form>
      )}

      {step === "location" && (
        <form
          className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (validateLocation()) setStep("review");
          }}
          noValidate
        >
          <div className="flex h-48 items-center justify-center rounded-md border border-border bg-bg text-sm text-ink-soft">
            <MapPin size={18} className="mr-2 text-primary" /> Map picker — tap to drop a pin
          </div>

          <Field label="Address" htmlFor="address" error={errors.address}>
            <input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, landmark, or area"
              className={inputClass(!!errors.address)}
            />
          </Field>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("details")}
              className="flex-1 rounded-md border border-border py-3 text-sm font-semibold text-ink hover:bg-primary-soft/50"
            >
              Back
            </button>
            <button
              type="submit"
              className="flex-1 rounded-md bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-strong active:translate-y-px"
            >
              Review
            </button>
          </div>
        </form>
      )}

      {step === "review" && (
        <form
          className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6"
          onSubmit={handleSubmit}
        >
          <SummaryRow label="Title" value={title} />
          <SummaryRow label="Category" value={CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? "—"} />
          <SummaryRow label="Description" value={description} />
          <SummaryRow label="Address" value={address} />
          <SummaryRow label="Photos" value={files.length ? `${files.length} attached` : "None"} />

          <div className="flex items-start gap-2 rounded-md bg-primary-soft/50 px-3 py-2.5 text-xs text-ink-soft">
            <Warning size={16} className="mt-0.5 shrink-0 text-primary" />
            Submitting a false or misleading report may result in your account being restricted.
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("location")}
              className="flex-1 rounded-md border border-border py-3 text-sm font-semibold text-ink hover:bg-primary-soft/50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-md bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-strong active:translate-y-px disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit Report"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  helper,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {helper && !error && <span className="text-xs text-ink-soft">{helper}</span>}
      {error && (
        <span className="flex items-center gap-1 text-xs font-medium text-status-rejected">
          <Warning size={12} /> {error}
        </span>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-3 last:border-0 last:pb-0">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</span>
      <span className="text-sm text-ink">{value || "—"}</span>
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `w-full rounded-md border bg-surface px-3 py-2.5 text-sm text-ink focus:border-primary ${
    hasError ? "border-status-rejected" : "border-border"
  }`;
}
