"use client";

import * as React from "react";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Select,
  StatePanel,
  StatusPill,
  toast,
} from "@rentbrown/ui";
import type { KycDocumentKind, KycGender, KycPoaType, KycSummary } from "@rentbrown/types";

import { useSaveKycDraft, useSubmitKyc, useUploadKycDocument } from "../../lib/data/hooks";

const GENDERS: Array<{ value: KycGender; label: string }> = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const POA_TYPES: Array<{ value: KycPoaType; label: string }> = [
  { value: "UTILITY_BILL", label: "Utility bill" },
  { value: "ELECTRICITY_BILL", label: "Electricity bill" },
  { value: "BANK_STATEMENT", label: "Bank statement" },
  { value: "OTHER", label: "Other document" },
];

function DocUpload({
  kind,
  label,
  hint,
  accept,
  uploaded,
  busy,
  disabled,
  onPick,
}: {
  kind: KycDocumentKind;
  label: string;
  hint: string;
  accept: string;
  uploaded: boolean;
  busy: boolean;
  disabled: boolean;
  onPick: (kind: KycDocumentKind, file: File) => void;
}) {
  const inputId = `kyc-doc-${kind.toLowerCase()}`;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary-soft text-primary">
          <FileText className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {uploaded ? (
        <StatusPill tone="success" className="shrink-0">
          <CheckCircle2 className="mr-1 size-3" aria-hidden />
          Uploaded
        </StatusPill>
      ) : (
        <Button variant="outline" size="sm" className="shrink-0" disabled={disabled || busy} asChild>
          <label htmlFor={inputId} className="cursor-pointer">
            <Upload className="mr-1.5 size-3.5" aria-hidden />
            {busy ? "Uploading…" : "Upload"}
          </label>
        </Button>
      )}
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(kind, file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * Manual KYC capture: details draft → private document uploads → submit for
 * human review. Resubmission after a rejection re-enters BVN/documents because
 * a rejected attempt is superseded — the server never reuses old artefacts.
 */
export function KycForm({ kyc }: { kyc: KycSummary }) {
  const sub = kyc.submission;
  const resubmission = (sub?.attemptNo ?? 0) > 0 && kyc.status === "REJECTED";
  const [fullLegalName, setFullLegalName] = React.useState(sub?.fullLegalName ?? "");
  const [gender, setGender] = React.useState<KycGender | "">(sub?.gender ?? "");
  const [bvn, setBvn] = React.useState("");
  const [poaType, setPoaType] = React.useState<KycPoaType | "">(sub?.poaType ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const saveDraft = useSaveKycDraft();
  const uploadDoc = useUploadKycDocument();
  const submitKyc = useSubmitKyc();

  // Server truth after each save/upload — a DRAFT exists and can take files.
  const draftOpen = sub?.status === "DRAFT";
  const complete =
    !!sub?.fullLegalName && !!sub?.gender && !!sub?.bvnMasked && !!sub?.poaType && sub.hasSelfie && sub.hasPoa;

  const save = async () => {
    setError(null);
    if (fullLegalName.trim().length < 3) return setError("Enter your full legal name as it appears on your ID.");
    if (!gender) return setError("Select your gender.");
    if (!/^\d{11}$/.test(bvn)) return setError("BVN must be exactly 11 digits.");
    if (!poaType) return setError("Choose the document you're uploading as proof of address.");
    try {
      await saveDraft.mutateAsync({ fullLegalName: fullLegalName.trim(), gender, bvn, poaType });
      toast.success("Details saved — upload your documents next.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your details — try again.");
    }
  };

  const upload = async (kind: KycDocumentKind, file: File) => {
    setError(null);
    try {
      await uploadDoc.mutateAsync({ kind, file, fileName: file.name });
      toast.success(kind === "SELFIE" ? "Selfie uploaded." : "Proof of address uploaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed — try again.");
    }
  };

  const submit = async () => {
    setError(null);
    try {
      await submitKyc.mutateAsync();
      toast.success("Submitted — our team will review your documents.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit — try again.");
    }
  };

  const busy = saveDraft.isPending || uploadDoc.isPending || submitKyc.isPending;

  return (
    <div className="financial-card flex flex-col gap-5 p-5">
      <div>
        <h2 className="text-base font-bold text-foreground">
          {resubmission ? "Resubmit your verification" : "Your details"}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {resubmission
            ? "The previous attempt was closed — re-enter your details and upload fresh documents."
            : "Saved as a private draft until you submit for review."}
        </p>
      </div>

      {error ? <StatePanel tone="error" title="Verification" copy={error} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full legal name" htmlFor="kyc-name" className="sm:col-span-2">
          <Input
            id="kyc-name"
            autoComplete="name"
            value={fullLegalName}
            onChange={(e) => setFullLegalName(e.target.value)}
            placeholder="As it appears on your government ID"
            disabled={busy}
          />
        </Field>
        <Field label="Gender" htmlFor="kyc-gender">
          <Select id="kyc-gender" value={gender} onChange={(e) => setGender(e.target.value as KycGender | "")} disabled={busy}>
            <option value="">Select…</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="BVN" htmlFor="kyc-bvn" hint={sub?.bvnMasked ? `Previously ${sub.bvnMasked} — re-enter for security` : "11 digits, from your bank"}>
          <Input
            id="kyc-bvn"
            inputMode="numeric"
            autoComplete="off"
            value={bvn}
            onChange={(e) => setBvn(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="11-digit BVN"
            disabled={busy}
          />
        </Field>
        <Field label="Proof of address type" htmlFor="kyc-poa-type" className="sm:col-span-2">
          <Select id="kyc-poa-type" value={poaType} onChange={(e) => setPoaType(e.target.value as KycPoaType | "")} disabled={busy}>
            <option value="">Select…</option>
            {POA_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Button size="sm" className="self-start" disabled={busy} onClick={() => void save()}>
        {saveDraft.isPending ? "Saving…" : draftOpen ? "Update details" : "Save details"}
      </Button>

      <div className="flex flex-col gap-2.5 border-t border-border pt-4">
        <p className="text-xs font-semibold text-foreground">Documents</p>
        {!draftOpen ? (
          <p className="text-xs text-muted-foreground">Save your details first — uploads attach to your draft.</p>
        ) : null}
        <DocUpload
          kind="SELFIE"
          label="Selfie photo"
          hint="Clear photo of your face — JPG or PNG"
          accept="image/*"
          uploaded={!!sub?.hasSelfie}
          busy={uploadDoc.isPending}
          disabled={!draftOpen}
          onPick={(kind, file) => void upload(kind, file)}
        />
        <DocUpload
          kind="POA"
          label="Proof of address"
          hint="Issued within the last 3 months — image or PDF"
          accept="image/*,application/pdf"
          uploaded={!!sub?.hasPoa}
          busy={uploadDoc.isPending}
          disabled={!draftOpen}
          onPick={(kind, file) => void upload(kind, file)}
        />
      </div>

      <div className="border-t border-border pt-4">
        <Button className="w-full" size="lg" disabled={!complete || busy} onClick={() => void submit()}>
          {submitKyc.isPending ? "Submitting…" : "Submit for review"}
        </Button>
        {!complete ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Save your details and upload both documents to submit.
          </p>
        ) : null}
      </div>
    </div>
  );
}
