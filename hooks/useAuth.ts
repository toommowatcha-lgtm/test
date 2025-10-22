
import { useStore } from '../store/useStore';

export const useAuth = () => {
  const session = useStore((state) => state.session);
  const user = useStore((state) => state.user);
  const setSession = useStore((state) => state.setSession);

  return { session, user, setSession, isAuthenticated: !!session };
};
