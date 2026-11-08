import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } from "firebase/firestore";

const projectId = "demo-smart-spizarnia";
const rootAdmin = "xFkLT9w6iWhSgzTyUy1QUj3d26R2";
let env: RulesTestEnvironment;
const profile = (uid: string, role = "user", status = "active") => ({
  uid, email: `${uid}@test.example`, role, status, createdAt: 1, updatedAt: 1
});
const product = {
  barcode: "milk", name: "Mleko", nutrientsPer100g: { energyKcal: 50, proteins: 3 }, source: "manual", updatedAt: 1
};
const pack = { id: "carton", amount: 800, capacity: 1000, unit: "ml", expiryDate: "2026-11-12", opened: true, createdAt: 1 };
const pantry = { barcode: "milk", product, quantity: 800, capacity: 1000, packages: [pack], unit: "ml", status: "active", updatedAt: 1 };
const ingredient = {
  barcode: "milk", productName: "Mleko", amount: 200, unit: "ml", nutritionBasis: "per100",
  nutrients: { energyKcal: 100 }, tracksPantry: true, consumedPackages: [{ ...pack, amount: 200 }]
};
const meal = {
  id: "lunch", name: "Obiad", type: "lunch", ingredients: [ingredient], servings: 1,
  totals: { energyKcal: 100 }, dateKey: "2026-11-08", createdAt: 1, consumerId: "jan", consumerName: "Jan"
};
const summary = { dateKey: "2026-11-08", totals: { energyKcal: 100 }, mealCount: 1, consumerId: "jan", updatedAt: 1 };
const validDocs = {
  "products/milk": product,
  "pantry/milk": pantry,
  "meals/lunch": meal,
  "dailySummaries/2026-11-08__jan": summary,
  "mealTemplates/template": { id: "template", name: "Obiad", type: "lunch", ingredients: [{ barcode: "milk", productName: "Mleko", amount: 200, unit: "ml" }], servings: 2, createdAt: 1, updatedAt: 1 },
  "shoppingList/milk": { id: "milk", name: "Mleko", productBarcode: "milk", product, source: "saved", status: "active", createdAt: 1, updatedAt: 1 },
  "consumers/jan": { id: "jan", name: "Jan" },
  "settings/storageLocations": { values: ["Lodówka"], type: "food", updatedAt: 1 }
};
function db(uid: string) {
  return env.authenticatedContext(uid, { email: `${uid}@test.example` }).firestore();
}
async function seed(path: string, data: object) {
  await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), path), data));
}

beforeAll(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error("Use npm run test:rules to start the local emulator.");
  const [host, port] = address.split(":");
  if (!["127.0.0.1", "localhost"].includes(host)) throw new Error("Rules tests only use a local emulator.");
  env = await initializeTestEnvironment({
    projectId, firestore: { host, port: Number(port), rules: readFileSync("firestore.rules", "utf8") }
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const profiles = [profile("alice"), profile("bob"), profile("pending", "user", "pending"), profile("blocked", "user", "blocked"), profile("admin", "admin"), profile(rootAdmin, "admin")];
    await Promise.all(profiles.map((entry) => setDoc(doc(database, "userProfiles", entry.uid), entry)));
  });
});
afterAll(async () => { await env?.cleanup(); });

