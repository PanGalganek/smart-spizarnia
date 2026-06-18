import { PantryItem } from "@/domain/product";
import { isChemical, shouldAskForChemicalShopping } from "@/services/productTypes";
import { stockPercentage } from "@/services/stockLevel";

export function shouldAskToBuyAgain(before: PantryItem, after: PantryItem) {
  if (isChemical(after.product)) return shouldAskForChemicalShopping(before, after);
  const beforeLevel = stockPercentage(before);
  const afterLevel = stockPercentage(after);
  return after.quantity === 0 || (after.quantity > 0 && beforeLevel >= 30 && afterLevel < 30);
}
