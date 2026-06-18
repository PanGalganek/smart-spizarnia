import { collection, doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "@/core/firebase";
import { ADMIN_UID, userDataCollections, userDoc } from "@/services/userData";

const migrationId = "legacyRootMigration_v1";

export async function migrateLegacyAdminData(uid: string) {
  if (uid !== ADMIN_UID) return;
  const marker = userDoc("settings", migrationId, uid);
  if ((await getDoc(marker)).exists()) return;

  for (const name of userDataCollections) {
    const snapshot = await getDocs(collection(db, name));
    let batch = writeBatch(db);
    let count = 0;
    for (const entry of snapshot.docs) {
      batch.set(doc(db, "users", uid, name, entry.id), entry.data(), { merge: true });
      count += 1;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  }

  const done = writeBatch(db);
  done.set(marker, { values: [], type: "food", updatedAt: Date.now() }, { merge: true });
  await done.commit();
}
