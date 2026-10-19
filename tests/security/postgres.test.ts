import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function extract(file: string, name: string): string {
  const sql = readFileSync(resolve(root, file), "utf8");
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${name}`);
  const end = sql.indexOf("$$;", start);
  return sql.slice(start, end + 3);
}

async function expectError(run: () => Promise<unknown>) {
  let failed = false;
  try {
    await run();
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}

describe("profile privileges", () => {
  let db: PGlite;
  const member = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$
        SELECT nullif(current_setting('request.jwt.claim.role', true), '');
      $$;
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        email text,
        display_name text,
        is_founder boolean NOT NULL DEFAULT false,
        onboarding_step text NOT NULL DEFAULT 'privacy',
        onboarding_completed_at timestamptz,
        ai_consent_at timestamptz,
        marketing_opt_in boolean NOT NULL DEFAULT false,
        ai_mode text NOT NULL DEFAULT 'builtin',
        ai_key_hint text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO public.profiles (id, email, display_name) VALUES
        ('${member}', 'member@example.com', 'Member'),
        ('${other}', 'other@example.com', 'Other');
    `);
    await db.exec(
      extract(
        "supabase/migrations/20261019120000_lock_profiles_wallet_and_valuation.sql",
        "protect_profile_columns",
      ),
    );
    await db.exec(`
      CREATE TRIGGER profiles_protect_columns
        BEFORE UPDATE ON public.profiles
        FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
      CREATE POLICY profiles_update_own ON public.profiles
        FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
      CREATE POLICY profiles_select_own ON public.profiles
        FOR SELECT USING (id = auth.uid());
      CREATE ROLE authenticated NOINHERIT;
      GRANT authenticated TO CURRENT_USER;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO authenticated;
      REVOKE ALL ON public.profiles FROM authenticated;
      GRANT SELECT ON public.profiles TO authenticated;
      GRANT UPDATE (display_name, onboarding_step, onboarding_completed_at, ai_consent_at, marketing_opt_in)
        ON public.profiles TO authenticated;
    `);
  });

  async function asMember() {
    await db.exec(`
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${member}', false);
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
    `);
  }

  it("lets a member edit their name and blocks founder and billing fields", async () => {
    await asMember();
    await db.exec(`UPDATE public.profiles SET display_name = 'Renamed' WHERE id = '${member}'`);
    await expectError(() =>
      db.exec(`UPDATE public.profiles SET is_founder = true WHERE id = '${member}'`),
    );
    await expectError(() =>
      db.exec(`UPDATE public.profiles SET ai_mode = 'byok' WHERE id = '${member}'`),
    );
    await expectError(() =>
      db.exec(`UPDATE public.profiles SET ai_key_hint = 'sk-…abcd' WHERE id = '${member}'`),
    );
    await db.exec(`UPDATE public.profiles SET display_name = 'Hijack' WHERE id = '${other}'`);
    await db.exec("RESET ROLE");

    const own = await db.query<{ is_founder: boolean; display_name: string; ai_mode: string }>(
      `SELECT is_founder, display_name, ai_mode FROM public.profiles WHERE id = '${member}'`,
    );
    expect(own.rows[0]).toMatchObject({
      is_founder: false,
      display_name: "Renamed",
      ai_mode: "builtin",
    });
    const stranger = await db.query<{ display_name: string }>(
      `SELECT display_name FROM public.profiles WHERE id = '${other}'`,
    );
    expect(stranger.rows[0]?.display_name).toBe("Other");
  });

  it("still blocks is_founder when the column grant is widened", async () => {
    await db.exec(
      "GRANT UPDATE (is_founder, ai_mode, ai_key_hint) ON public.profiles TO authenticated",
    );
    await asMember();
    await expectError(() =>
      db.exec(`UPDATE public.profiles SET is_founder = true WHERE id = '${member}'`),
    );
    await db.exec("RESET ROLE");
    const own = await db.query<{ is_founder: boolean }>(
      `SELECT is_founder FROM public.profiles WHERE id = '${member}'`,
    );
    expect(own.rows[0]?.is_founder).toBe(false);
  });
});

