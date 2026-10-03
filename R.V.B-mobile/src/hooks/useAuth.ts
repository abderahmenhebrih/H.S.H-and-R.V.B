import { useAuthStore } from "@/stores/auth-store";

export function useAuth() {
  const store = useAuthStore();
  return store;
}
