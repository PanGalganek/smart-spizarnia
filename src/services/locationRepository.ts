import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/core/firebase";

export const defaultLocations = ["Lodowka", "Zamrazarka", "Spizarnia", "Szafka", "Polka", "Blat"];
const locationsRef = doc(db, "settings", "storageLocations");

export async function listLocations(): Promise<string[]> {
  const snapshot = await getDoc(locationsRef);
  if (!snapshot.exists()) {
    await setDoc(locationsRef, { values: defaultLocations, updatedAt: Date.now() });
    return defaultLocations;
  }
  const values = snapshot.data().values;
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string" && !!value.trim()) : defaultLocations;
}

export async function addLocation(value: string): Promise<string[]> {
  const name = value.trim();
  if (!name) return listLocations();
  const current = await listLocations();
  const next = current.some((item) => item.toLocaleLowerCase("pl") === name.toLocaleLowerCase("pl")) ? current : [...current, name];
  await setDoc(locationsRef, { values: next, updatedAt: Date.now() });
  return next;
}

export async function removeLocation(value: string): Promise<string[]> {
  const current = await listLocations();
  const next = current.filter((item) => item !== value);
  await setDoc(locationsRef, { values: next, updatedAt: Date.now() });
  return next;
}
