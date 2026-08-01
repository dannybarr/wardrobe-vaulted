import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import type { Database } from "@/integrations/supabase/types";

let _supabase: ReturnType<typeof createClient<Database>> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient<Database>(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    );
  }
  return _supabase;
}

function planFromPrice(price: any): string {
  return price?.lookup_key || price?.metadata?.lovable_external_id || price?.id || "vault_monthly";
}

/** Founder accounts are free for life and must never be downgraded by Stripe. */
async function isFounder(userId: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from("profiles")
    .select("is_founder")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_founder === true;
}

async function upsertSubscription(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("Subscription webhook without userId metadata", subscription.id);
    return;
  }
  if (await isFounder(userId)) return;


  const item = subscription.items?.data?.[0];
  const priceId = planFromPrice(item?.price);
  const productId =
    typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id ?? null;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getSupabase()
    .from("subscriptions")
    .upsert(
      {
        owner_id: userId,
        plan: subscription.status === "canceled" ? "none" : "vault",
        status: subscription.status,
        price_id: priceId,
        product_id: productId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id ?? null,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,environment" },
    );
}

/**
 * End of the paid period. Access is locked from here on, but the wardrobe and
 * every image are kept intact so the member can pick up where they left off.
 */
async function markCanceled(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (userId && (await isFounder(userId))) return;

  await getSupabase()
    .from("subscriptions")
    .update({
      status: "canceled",
      plan: "none",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

/** Keeps an audit trail of every payment event, ignoring repeats from retries. */
async function recordEvent(event: any) {
  await getSupabase()
    .from("billing_events")
    .upsert(
      {
        stripe_event_id: event.id,
        type: event.type,
        owner_id: event.data?.object?.metadata?.userId ?? null,
        payload: event as never,
        processed_at: new Date().toISOString(),
      },
      { onConflict: "stripe_event_id", ignoreDuplicates: true },
    );
}

/**
 * A prepaid AI credit pack has been paid for. The amount paid becomes balance at
 * face value — the 20% markup is applied when AI actually runs, not here. The
 * database routine records the session id, so a repeated notification from a
 * retry can never credit the same purchase twice.
 */
async function creditAiPack(session: any, env: StripeEnv) {
  const userId = session.metadata?.userId;
  const pence = session.amount_total;
  if (!userId || !pence || pence <= 0) {
    console.error("AI credit pack without userId or amount", session.id);
    return;
  }

  const { error } = await getSupabase().rpc("credit_ai_wallet", {
    _user_id: userId,
    _pence: pence,
    _session_id: session.id,
    _price_id: session.metadata?.priceId ?? null,
    _environment: env,
  });
  if (error) console.error("AI credit pack could not be applied", session.id, error.message);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      // Covers new memberships, plan changes and failed renewals alike: the
      // status lands on the account and Stripe keeps retrying while past due.
      await upsertSubscription(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await markCanceled(event.data.object, env);
      break;
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // Subscription state is kept current by the customer.subscription.* events;
      // one-off AI credit packs are settled here.
      const session = event.data.object;
      if (session.metadata?.purpose === "ai_credits" && session.payment_status !== "unpaid") {
        await creditAiPack(session, env);
      }
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed":
      // Subscription state is kept current by the customer.subscription.* events.
      break;
    default:
      console.log("Unhandled payment event:", event.type);
  }

  await recordEvent(event);
}


export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Payment webhook with invalid env:", rawEnv);
          // Never answer 200 here: Stripe would treat the event as delivered and
          // never retry it, silently losing a payment.
          return new Response("Unknown payment environment", { status: 400 });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Payment webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
