import { useAuth } from "./authContext";

const DEMO_PHONE = "+1 (415) 555-0192";

export function useUserContact() {
  const { user } = useAuth();
  return {
    email: user?.email ?? "demo@brain.finance",
    phone: DEMO_PHONE,
  };
}
