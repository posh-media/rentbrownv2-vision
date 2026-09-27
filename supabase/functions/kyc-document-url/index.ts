// RentBrown — KYC document signed-URL minter.
// POST { submission_id, kind: 'selfie' | 'poa' } with the caller's user JWT.
// Owners may sign their own submission's documents; reviewers need a KYC
// reviewer-scope admin role. Returns a 60-second signed URL for the private
// kyc-documents bucket — never a public URL, never service credentials.
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const SIGN_TTL_SECONDS = 60;
const REVIEWER_ROLES = ["KYC_REVIEWER", "FINANCE_ADMIN", "SUPER_ADMIN"];

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  const log = (msg: string, ctx: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ fn: "kyc-document-url", request_id: rid, msg, ...ctx }));

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return new Response("unauthorized", { status: 401 });

  const { data: authData, error: authErr } = await sb.auth.getUser(jwt);
  const caller = authData?.user?.id;
  if (authErr || !caller) return new Response("unauthorized", { status: 401 });

  let body: { submission_id?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const { submission_id, kind } = body ?? {};
  if (!submission_id || (kind !== "selfie" && kind !== "poa")) {
    return new Response("bad request", { status: 400 });
  }

  const { data: sub } = await sb
    .from("kyc_submissions")
    .select("id, user_id, selfie_path, poa_path")
    .eq("id", submission_id)
    .maybeSingle();
  if (!sub) return new Response("not found", { status: 404 });

  const isOwner = sub.user_id === caller;
  let isReviewer = false;
  if (!isOwner) {
    const { data: roles } = await sb
      .from("admin_roles")
      .select("role")
      .eq("user_id", caller)
      .in("role", REVIEWER_ROLES);
    isReviewer = (roles?.length ?? 0) > 0;
  }
  if (!isOwner && !isReviewer) {
    log("denied", { submission_id });
    return new Response("forbidden", { status: 403 });
  }

  const path = kind === "selfie" ? sub.selfie_path : sub.poa_path;
  if (!path) return new Response("document not present", { status: 404 });

  const { data: signed, error: signErr } = await sb.storage
    .from("kyc-documents")
    .createSignedUrl(path, SIGN_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    log("sign_failed", { submission_id, kind, error: signErr?.message });
    return new Response("could not sign document", { status: 500 });
  }

  // Audit the view — identifiers only, never document contents.
  await sb.from("audit_log").insert({
    actor_id: caller,
    actor_role: isReviewer ? "KYC_REVIEWER" : "INVESTOR",
    action: "kyc.document_view",
    entity_type: "kyc_submission",
    entity_id: submission_id,
    result: "SUCCESS",
    request_id: rid,
    metadata: { kind },
  });

  return Response.json({ url: signed.signedUrl, expires_in: SIGN_TTL_SECONDS });
});
