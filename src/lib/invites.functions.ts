import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AcceptInviteInput = z.object({
  code: z.string().trim().max(64).optional(),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(200),
  displayName: z.string().trim().max(120).optional(),
});

/**
 * Sign-up. Open by default; if an invitation code is supplied it must be a
 * valid, unused, unexpired code for this email. Everything sensitive happens
 * here on the server.
 */
export const acceptInvite = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AcceptInviteInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const code = data.code?.toLowerCase() ?? "";

    let invite: {
      id: string;
      used_count: number;
      max_uses: number;
      expires_at: string | null;
      email: string | null;
    } | null = null;

    if (code) {
      const { data: found, error: inviteError } = await supabaseAdmin
        .from("invites")
        .select("id, code, email, max_uses, used_count, expires_at")
        .ilike("code", code)
        .maybeSingle();

      if (inviteError) throw new Error("We couldn't check that invitation. Please try again.");
      if (!found) return { ok: false as const, reason: "That invitation code isn't recognised." };
      if (found.used_count >= found.max_uses)
        return { ok: false as const, reason: "That invitation has already been used." };
      if (found.expires_at && new Date(found.expires_at) < new Date())
        return { ok: false as const, reason: "That invitation has expired." };
      if (found.email && found.email.toLowerCase() !== email)
        return { ok: false as const, reason: "That invitation belongs to a different email address." };
      invite = found;
    }


    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: data.displayName ? { display_name: data.displayName } : {},
    });

    if (createError) {
      const message = /already|exists|registered/i.test(createError.message)
        ? "There's already an account for that email — sign in instead."
        : "We couldn't create that account. Please try again.";
      return { ok: false as const, reason: message };
    }

    if (invite) {
      await supabaseAdmin
        .from("invites")
        .update({ used_count: invite.used_count + 1, last_used_at: new Date().toISOString() })
        .eq("id", invite.id);
    }


    return { ok: true as const };
  });
