import { User } from "firebase/auth";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/core/firebase";
import { UserProfile } from "@/domain/userProfile";
import { ADMIN_UID } from "@/services/userData";
import { migrateLegacyAdminData } from "@/services/legacyMigration";

export const userProfilesCollection = collection(db, "userProfiles");

function profileRef(uid: string) {
  return doc(userProfilesCollection, uid);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(profileRef(uid));
  return snapshot.exists() ? snapshot.data() as UserProfile : null;
}

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const existing = await getUserProfile(user.uid);
  if (existing) {
    await migrateLegacyAdminData(user.uid);
    return existing;
  }
  const now = Date.now();
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? undefined,
    role: user.uid === ADMIN_UID ? "admin" : "user",
    status: user.uid === ADMIN_UID ? "active" : "pending",
    createdAt: now,
    updatedAt: now
  };
  await setDoc(profileRef(user.uid), withoutUndefined(profile));
  await migrateLegacyAdminData(user.uid);
  return profile;
}

export async function createPendingUserProfile(user: User, displayName?: string): Promise<UserProfile> {
  const now = Date.now();
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email ?? "",
    displayName: displayName?.trim() || user.displayName || undefined,
    role: user.uid === ADMIN_UID ? "admin" : "user",
    status: user.uid === ADMIN_UID ? "active" : "pending",
    createdAt: now,
    updatedAt: now
  };
  await setDoc(profileRef(user.uid), withoutUndefined(profile), { merge: true });
  return profile;
}

function withoutUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
