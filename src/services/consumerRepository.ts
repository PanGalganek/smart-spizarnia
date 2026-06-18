import { deleteDoc, getDocs, setDoc } from "firebase/firestore";
import { Consumer } from "@/domain/meal";
import { userCollection, userDoc } from "@/services/userData";

export async function listConsumers(): Promise<Consumer[]> {
  const snapshot = await getDocs(userCollection("consumers"));
  return snapshot.docs
    .map((entry) => entry.data() as Consumer)
    .sort((left, right) => left.name.localeCompare(right.name, "pl"));
}

export async function addConsumer(name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Wpisz imię osoby.");
  const id = cleanName.toLocaleLowerCase("pl-PL").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id) throw new Error("Wpisz poprawne imię osoby.");
  const consumer = { id, name: cleanName };
  await setDoc(userDoc("consumers", id), consumer);
  return consumer;
}

export async function removeConsumer(consumer: Consumer) {
  if (consumer.protected) throw new Error("Tego profilu nie można usunąć.");
  await deleteDoc(userDoc("consumers", consumer.id));
}
