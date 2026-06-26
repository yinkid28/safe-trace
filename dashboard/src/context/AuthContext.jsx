import { createContext, useCallback, useEffect, useState, useContext } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUserProfile = useCallback(async (uid) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const data = snap.data();
      if (data.role !== "agency_staff" && data.role !== "agency_admin" && data.role !== "platform_admin") {
        await signOut(auth);
        throw new Error("Access denied: Security Agency staff only.");
      }
      const profile = { uid, ...data };
      setUser(profile);
      return profile;
    } else {
      // Don't signOut here — user might be mid-registration on AgencyRegister.
      // The login flow checks the return value separately.
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthUser(firebaseUser);
      if (firebaseUser) {
        try {
          await fetchUserProfile(firebaseUser.uid);
        } catch (err) {
          setError(err.message);
          setUser(null);
          setAuthUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [fetchUserProfile]);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const profile = await fetchUserProfile(result.user.uid);
      if (!profile) {
        await signOut(auth);
        throw new Error("No agency profile found for this account.");
      }
      return profile;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchUserProfile]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setAuthUser(null);
  }, []);

  const value = {
    authUser,
    user,
    loading,
    error,
    login,
    logout,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
