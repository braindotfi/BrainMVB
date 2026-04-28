import { useAuth } from "./authContext";

const DEMO_PHONE = "+1 (415) 555-0192";

export function useUserContact() {
  const { user } = useAuth();
  return {
    email: user?.email ?? "treasury@acme.com",
    phone: DEMO_PHONE,
  };
}
