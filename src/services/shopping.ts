export function manualShoppingItemId(name: string) {
  const normalized = name.trim().toLocaleLowerCase("pl-PL").replace(/\//g, "-").replace(/\s+/g, "-");
  return `manual-${normalized}`;
}

export function productShoppingItemId(barcode: string) {
  return `product-${barcode}`;
}
