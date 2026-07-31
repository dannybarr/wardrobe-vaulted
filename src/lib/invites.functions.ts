import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AcceptInviteInput = z.object({
  code: z.string().trim().min(4).max(64),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(200),
  displayName: z.string().trim().max(120).optional(),
});

/**
 * Private-alpha sign-up. A valid, unused, unexpired invite code is required.
 * Everything sensitive happens here on the server: the invite list is never
 * exposed to the browser, and the code is consumed in the same call that
 * creates the account.
 */
export const acceptInvite = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AcceptInviteInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const code = data.code.toLowerCase();

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("invites")
      .select("id, code, email, max_uses, used_count, expires_at")
      .ilike("code", code)
      .maybeSingle();

    if (inviteError) throw new Error("We couldn't check that invitation. Please try again.");
    if (!invite) return { ok: false as const, reason: "That invitation code isn't recognised." };
    if (invite.used_count >= invite.max_uses)
      return { ok: false as const, reason: "That invitation has already been used." };
    if (invite.expires_at && new Date(invite.expires_at) < new Date())
      return { ok: false as const, reason: "That invitation has expired." };
    if (invite.email && invite.email.toLowerCase() !== email)
      return { ok: false as const, reason: "That invitation belongs to a different email address." };

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

    await supabaseAdmin
      .from("invites")
      .update({ used_count: invite.used_count + 1, last_used_at: new Date().toISOString() })
      .eq("id", invite.id);

    return { ok: true as const };
  });
