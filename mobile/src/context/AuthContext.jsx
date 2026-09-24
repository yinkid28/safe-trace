import { createContext, useCallback, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
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
      return true;
    } else {
      setUser(null);
      return false;
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
      const found = await fetchUserProfile(result.user.uid);
      if (!found) {
        await signOut(auth);
        throw new Error("No account profile found. Please register a new account.");
      }
      // Mark user as online
      try {
        await updateDoc(doc(db, "users", result.user.uid), {
          phoneStatus: "online",
        });
      } catch (_) {
        // Best effort — don't block login if status update fails
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchUserProfile]);

  const register = useCallback(
    async ({ name, email, phone, password, role = "personal", agencyId = null }) => {
      setError(null);
      let createdUser = null;
      try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        createdUser = result.user;
        await updateProfile(createdUser, { displayName: name });

        await setDoc(doc(db, "users", createdUser.uid), {
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

        await fetchUserProfile(createdUser.uid);
      } catch (err) {
        // If Auth user was created but Firestore write failed, clean up
        // the orphaned Auth user so the email can be reused on retry.
        if (createdUser) {
          try {
            await deleteUser(createdUser);
          } catch (_) {
            // Best effort cleanup
          }
        }
        setError(err.message);
        throw err;
      }
    },
    [fetchUserProfile]
  );

  const resetPassword = useCallback(async (email) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logout = useCallback(async () => {
    if (authUser) {
      try {
        await updateDoc(doc(db, "users", authUser.uid), {
          phoneStatus: "offline",
        });
      } catch (_) {
        // Best effort — don't block logout if Firestore write fails
      }
    }
    await signOut(auth);
    setUser(null);
    setAuthUser(null);
  }, [authUser]);

  const value = {
    authUser,
    user,
    loading,
    error,
    login,
    register,
    logout,
    resetPassword,
    refreshProfile: () => authUser && fetchUserProfile(authUser.uid),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