describe("account boundaries", () => {
  it.each(Object.entries(validDocs))("allows the active owner to read, create and delete %s", async (path, data) => {
    const ref = doc(db("alice"), `users/alice/${path}`);
    await assertSucceeds(setDoc(ref, data));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it.each(Object.entries(validDocs))("denies other users read, list, create, update and delete access to %s", async (path, data) => {
    await seed(`users/alice/${path}`, data);
    const database = db("bob");
    const ref = doc(database, `users/alice/${path}`);
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(database, `users/alice/${path.split("/")[0]}`)));
    await assertFails(setDoc(ref, data));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(doc(database, `users/alice/${path}-new`), data));
  });

  it.each(["pending", "blocked", "missing"])("denies own data to %s profiles", async (uid) => {
    await seed(`users/${uid}/products/milk`, product);
    const ref = doc(db(uid), `users/${uid}/products/milk`);
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, product));
    await assertFails(deleteDoc(ref));
  });

  it("denies anonymous and unknown collection access", async () => {
    await seed("users/alice/products/milk", product);
    const anonymous = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonymous, "users/alice/products/milk")));
    await assertFails(setDoc(doc(anonymous, "userProfiles/anonymous"), profile("anonymous", "user", "pending")));
    await assertFails(setDoc(doc(db("alice"), "users/alice/unexpected/document"), { value: 1 }));
    await assertFails(getDoc(doc(db("admin"), "unexpected/document")));
  });

  it("allows active administrators to manage another account", async () => {
    const ref = doc(db("admin"), "users/alice/products/milk");
    await assertSucceeds(setDoc(ref, product));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
    await assertSucceeds(updateDoc(doc(db("admin"), "userProfiles/pending"), { status: "active", updatedAt: 2 }));
  });

  it.each(["admin", rootAdmin])("revokes admin access on blocking the profile, including %s", async (uid) => {
    const database = db(uid);
    await seed("users/alice/products/milk", product);
    await assertSucceeds(getDoc(doc(database, "users/alice/products/milk")));
    await seed(`userProfiles/${uid}`, profile(uid, "admin", "blocked"));
    await assertFails(getDoc(doc(database, "users/alice/products/milk")));
    await assertFails(setDoc(doc(database, "users/alice/products/milk"), product));
    await assertFails(updateDoc(doc(database, `userProfiles/${uid}`), { status: "active" }));
  });
});

describe("registration and roles", () => {
  it("allows only a matching pending user profile during self-registration", async () => {
    const ref = doc(db("new"), "userProfiles/new");
    await assertFails(setDoc(ref, profile("new", "admin")));
    await assertFails(setDoc(ref, profile("new", "user", "active")));
    await assertFails(setDoc(ref, { ...profile("new", "user", "pending"), email: "someone-else@test.example" }));
    await assertFails(setDoc(ref, profile("wrong", "user", "pending")));
    await assertSucceeds(setDoc(ref, profile("new", "user", "pending")));
    await assertFails(updateDoc(ref, { status: "active" }));
  });

  it("does not allow users to promote themselves or change another profile", async () => {
    await assertFails(updateDoc(doc(db("alice"), "userProfiles/alice"), { role: "admin" }));
    await assertFails(updateDoc(doc(db("alice"), "userProfiles/bob"), { status: "blocked" }));
    await assertFails(getDoc(doc(db("alice"), "userProfiles/bob")));
    await assertSucceeds(getDoc(doc(db("alice"), "userProfiles/alice")));
    await assertFails(getDocs(collection(db("alice"), "userProfiles")));
  });

  it("keeps profile identifiers bound to paths even for admin writes", async () => {
    await assertFails(setDoc(doc(db("admin"), "userProfiles/bob"), profile("alice")));
    await assertFails(setDoc(doc(db("admin"), "userProfiles/new"), profile("wrong")));
    await assertFails(deleteDoc(doc(db("admin"), "userProfiles/admin")));
    await assertFails(deleteDoc(doc(db("admin"), `userProfiles/${rootAdmin}`)));
  });

  it("bootstraps only the designated admin's own active admin profile", async () => {
    await env.withSecurityRulesDisabled((context) => deleteDoc(doc(context.firestore(), `userProfiles/${rootAdmin}`)));
    const database = db(rootAdmin);
    await assertFails(setDoc(doc(database, "userProfiles/imposter"), profile("imposter", "admin")));
    await assertFails(setDoc(doc(database, "users/alice/products/milk"), product));
    await assertSucceeds(setDoc(doc(database, `userProfiles/${rootAdmin}`), profile(rootAdmin, "admin")));
    await assertSucceeds(setDoc(doc(database, "users/alice/products/milk"), product));
  });
});

