/**
 * Block names with earnings inside the next 48h when data exists.
 * Plug in a vendor or static map later; default does not block.
 */
export function earningsWithin48h(_ticker: string): boolean {
  return false
}
