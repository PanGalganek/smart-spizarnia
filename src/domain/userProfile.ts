export type UserRole = "admin" | "user";
export type UserStatus = "pending" | "active" | "blocked";

export type UserProfile = {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
};

export function accountStatusLabel(status: UserStatus) {
  if (status === "pending") return "oczekujące";
  if (status === "active") return "aktywne";
  return "zablokowane";
}
