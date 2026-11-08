import { PantryItem, PantryPackage, Product, Unit } from "@/domain/product";
import { convertPantryAmount, preferredPantryUnit } from "@/services/pantryUnits";

export function packageUnit(product: Product, inputUnit: Unit, currentUnit?: Unit): Unit {
  return currentUnit ?? preferredPantryUnit(product, inputUnit);
}

export function normalizePackages(item: PantryItem): PantryPackage[] {
  const unit = item.unit ?? item.product.defaultUnit ?? "szt";
  const existing = (item.packages ?? [])
    .filter((pack) => Number(pack.amount) > 0)
    .map((pack, index) => ({
      ...pack,
      id: pack.id || `legacy-index-${index}`,
      unit: pack.unit ?? unit,
      amount: round(Number(pack.amount) || 0),
      capacity: round(Math.max(Number(pack.capacity) || 0, Number(pack.amount) || 0)),
      expiryDate: pack.expiryDate ?? item.expiryDate,
      opened: pack.opened || (Number(pack.amount) || 0) < (Number(pack.capacity) || 0),
      createdAt: pack.createdAt ?? index
    }));
  if (existing.length) return existing;
  return packagesFromQuantity(item.product, Number(item.quantity) || 0, unit, Number(item.capacity) || 0)
    .map((pack) => ({ ...pack, expiryDate: item.expiryDate }));
}

export function addPackages(current: PantryItem | null, product: Product, amount: number, inputUnit: Unit, now = Date.now(), expiryDate?: string, expiryDates?: (string | undefined)[]) {
  const unit = packageUnit(product, inputUnit, current?.unit);
  const packages = current ? normalizePackages(current) : [];
  const packageAmount = packageAmountFor(product, unit);
  const converted = convertPantryAmount(product, amount, inputUnit, unit);

  if (inputUnit === "szt" && packageAmount && product.packageUnit === unit) {
    const count = Math.floor(amount);
    for (let index = 0; index < count; index += 1) {
      packages.push(fullPackage(packageAmount, unit, now + index, expiryDates?.[index] || expiryDate));
    }
    const remainder = round(amount - count);
    if (remainder > 0) {
      packages.push({
        id: packageId(`${now}-open`),
        amount: round(remainder * packageAmount),
        capacity: packageAmount,
        unit,
        expiryDate: expiryDates?.[count] || expiryDate,
        opened: true,
        createdAt: now + count
      });
    }
  } else {
    packages.push({
      id: packageId(now),
      amount: converted,
      capacity: packageAmount ? Math.max(packageAmount, converted) : converted,
      unit,
      expiryDate: expiryDates?.[0] || expiryDate,
      opened: packageAmount ? converted < packageAmount : true,
      createdAt: now
    });
  }

  return normalizePackageState(packages, unit);
}

export function consumePackages(current: PantryItem, amount: number, inputUnit: Unit, preferredPackageId?: string) {
  const unit = current.unit;
  const toConsume = convertPantryAmount(current.product, amount, inputUnit, unit);
  const packages = normalizePackages(current);
  const total = packageTotal(packages);
  if (toConsume > total) throw new Error(`W spiżarni jest tylko ${total} ${unit}.`);
  if (preferredPackageId && !packages.some((pack) => pack.id === preferredPackageId)) {
    throw new Error("Wybrane opakowanie zostało już zużyte. Odśwież produkt.");
  }

  let remaining = toConsume;
  const ordered = [...packages].sort((left, right) => comparePackages(left, right, preferredPackageId));
  const next = ordered.map((pack) => ({ ...pack }));
  const consumedPackages: PantryPackage[] = [];

  for (const pack of next) {
    if (remaining <= 0) break;
    const used = Math.min(pack.amount, remaining);
    consumedPackages.push({ ...pack, amount: used });
    pack.amount = round(pack.amount - used);
    pack.opened = pack.amount > 0 && pack.amount < pack.capacity;
    remaining = round(remaining - used);
  }

  return { ...normalizePackageState(next.filter((pack) => pack.amount > 0), unit), consumedPackages };
}

export function restorePackages(current: PantryItem, consumedPackages: PantryPackage[], amount: number) {
  if (!consumedPackages.length || Math.abs(packageTotal(consumedPackages) - amount) > 0.001) {
    throw new Error("Zapis zużycia opakowań jest niezgodny z ilością składnika.");
  }
  const packages = normalizePackages(current).map((pack) => ({ ...pack }));
  const seen = new Set<string>();
  for (const consumed of consumedPackages) {
    if (!consumed.id || seen.has(consumed.id) || consumed.unit !== current.unit
      || !Number.isFinite(consumed.amount) || consumed.amount <= 0
      || !Number.isFinite(consumed.capacity) || consumed.capacity < consumed.amount) {
      throw new Error("Nieprawidłowy zapis zużycia opakowania.");
    }
    seen.add(consumed.id);
    const existing = packages.find((pack) => pack.id === consumed.id);
    const restored = round((existing?.amount ?? 0) + consumed.amount);
    const capacity = existing?.capacity ?? consumed.capacity;
    if (restored > capacity) throw new Error("Nie można przywrócić ilości większej od pojemności opakowania.");
    if (existing) {
      // Keep dates edited since the meal and stock changes from other meals.
      existing.amount = restored;
      existing.opened = restored < capacity;
    } else {
      packages.push({ ...consumed, amount: restored, opened: restored < capacity });
    }
  }
  return normalizePackageState(packages, current.unit);
}

