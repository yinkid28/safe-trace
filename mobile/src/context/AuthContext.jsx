import { createContext, useCallback, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
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
      setUser({ uid, ...snap.data() });
    } else {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthUser(firebaseUser);
      if (firebaseUser) {
        await fetchUserProfile(firebaseUser.uid);
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
      await fetchUserProfile(result.user.uid);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchUserProfile]);

  const register = useCallback(
    async ({ name, email, phone, password, role = "user", agencyId = null }) => {
      setError(null);
      try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: name });

        await setDoc(doc(db, "users", result.user.uid), {
          name,
          email,
          phone,
          role,
          familyId: null,
          agencyId,
          lastLocation: null,
          lastSeen: null,
          phoneStatus: "online",
          safeZones: [],
          createdAt: serverTimestamp(),
        });

        await fetchUserProfile(result.user.uid);
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [fetchUserProfile]
  );

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
    register,
    logout,
    refreshProfile: () => authUser && fetchUserProfile(authUser.uid),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
