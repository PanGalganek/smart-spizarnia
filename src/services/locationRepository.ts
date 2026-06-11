import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/core/firebase";

const legacyLocationNames: Record<string, string> = {
  Lodowka: "Lodówka",
  Zamrazarka: "Zamrażarka",
  Spizarnia: "Spiżarnia",
  Polka: "Półka"
};

export const defaultLocations = ["Lodówka", "Zamrażarka", "Spiżarnia", "Szafka", "Półka", "Blat"];
const locationsRef = doc(db, "settings", "storageLocations");

export function displayLocationName(value: string) {
  return legacyLocationNames[value] ?? value;
}

export async function listLocations(): Promise<string[]> {
  const snapshot = await getDoc(locationsRef);
  if (!snapshot.exists()) {
    await setDoc(locationsRef, { values: defaultLocations, updatedAt: Date.now() });
    return defaultLocations;
  }
  const stored = snapshot.data().values;
  const raw = Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string" && !!value.trim()) : defaultLocations;
  const values = [...new Set(raw.map((value) => displayLocationName(value.trim())))];
  if (JSON.stringify(values) !== JSON.stringify(raw)) await setDoc(locationsRef, { values, updatedAt: Date.now() });
  return values;
}

export async function addLocation(value: string): Promise<string[]> {
  const name = displayLocationName(value.trim());
  if (!name) return listLocations();
  const current = await listLocations();
  const next = current.some((item) => item.toLocaleLowerCase("pl") === name.toLocaleLowerCase("pl")) ? current : [...current, name];
  await setDoc(locationsRef, { values: next, updatedAt: Date.now() });
  return next;
}

export async function removeLocation(value: string): Promise<string[]> {
  const name = displayLocationName(value);
  const current = await listLocations();
  const next = current.filter((item) => item !== name);
  await setDoc(locationsRef, { values: next, updatedAt: Date.now() });
  return next;
}