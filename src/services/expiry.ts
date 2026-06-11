export type ExpiryWarning = {
  level: "expired" | "today" | "urgent" | "soon";
  days: number;
  label: string;
};

export function getExpiryWarning(expiryDate?: string, now = new Date()): ExpiryWarning | null {
  if (!expiryDate) return null;
  const expiry = parseIsoDate(expiryDate);
  if (!expiry) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { level: "expired", days, label: `Po terminie o ${Math.abs(days)} dni` };
  if (days === 0) return { level: "today", days, label: "Termin upływa dzisiaj" };
  if (days <= 3) return { level: "urgent", days, label: `Termin za ${days} dni` };
  if (days <= 7) return { level: "soon", days, label: `Termin za ${days} dni` };
  return null;
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
}
