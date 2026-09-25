// RentBrown — deposit initialization (authenticated).
// 1) request_deposit RPC under the caller's JWT (auth.uid(), policy checks)
// 2) provider init via server-side secret → checkout URL / provider reference
// 3) complete_deposit_init → PENDING
// Provider secrets never leave this function.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

interface InitReq { amount_minor: number; provider: "PAYSTACK" | "KORAPAY"; idempotency_key: string; channel?: string }

async function paystackInit(dep: { reference: string; amount_minor: number }, email: string | null, webhookUrl: string) {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) throw new Error("paystack secret not configured");
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({
      email: email ?? "deposits@rentbrown.app",
      amount: dep.amount_minor,            // kobo (minor units)
      reference: dep.reference,            // merchant reference = our deposit ref
      callback_url: webhookUrl,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.status) throw new Error(`paystack init: ${body.message ?? res.status}`);
  return {
    provider_reference: body.data.reference as string,
    provider_txn_id: body.data.access_code as string,
    checkout_url: body.data.authorization_url as string,
  };
}

async function korapayInit(dep: { reference: string; amount_minor: number; id: string }, email: string | null, webhookUrl: string) {
  const secret = Deno.env.get("KORAPAY_SECRET_KEY");
  if (!secret) throw new Error("korapay secret not configured");
  const res = await fetch("https://api.korapay.com/merchant/api/v1/charges/initialize", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({
      reference: dep.reference,                       // payment_reference = our ref
      amount: dep.amount_minor / 100,                 // naira (major units)
      currency: "NGN",
      notification_url: webhookUrl,
      ...(email ? { customer: { email } } : {}),
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.status) throw new Error(`korapay init: ${body.message ?? res.status}`);
  return {
    provider_reference: (body.data?.reference ?? dep.reference) as string,
    provider_txn_id: null,
    checkout_url: body.data?.checkout_url as string,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const rid = crypto.randomUUID();
  const log = (msg: string, ctx: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ fn: "initialize-deposit", request_id: rid, msg, ...ctx }));

  try {
    const jwt = req.headers.get("authorization") ?? "";
    if (!jwt.startsWith("Bearer ")) {
      return Response.json({ error: "unauthenticated" }, { status: 401, headers: cors });
    }
    // user-context client → request_deposit resolves auth.uid() from the JWT
    const userSb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { authorization: jwt } } });
    const { data: user } = await userSb.auth.getUser();
    if (!user.user) {
      return Response.json({ error: "unauthenticated" }, { status: 401, headers: cors });
    }
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);

    const input = (await req.json()) as InitReq;
    const { data: dep, error } = await userSb.rpc("request_deposit", {
      p_amount_minor: input.amount_minor,
      p_provider: input.provider,
      p_idempotency_key: input.idempotency_key,
      p_request_id: rid,
    });
    if (error) {
      log("request_rejected", { error: error.message });
      return Response.json({ error: error.message }, { status: 422, headers: cors });
    }

    // already initialized (idempotent retry) → return existing checkout
    if (dep.status !== "INITIATED") {
      return Response.json({
        deposit_id: dep.id, reference: dep.reference, status: dep.status,
        checkout_url: dep.metadata?.checkout_url ?? null,
      }, { headers: cors });
    }

    const webhookBase = `${SUPABASE_URL}/functions/v1`;
    const init = input.provider === "PAYSTACK"
      ? await paystackInit(dep, user.user.email ?? null, `${webhookBase}/payment-webhook-paystack`)
      : await korapayInit(dep, user.user.email ?? null, `${webhookBase}/payment-webhook-korapay`);

    const { data: done, error: cErr } = await svc.rpc("complete_deposit_init", {
      p_deposit_id: dep.id,
      p_provider_reference: init.provider_reference,
      p_provider_txn_id: init.provider_txn_id,
      p_checkout_url: init.checkout_url,
      p_request_id: rid,
    });
    if (cErr) throw cErr;

    log("initialized", { deposit_id: dep.id, provider: input.provider });
    return Response.json({
      deposit_id: done.id, reference: done.reference, status: done.status,
      checkout_url: init.checkout_url,
    }, { headers: cors });
  } catch (e) {
    log("error", { error: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 500, headers: cors });
  }
});
