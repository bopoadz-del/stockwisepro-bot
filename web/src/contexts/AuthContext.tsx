import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi, type User } from '@/lib/api/auth';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  signInWithEmail: (email: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: if arriving from a Telegram link (?tg=token), redeem it to sign
  // into the same profile; otherwise validate any existing session.
  useEffect(() => {
    let cancelled = false;

    const stripTgParam = () => {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('tg')) {
          url.searchParams.delete('tg');
          window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        }
      } catch {
        // ignore URL parsing issues
      }
    };

    const init = async () => {
      const tgToken = new URLSearchParams(window.location.search).get('tg');
      if (tgToken) {
        try {
          const res = await authApi.telegramSignIn(tgToken);
          if (!cancelled && res.data?.user) {
            setUser(res.data.user);
            stripTgParam();
            return;
          }
        } catch {
          // fall through to session check
        }
        stripTgParam();
      }

      try {
        const res = await authApi.me();
        if (!cancelled && res.data?.user) setUser(res.data.user);
      } catch {
        // no session
      }
    };

    init().finally(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await authApi.login({ email, password });

      if (response.error) {
        return { success: false, error: response.error };
      }

      if (response.data) {
        setUser(response.data.user);
        return { success: true };
      }

      return { success: false, error: 'Login failed' };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    setIsLoading(true);
    try {
      const response = await authApi.register({ email, password, name });

      if (response.error) {
        return { success: false, error: response.error };
      }

      if (response.data) {
        setUser(response.data.user);
        return { success: true };
      }

      return { success: false, error: 'Registration failed' };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, name?: string) => {
    setIsLoading(true);
    try {
      const response = await authApi.emailSignIn({ email, name });
      if (response.error) {
        return { success: false, error: response.error };
      }
      if (response.data) {
        setUser(response.data.user);
        return { success: true };
      }
      return { success: false, error: 'Sign-in failed' };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    authApi.logout().catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        signInWithEmail,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