export function packageTotal(packages: PantryPackage[]) {
  return round(packages.reduce((sum, pack) => sum + pack.amount, 0));
}

export function packageCapacity(packages: PantryPackage[]) {
  return round(packages.reduce((sum, pack) => sum + pack.capacity, 0));
}

export function packageSummary(item: PantryItem) {
  const packages = normalizePackages(item).sort(comparePackages);
  const unit = item.unit;
  const open = packages.filter(isOpenPackage);
  const full = packages.filter((pack) => !isOpenPackage(pack));
  const fullGroups = new Map<string, number>();
  full.forEach((pack) => fullGroups.set(`${pack.capacity} ${pack.unit}`, (fullGroups.get(`${pack.capacity} ${pack.unit}`) ?? 0) + 1));
  const fullText = [...fullGroups.entries()].map(([label, count]) => `${count} × ${label}`);
  const openText = open.map((pack) => `${pack.amount} ${unit}`);
  const activePackage = packages[0];
  return {
    fullCount: full.length,
    openCount: open.length,
    text: [...fullText, ...openText].join(" + ") || `0 ${unit}`,
    openText: openText.join(", "),
    closedText: fullText.join(" + "),
    activeExpiryDate: activePackage?.expiryDate,
    hasOpenPackage: open.length > 0,
    fullPackages: full
  };
}

export function setPackageExpiryDate(item: PantryItem, packageId: string, expiryDate?: string): PantryItem {
  const packages = normalizePackages(item).map((pack) =>
    pack.id === packageId ? { ...pack, expiryDate: expiryDate || undefined } : pack
  );
  return { ...item, packages, expiryDate: undefined };
}

function packagesFromQuantity(product: Product, quantityInput: number, unit: Unit, savedCapacity: number) {
  const quantity = round(quantityInput);
  if (quantity <= 0) return [];
  const packageAmount = packageAmountFor(product, unit);
  if (!packageAmount) return [{ id: "legacy-0", amount: quantity, capacity: Math.max(savedCapacity, quantity), unit, expiryDate: undefined, opened: true, createdAt: 0 }];

  const fullCount = Math.floor(quantity / packageAmount);
  const remainder = round(quantity - fullCount * packageAmount);
  const packages: PantryPackage[] = [];
  if (remainder > 0) packages.push({ id: "legacy-open", amount: remainder, capacity: packageAmount, unit, expiryDate: undefined, opened: true, createdAt: 0 });
  for (let index = 0; index < fullCount; index += 1) packages.push({ ...fullPackage(packageAmount, unit, index + 1), id: `legacy-${index + 1}` });
  return packages;
}

function normalizePackageState(packages: PantryPackage[], unit: Unit) {
  const normalized = packages.map((pack, index) => ({
    ...pack,
    id: pack.id || packageId(index),
    amount: round(pack.amount),
    capacity: round(Math.max(pack.capacity, pack.amount)),
    unit,
    opened: pack.amount < pack.capacity,
    createdAt: pack.createdAt ?? index
  }));
  return {
    packages: normalized,
    quantity: packageTotal(normalized),
    capacity: Math.max(packageCapacity(normalized), packageTotal(normalized)),
    unit
  };
}

function packageAmountFor(product: Product, unit: Unit) {
  return product.packageUnit === unit && product.packageAmount && product.packageAmount > 0 ? product.packageAmount : undefined;
}

function fullPackage(amount: number, unit: Unit, seed: number, expiryDate?: string) {
  return { id: packageId(seed), amount, capacity: amount, unit, expiryDate, opened: false, createdAt: seed };
}

function isOpenPackage(pack: PantryPackage) {
  return Boolean(pack.opened || pack.amount < pack.capacity);
}

function comparePackages(left: PantryPackage, right: PantryPackage, preferredPackageId?: string) {
  if (preferredPackageId && left.id !== right.id) {
    if (left.id === preferredPackageId) return -1;
    if (right.id === preferredPackageId) return 1;
  }
  return Number(isOpenPackage(right)) - Number(isOpenPackage(left))
    || expirySort(left.expiryDate, right.expiryDate)
    || (left.createdAt ?? 0) - (right.createdAt ?? 0)
    || left.id.localeCompare(right.id);
}

function expirySort(left?: string, right?: string) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function packageId(seed: unknown) {
  return `pkg-${String(seed)}-${Math.random().toString(36).slice(2, 8)}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
