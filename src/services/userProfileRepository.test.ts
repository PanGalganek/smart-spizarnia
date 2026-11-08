import { beforeEach, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const mocks = vi.hoisted(() => ({ getDoc: vi.fn(), migrate: vi.fn() }));
vi.mock("firebase/firestore", () => ({ collection: vi.fn(), doc: vi.fn(), getDoc: mocks.getDoc, setDoc: vi.fn() }));
vi.mock("@/core/firebase", () => ({ db: {} }));
vi.mock("@/services/userData", () => ({ ADMIN_UID: "root" }));
vi.mock("@/services/legacyMigration", () => ({ migrateLegacyAdminData: mocks.migrate }));
import { ensureUserProfile } from "@/services/userProfileRepository";

beforeEach(() => vi.clearAllMocks());

it.each(["blocked", "pending"])("returns a %s admin profile without attempting forbidden migration reads", async (status) => {
  const profile = { uid: "root", role: "admin", status };
  mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => profile });
  expect(await ensureUserProfile({ uid: "root" } as User)).toEqual(profile);
  expect(mocks.migrate).not.toHaveBeenCalled();
});

it("still migrates an active administrator", async () => {
  const profile = { uid: "root", role: "admin", status: "active" };
  mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => profile });
  await ensureUserProfile({ uid: "root" } as User);
  expect(mocks.migrate).toHaveBeenCalledWith("root");
});

it("does not start admin migration for an ordinary user", async () => {
  const profile = { uid: "root", role: "user", status: "active" };
  mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => profile });
  await ensureUserProfile({ uid: "root" } as User);
  expect(mocks.migrate).not.toHaveBeenCalled();
});