describe("wallet refunds and top-ups", () => {
  let db: PGlite;
  const user = "33333333-3333-4333-8333-333333333333";

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE TABLE public.ai_wallets (
        owner_id uuid PRIMARY KEY,
        balance_pence integer NOT NULL DEFAULT 0 CHECK (balance_pence >= 0),
        topped_up_pence integer NOT NULL DEFAULT 0 CHECK (topped_up_pence >= 0),
        spent_pence integer NOT NULL DEFAULT 0 CHECK (spent_pence >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.ai_topups (
        stripe_session_id text PRIMARY KEY,
        owner_id uuid NOT NULL,
        pence integer NOT NULL CHECK (pence > 0),
        price_id text,
        environment text NOT NULL DEFAULT 'sandbox',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.ai_usage (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id uuid NOT NULL,
        kind text NOT NULL,
        model text,
        mode text NOT NULL DEFAULT 'builtin',
        cost_pence integer NOT NULL DEFAULT 0,
        markup_bps integer NOT NULL DEFAULT 2000,
        charged_pence integer NOT NULL DEFAULT 0,
        note text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO public.ai_wallets (owner_id, balance_pence) VALUES ('${user}', 500);
    `);
    await db.exec(
      extract(
        "supabase/migrations/20260731172559_c92101d5-6aad-44d3-87ba-322b9013e822.sql",
        "credit_ai_wallet",
      ),
    );
    await db.exec(
      extract(
        "supabase/migrations/20260731172559_c92101d5-6aad-44d3-87ba-322b9013e822.sql",
        "charge_ai_wallet",
      ),
    );
    await db.exec(
      extract(
        "supabase/migrations/20261019120000_lock_profiles_wallet_and_valuation.sql",
        "refund_ai_wallet",
      ),
    );
  });

  it("credits a checkout once", async () => {
    const first = await db.query<{ credit_ai_wallet: number }>(
      `SELECT public.credit_ai_wallet('${user}', 1500, 'cs_test_once', 'ai_credits_1500', 'sandbox') AS credit_ai_wallet`,
    );
    const second = await db.query<{ credit_ai_wallet: number }>(
      `SELECT public.credit_ai_wallet('${user}', 1500, 'cs_test_once', 'ai_credits_1500', 'sandbox') AS credit_ai_wallet`,
    );
    expect(first.rows[0]?.credit_ai_wallet).toBe(2000);
    expect(second.rows[0]?.credit_ai_wallet).toBe(2000);
  });

  it("charges only when the balance covers it", async () => {
    const ok = await db.query<{ charge_ai_wallet: number }>(
      `SELECT public.charge_ai_wallet('${user}', 100, 80, 'analyze', 'model', 2000, 'test') AS charge_ai_wallet`,
    );
    expect(ok.rows[0]?.charge_ai_wallet).toBe(1900);
    const refused = await db.query<{ charge_ai_wallet: number }>(
      `SELECT public.charge_ai_wallet('${user}', 999999, 1, 'analyze', 'model', 2000, 'too much') AS charge_ai_wallet`,
    );
    expect(refused.rows[0]?.charge_ai_wallet).toBe(-1);
    const balance = await db.query<{ balance_pence: number }>(
      `SELECT balance_pence FROM public.ai_wallets WHERE owner_id = '${user}'`,
    );
    expect(balance.rows[0]?.balance_pence).toBe(1900);
  });

  it("rolls the refund back when the history insert fails", async () => {
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.fail_usage() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'usage down';
      END $$;
      CREATE TRIGGER fail_usage BEFORE INSERT ON public.ai_usage
        FOR EACH ROW WHEN (NEW.kind = 'refund') EXECUTE FUNCTION public.fail_usage();
    `);
    await expectError(() =>
      db.query(`SELECT public.refund_ai_wallet('${user}', 100, 'should roll back')`),
    );
    await db.exec("DROP TRIGGER fail_usage ON public.ai_usage");
    const balance = await db.query<{ balance_pence: number }>(
      `SELECT balance_pence FROM public.ai_wallets WHERE owner_id = '${user}'`,
    );
    expect(balance.rows[0]?.balance_pence).toBe(1900);

    const refunded = await db.query<{ refund_ai_wallet: number }>(
      `SELECT public.refund_ai_wallet('${user}', 100, 'photo failed') AS refund_ai_wallet`,
    );
    expect(refunded.rows[0]?.refund_ai_wallet).toBe(2000);
    const usage = await db.query<{ charged_pence: number }>(
      `SELECT charged_pence FROM public.ai_usage WHERE kind = 'refund' AND owner_id = '${user}'`,
    );
    expect(usage.rows[0]?.charged_pence).toBe(-100);
  });
});
