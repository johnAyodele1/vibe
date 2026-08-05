/**
 * Calculates the marked-up price for the user.
 * Adds 15% on top of the provider's base price and rounds up to the nearest integer credit.
 */
export const getClientPrice = (basePrice: number): number => {
  return Math.ceil(basePrice * 1.15);
};
