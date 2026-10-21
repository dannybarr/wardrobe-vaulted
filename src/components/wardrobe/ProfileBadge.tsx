import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { cancelVaultMembership, getVaultAccess } from "@/utils/payments.functions";
import { getAiCreditState } from "@/lib/ai-credits.functions";
import { deleteMyAccount, exportMyData } from "@/lib/account-data.functions";
import { isGuestMode } from "@/lib/trial/mode";

function initialsFrom(name: string | null, email: string | null) {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
  }
  return (email ?? "?").trim().slice(0, 2).toUpperCase();
}

function money(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Small identity chip for the top-left of the wardrobe: initials, then the details on tap. */
export function ProfileBadge({
  netWorth = 0,
  pieces,
  readOnly = false,
}: {
  netWorth?: number;
  pieces?: number;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const guest = isGuestMode();
  const quiet = guest || readOnly;
  const fetchAccess = useServerFn(getVaultAccess);
  const fetchCredits = useServerFn(getAiCreditState);
  const cancelMembership = useServerFn(cancelVaultMembership);
  const exportData = useServerFn(exportMyData);
  const removeAccount = useServerFn(deleteMyAccount);

  const { data: profile } = useQuery({
    queryKey: ["profile-badge"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return { name: null as string | null, email: null as string | null };
      const { data } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", auth.user.id)
        .maybeSingle();
      return {
        name: data?.display_name ?? null,
        email: data?.email ?? auth.user.email ?? null,
      };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !quiet,
  });

  const { data: access } = useQuery({
    queryKey: ["vault-access"],
    queryFn: () => fetchAccess({ data: { environment: getStripeEnvironment() } }),
    enabled: !quiet,
  });

  const { data: credits } = useQuery({
    queryKey: ["ai-credit-state"],
    queryFn: () => fetchCredits(),
    enabled: !quiet,
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const result = await cancelMembership({ data: { environment: getStripeEnvironment() } });
      if ("error" in result) throw new Error(result.error);
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vault-access"] }),
  });

  const download = useMutation({
    mutationFn: () => exportData(),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "wardrobe-export.json";
      link.click();
      URL.revokeObjectURL(url);
    },
  });

  const erase = useMutation({
    mutationFn: async () => {
      const confirmation = window.prompt(
        "Type DELETE to permanently remove your account, wardrobe and photos.",
      );
      if (confirmation !== "DELETE") throw new Error("Deletion cancelled.");
      return removeAccount({ data: { confirmation } });
    },
    onSuccess: () => {
      void supabase.auth.signOut();
    },
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const renewal = formatDate(access?.currentPeriodEnd ?? null);
  const founder = access?.plan === "founder" || credits?.founder;

  const membership = readOnly
    ? "Read-only preview"
    : guest
      ? "Guest trial — your first four pieces are free"
      : founder
        ? "Founder — free for life"
        : access?.subscribed
          ? access.cancelAtPeriodEnd
            ? `Vault ends ${renewal ?? "at period end"}`
            : renewal
              ? `Vault · £4.99/mo, renews ${renewal}`
              : "Vault · £4.99 a month"
          : "No membership — first four pieces free";

  return (
    <div className="profile-badge" ref={wrapper}>
      <button
        type="button"
        className="profile-badge__chip"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        title={
          readOnly
            ? "Read-only wardrobe"
            : guest
              ? "Guest wardrobe"
              : (profile?.name ?? profile?.email ?? "Your profile")
        }
      >
        {readOnly
          ? "RO"
          : guest
            ? "GT"
            : initialsFrom(profile?.name ?? null, profile?.email ?? null)}
      </button>

      {open && (
        <div className="profile-panel" role="dialog" aria-label="Your profile">
          <p className="profile-panel__name">
            {readOnly
              ? "Read-only wardrobe"
              : guest
                ? "Guest wardrobe"
                : (profile?.name ?? profile?.email ?? "Your wardrobe")}
          </p>
          {profile?.name && profile?.email ? (
            <p className="profile-panel__email">{profile.email}</p>
          ) : null}

          <dl className="profile-panel__rows">
            <div>
              <dt>Wardrobe value</dt>
              <dd>
                £
                {netWorth.toLocaleString("en-GB", {
                  minimumFractionDigits: Number.isInteger(netWorth) ? 0 : 2,
                  maximumFractionDigits: 2,
                })}
              </dd>
            </div>
            <div>
              <dt>Pieces</dt>
              <dd>{pieces ?? access?.pieces ?? 0}</dd>
            </div>
            <div>
              <dt>AI credit</dt>
              <dd>
                {readOnly
                  ? "Sign up to use your own"
                  : guest
                    ? "Free for your first four pieces"
                    : credits?.founder
                      ? "Unlimited"
                      : credits?.mode === "byok"
                        ? "Your own key"
                        : money(credits?.balancePence ?? 0)}
              </dd>
            </div>
            <div>
              <dt>Membership</dt>
              <dd>{membership}</dd>
            </div>
          </dl>

          {!guest && !founder && access?.subscribed && !access.cancelAtPeriodEnd ? (
            <button
              type="button"
              className="profile-panel__cancel"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? "Cancelling…" : "Cancel membership"}
            </button>
          ) : null}
          {cancel.isError ? (
            <p className="profile-panel__note">{(cancel.error as Error).message}</p>
          ) : null}
          {download.isError ? (
            <p className="profile-panel__note">{(download.error as Error).message}</p>
          ) : null}
          {erase.isError ? (
            <p className="profile-panel__note">{(erase.error as Error).message}</p>
          ) : null}
          {cancel.isSuccess ? (
            <p className="profile-panel__note">
              Cancelled — your pieces stay saved until the period ends.
            </p>
          ) : null}

          <p className="profile-panel__links">
            {readOnly ? (
              <Link to="/auth" search={{ mode: "signup", redirect: "/demo" }}>
                Create your account
              </Link>
            ) : guest ? (
              <Link to="/auth" search={{ mode: "signup", redirect: "/wardrobe" }}>
                Create your account
              </Link>
            ) : (
              <>
                <Link to="/billing">Billing &amp; credits</Link>
                <button
                  type="button"
                  onClick={() => download.mutate()}
                  disabled={download.isPending}
                >
                  {download.isPending ? "Preparing export…" : "Download my data"}
                </button>
                <button type="button" onClick={() => erase.mutate()} disabled={erase.isPending}>
                  {erase.isPending ? "Deleting…" : "Delete account"}
                </button>
                <button type="button" onClick={() => supabase.auth.signOut()}>
                  Sign out
                </button>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
