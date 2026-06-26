import { collection, doc } from "firebase/firestore";
import { auth, db } from "@/core/firebase";

export const ADMIN_UID = "xFkLT9w6iWhSgzTyUy1QUj3d26R2";

export const userDataCollections = [
  "products",
  "pantry",
  "meals",
  "dailySummaries",
  "shoppingList",
  "consumers",
  "settings",
  "hydrationSettings",
  "hydrationEntries",
  "hydrationDaily",
  "pushSubscriptions"
] as const;

export type UserDataCollection = typeof userDataCollections[number];

export function currentUserId(explicitUserId?: string) {
  const uid = explicitUserId ?? auth.currentUser?.uid;
  if (!uid) throw new Error("Brak zalogowanego użytkownika.");
  return uid;
}

export function userCollection(name: UserDataCollection, userId?: string) {
  return collection(db, "users", currentUserId(userId), name);
}

export function userDoc(name: UserDataCollection, id: string, userId?: string) {
  return doc(db, "users", currentUserId(userId), name, id);
}