describe("stored data validation", () => {
  const invalidWrites: [string, object][] = [
    ["products/wrong", product],
    ["products/milk", { ...product, name: "" }],
    ["products/milk", { ...product, unexpected: true }],
    ["products/milk", { ...product, nutrientsPer100g: { energyKcal: -1 } }],
    ["products/milk", { ...product, nutrientsPer100g: { fat: "3" } }],
    ["products/milk", { ...product, nutrientsPer100g: { unknown: 1 } }],
    ["products/milk", { ...product, nutrientsPer100g: { energyKcal: Number.NaN } }],
    ["products/milk", { ...product, packageAmount: Number.POSITIVE_INFINITY }],
    ["products/milk", { ...product, updatedAt: -1 }],
    ["pantry/milk", { ...pantry, quantity: -1 }],
    ["pantry/milk", { ...pantry, quantity: Number.NaN }],
    ["pantry/milk", { ...pantry, capacity: 100 }],
    ["pantry/milk", { ...pantry, status: "consumed" }],
    ["pantry/milk", { ...pantry, unit: "kg" }],
    ["pantry/milk", { ...pantry, product: { ...product, barcode: "wrong" } }],
    ["pantry/milk", { ...pantry, product: { ...product, nutrientsPer100g: { energyKcal: -1 } } }],
    ["pantry/milk", { ...pantry, packages: Array(1001).fill(pack) }],
    ["meals/wrong", meal],
    ["meals/lunch", { ...meal, servings: 0 }],
    ["meals/lunch", { ...meal, servings: 1.5 }],
    ["meals/lunch", { ...meal, ingredients: [] }],
    ["meals/lunch", { ...meal, ingredients: Array(51).fill(ingredient) }],
    ["meals/lunch", { ...meal, recipeTotals: { energyKcal: -1 } }],
    ["meals/lunch", { ...meal, dateKey: "08.11.2026" }],
    ["dailySummaries/wrong", summary],
    ["dailySummaries/2026-11-08__jan", { ...summary, mealCount: -1 }],
    ["dailySummaries/2026-11-08__jan", { ...summary, totals: { energyKcal: -1 } }],
    ["shoppingList/milk", { ...validDocs["shoppingList/milk"], productBarcode: "wrong" }],
    ["consumers/wrong", { id: "jan", name: "Jan" }],
    ["settings/unknown", { values: [], updatedAt: 1 }]
  ];
  it.each(invalidWrites.map(([path, data], index) => [index, path, data] as const))("rejects malformed write %i to %s", async (_index, path, data) => {
    await assertFails(setDoc(doc(db("alice"), `users/alice/${path}`), data));
  });

  it("checks resulting data on partial updates", async () => {
    await seed("users/alice/pantry/milk", pantry);
    await assertSucceeds(updateDoc(doc(db("alice"), "users/alice/pantry/milk"), { location: "Szafka" }));
    await assertFails(updateDoc(doc(db("alice"), "users/alice/pantry/milk"), { quantity: -1 }));
  });

  it("accepts real application timestamps and purchase restoration", async () => {
    const now = Date.now();
    const database = db("alice");
    await assertSucceeds(setDoc(doc(database, "users/alice/products/milk"), { ...product, updatedAt: now }));
    await assertSucceeds(setDoc(doc(database, "users/alice/pantry/milk"), { ...pantry, updatedAt: now }));
    const shoppingRef = doc(database, "users/alice/shoppingList/milk");
    await assertSucceeds(setDoc(shoppingRef, { ...validDocs["shoppingList/milk"], createdAt: now, updatedAt: now, status: "purchased", purchasedAt: now }));
    await assertSucceeds(updateDoc(shoppingRef, { purchasedAt: null, status: "active", updatedAt: now }));
  });

  it("does not bypass validation for administrators", async () => {
    await assertFails(setDoc(doc(db("admin"), "users/alice/pantry/milk"), { ...pantry, quantity: -10 }));
  });

  it("accepts an existing legacy product with optional fields omitted", async () => {
    await assertSucceeds(setDoc(doc(db("alice"), "users/alice/pantry/milk"), { barcode: "milk", product, quantity: 800, unit: "ml", expiryDate: "2026-11-12" }));
    await assertSucceeds(setDoc(doc(db("alice"), "users/alice/settings/legacyRootMigration_v1"), { values: [], type: "food", updatedAt: Date.now() }));
  });

  it("accepts chemicals, empty stock and the legacy daily summary identity", async () => {
    await assertSucceeds(setDoc(doc(db("alice"), "users/alice/pantry/milk"), { ...pantry, product: { ...product, type: "household_chemical", nutrientsPer100g: {} }, quantity: 100, capacity: 100, unit: "szt", chemicalLevel: "full" }));
    await assertSucceeds(setDoc(doc(db("alice"), "users/alice/pantry/milk"), { ...pantry, quantity: 0, packages: [], status: "consumed" }));
    await assertSucceeds(setDoc(doc(db("alice"), "users/alice/dailySummaries/2026-11-08"), { dateKey: "2026-11-08", totals: {}, mealCount: 0, updatedAt: 1 }));
  });

  it("prevents deleting or unprotecting a protected consumer through direct requests", async () => {
    await seed("users/alice/consumers/jan", { id: "jan", name: "Jan", protected: true });
    const ref = doc(db("alice"), "users/alice/consumers/jan");
    await assertFails(deleteDoc(ref));
    await assertFails(updateDoc(ref, { protected: false }));
    await assertSucceeds(updateDoc(ref, { name: "Janek" }));
  });

  it("allows a meal transaction with package history and its cancellation", async () => {
    const database = db("alice");
    const pantryRef = doc(database, "users/alice/pantry/milk");
    const mealRef = doc(database, "users/alice/meals/lunch");
    const summaryRef = doc(database, "users/alice/dailySummaries/2026-11-08__jan");
    await seed(pantryRef.path, pantry);
    await assertSucceeds(runTransaction(database, async (transaction) => {
      await transaction.get(pantryRef);
      await transaction.get(summaryRef);
      transaction.update(pantryRef, { quantity: 600, packages: [{ ...pack, amount: 600 }] });
      transaction.set(mealRef, meal);
      transaction.set(summaryRef, summary);
    }));
    await assertSucceeds(runTransaction(database, async (transaction) => {
      await transaction.get(mealRef);
      await transaction.get(pantryRef);
      await transaction.get(summaryRef);
      transaction.update(pantryRef, { quantity: 800, packages: [pack] });
      transaction.delete(mealRef);
      transaction.delete(summaryRef);
    }));
    expect((await getDoc(pantryRef)).data()?.quantity).toBe(800);
  });

  it("leaves the entire transaction unchanged if one write is denied", async () => {
    const database = db("alice");
    await seed("users/alice/pantry/milk", pantry);
    await assertFails(runTransaction(database, async (transaction) => {
      const ref = doc(database, "users/alice/pantry/milk");
      await transaction.get(ref);
      transaction.update(ref, { quantity: 600, packages: [{ ...pack, amount: 600 }] });
      transaction.set(doc(database, "users/bob/meals/lunch"), meal);
    }));
    expect((await getDoc(doc(database, "users/alice/pantry/milk"))).data()?.quantity).toBe(800);
  });

  it("restricts legacy root data to admin reads only", async () => {
    await seed("products/milk", product);
    await assertFails(getDoc(doc(db("alice"), "products/milk")));
    await assertSucceeds(getDoc(doc(db("admin"), "products/milk")));
    await assertFails(setDoc(doc(db("admin"), "products/milk"), product));
  });
});
