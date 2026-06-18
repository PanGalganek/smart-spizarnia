import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/core/firebase";
import { UserProfile, UserStatus } from "@/domain/userProfile";
import { PantryItem, Product } from "@/domain/product";
import { ShoppingItem } from "@/domain/shopping";
import { Meal } from "@/domain/meal";
import { userCollection, userDataCollections } from "@/services/userData";
import { userProfilesCollection } from "@/services/userProfileRepository";

export type UserProfilePreview = {
  products: Product[];
  pantry: PantryItem[];
  shoppingList: ShoppingItem[];
  meals: Meal[];
  settings: { id: string; values?: string[]; type?: string }[];
};

export async function listUserProfiles(): Promise<UserProfile[]> {
  const snapshot = await getDocs(userProfilesCollection);
  return snapshot.docs
    .map((entry) => entry.data() as UserProfile)
    .sort((left, right) => {
      if (left.status !== right.status) return statusWeight(left.status) - statusWeight(right.status);
      return right.createdAt - left.createdAt;
    });
}

export async function setUserStatus(profile: UserProfile, status: UserStatus) {
  const updated = { ...profile, status, updatedAt: Date.now() };
  await setDoc(doc(userProfilesCollection, profile.uid), updated, { merge: true });
  return updated;
}

export async function deleteUserProfileAndData(uid: string) {
  for (const name of userDataCollections) await deleteCollectionDocs(userCollection(name, uid));
  await deleteDoc(doc(userProfilesCollection, uid));
}

export async function getUserProfilePreview(uid: string): Promise<UserProfilePreview> {
  const [products, pantry, shoppingList, meals, settings] = await Promise.all([
    getDocs(userCollection("products", uid)),
    getDocs(userCollection("pantry", uid)),
    getDocs(userCollection("shoppingList", uid)),
    getDocs(userCollection("meals", uid)),
    getDocs(userCollection("settings", uid))
  ]);
  return {
    products: products.docs.map((entry) => entry.data() as Product),
    pantry: pantry.docs.map((entry) => entry.data() as PantryItem),
    shoppingList: shoppingList.docs.map((entry) => entry.data() as ShoppingItem),
    meals: meals.docs.map((entry) => entry.data() as Meal),
    settings: settings.docs.map((entry) => ({ id: entry.id, ...entry.data() as { values?: string[]; type?: string } }))
  };
}

async function deleteCollectionDocs(target: ReturnType<typeof collection>) {
  const snapshot = await getDocs(target);
  let batch = writeBatch(db);
  let count = 0;
  for (const entry of snapshot.docs) {
    batch.delete(entry.ref);
    count += 1;
    if (count >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

function statusWeight(status: UserStatus) {
  if (status === "pending") return 0;
  if (status === "active") return 1;
  return 2;
}
