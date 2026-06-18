import { User, createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { PropsWithChildren, createContext, useContext, useEffect, useState } from "react";
import { auth } from "@/core/firebase";
import { UserProfile } from "@/domain/userProfile";
import { ADMIN_UID } from "@/services/userData";
import { createPendingUserProfile, ensureUserProfile } from "@/services/userProfileRepository";

type AuthValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isActive: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<UserProfile>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setLoading(true);
    void (async () => {
      try {
        setUser(nextUser);
        setProfile(nextUser ? await ensureUserProfile(nextUser) : null);
      } finally {
        setLoading(false);
      }
    })();
  }), []);

  const isAdmin = profile?.role === "admin" && profile.status === "active";
  const isActive = profile?.status === "active";

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      isAdmin,
      isActive,
      signIn: async (email, password) => {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const nextProfile = await ensureUserProfile(credential.user);
        setProfile(nextProfile);
        setUser(credential.user);
      },
      register: async (email, password, displayName) => {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const nextProfile = await createPendingUserProfile(credential.user, displayName);
        setProfile(nextProfile);
        setUser(credential.user);
        return nextProfile;
      },
      signOut: () => firebaseSignOut(auth)
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function adminUid() {
  return ADMIN_UID;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
