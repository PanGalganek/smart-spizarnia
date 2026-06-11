import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/core/firebase";
import { Product } from "@/domain/product";
import { ShoppingItem, ShoppingItemSource } from "@/domain/shopping";
import { manualShoppingItemId, productShoppingItemId } from "@/services/shopping";

const shoppingList = collection(db, "shoppingList");

function withoutUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function addProductToShoppingList(product: Product, source: Exclude<ShoppingItemSource, "manual">) {
  const now = Date.now();
  const item: ShoppingItem = {
    id: productShoppingItemId(product.barcode),
    name: product.name,
    productBarcode: product.barcode,
    product,
    source,
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  await setDoc(doc(shoppingList, item.id), withoutUndefined(item), { merge: true });
  return item;
}

export async function addManualShoppingItem(name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Wpisz nazwę produktu.");
  const now = Date.now();
  const item: ShoppingItem = {
    id: manualShoppingItemId(cleanName),
    name: cleanName,
    source: "manual",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  await setDoc(doc(shoppingList, item.id), item, { merge: true });
  return item;
}

export async function listShoppingItems() {
  const snapshot = await getDocs(shoppingList);
  return snapshot.docs
    .map((entry) => entry.data() as ShoppingItem)
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "active" ? -1 : 1;
      return right.updatedAt - left.updatedAt;
    });
}

export async function markShoppingItemPurchased(item: ShoppingItem) {
  const now = Date.now();
  await setDoc(doc(shoppingList, item.id), { status: "purchased", purchasedAt: now, updatedAt: now }, { merge: true });
}

export async function restoreShoppingItem(item: ShoppingItem) {
  await setDoc(doc(shoppingList, item.id), { status: "active", purchasedAt: null, updatedAt: Date.now() }, { merge: true });
}

export async function deleteShoppingItem(id: string) {
  await deleteDoc(doc(shoppingList, id));
}
