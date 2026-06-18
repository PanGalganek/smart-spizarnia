import { collection, deleteDoc, doc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { db } from "@/core/firebase";
import { PantryItem, Product, Unit } from "@/domain/product";
import { ShoppingItem, ShoppingItemSource } from "@/domain/shopping";
import { manualShoppingItemId, productShoppingItemId } from "@/services/shopping";
import { convertPantryAmount, preferredPantryUnit } from "@/services/pantryUnits";
import { isChemical } from "@/services/productTypes";

const shoppingList = collection(db, "shoppingList");
const pantry = collection(db, "pantry");
const products = collection(db, "products");

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

export async function purchaseKnownProduct(item: ShoppingItem, amount: number, inputUnit: Unit) {
  if (!item.product) throw new Error("Ten wpis nie ma zapisanego produktu. Użyj skanera.");
  const product = item.product;
  const shoppingRef = doc(shoppingList, item.id);
  const pantryRef = doc(pantry, product.barcode);
  const productRef = doc(products, product.barcode);
  const now = Date.now();

  if (isChemical(product)) {
    const next: PantryItem = {
      barcode: product.barcode,
      product: { ...product, type: "household_chemical", nutrientsPer100g: {}, defaultUnit: "szt" },
      quantity: 100,
      capacity: 100,
      unit: "szt",
      chemicalLevel: "full",
      status: "active",
      updatedAt: now
    };
    await runTransaction(db, async (transaction) => {
      transaction.set(pantryRef, withoutUndefined(next), { merge: true });
      transaction.set(productRef, withoutUndefined(next.product), { merge: true });
      transaction.set(shoppingRef, { status: "purchased", purchasedAt: now, updatedAt: now }, { merge: true });
    });
    return;
  }

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(pantryRef);
    const current = snapshot.exists() ? snapshot.data() as PantryItem : null;
    const pantryUnit = current?.unit ?? preferredPantryUnit(product, inputUnit);
    const addedAmount = convertPantryAmount(product, amount, inputUnit, pantryUnit);
    const previousQuantity = Number(current?.quantity) || 0;
    const next: PantryItem = {
      barcode: product.barcode,
      product,
      quantity: Math.round((previousQuantity + addedAmount) * 100) / 100,
      unit: pantryUnit,
      expiryDate: previousQuantity > 0 ? current?.expiryDate : undefined,
      location: current?.location,
      status: "active",
      updatedAt: now
    };
    transaction.set(pantryRef, withoutUndefined(next));
    transaction.set(productRef, withoutUndefined(product), { merge: true });
    transaction.set(shoppingRef, { status: "purchased", purchasedAt: now, updatedAt: now }, { merge: true });
  });
}

export async function restoreShoppingItem(item: ShoppingItem) {
  await setDoc(doc(shoppingList, item.id), { status: "active", purchasedAt: null, updatedAt: Date.now() }, { merge: true });
}

export async function deleteShoppingItem(id: string) {
  await deleteDoc(doc(shoppingList, id));
}
