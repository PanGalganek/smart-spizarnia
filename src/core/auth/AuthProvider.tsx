import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { PropsWithChildren, createContext, useContext, useEffect, useState } from "react";
import { auth } from "@/core/firebase";

type AuthValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setLoading(false);
  }), []);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signIn: async (email, password) => { await signInWithEmailAndPassword(auth, email, password); },
      signOut: () => firebaseSignOut(auth)
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
