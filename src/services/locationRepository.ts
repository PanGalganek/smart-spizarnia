import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/core/firebase";
import { ProductType } from "@/domain/product";
import { userDoc } from "@/services/userData";

const legacyLocationNames: Record<string, string> = {
  Lodowka: "Lodówka",
  Zamrazarka: "Zamrażarka",
  Spizarnia: "Spiżarnia",
  Polka: "Półka"
};

export const defaultLocations = ["Lodówka", "Zamrażarka", "Spiżarnia", "Szafka", "Półka", "Blat"];
export const defaultChemicalLocations = ["Szafka pod zlewem", "Łazienka", "Pralnia", "Garaż", "Schowek"];

function locationsRef(type: ProductType = "food") {
  return userDoc("settings", type === "household_chemical" ? "storageLocations_household_chemical" : "storageLocations");
}

function defaultsFor(type: ProductType = "food") {
  return type === "household_chemical" ? defaultChemicalLocations : defaultLocations;
}

export function displayLocationName(value: string) {
  return legacyLocationNames[value] ?? value;
}

export async function listLocations(type: ProductType = "food"): Promise<string[]> {
  const ref = locationsRef(type);
  const defaults = defaultsFor(type);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, { values: defaults, updatedAt: Date.now(), type });
    return defaults;
  }
  const stored = snapshot.data().values;
  const raw = Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string" && !!value.trim()) : defaults;
  const values = [...new Set(raw.map((value) => displayLocationName(value.trim())))];
  if (JSON.stringify(values) !== JSON.stringify(raw)) await setDoc(ref, { values, updatedAt: Date.now(), type });
  return values;
}

export async function addLocation(value: string, type: ProductType = "food"): Promise<string[]> {
  const name = displayLocationName(value.trim());
  if (!name) return listLocations(type);
  const current = await listLocations(type);
  const next = current.some((item) => item.toLocaleLowerCase("pl") === name.toLocaleLowerCase("pl")) ? current : [...current, name];
  await setDoc(locationsRef(type), { values: next, updatedAt: Date.now(), type });
  return next;
}

export async function removeLocation(value: string, type: ProductType = "food"): Promise<string[]> {
  const name = displayLocationName(value);
  const current = await listLocations(type);
  const next = current.filter((item) => item !== name);
  await setDoc(locationsRef(type), { values: next, updatedAt: Date.now(), type });
  return next;
}
