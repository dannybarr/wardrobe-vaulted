import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gate for everything private. Client-only because the session lives in the
 * browser; unauthenticated visitors are sent to /auth with their destination
 * preserved.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { mode: "signin", redirect: location.href } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
