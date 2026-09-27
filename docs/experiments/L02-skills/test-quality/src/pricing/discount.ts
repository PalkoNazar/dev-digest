export interface Cart {
  /** Cart subtotal in dollars. */
  subtotal: number;
  coupon?: string;
  isMember: boolean;
}

/** Final price after the member discount and an optional coupon. */
export function applyDiscount(cart: Cart): number {
  if (cart.subtotal <= 0) throw new RangeError('subtotal must be positive');

  let total = cart.subtotal;
  // Members get 10% off orders of $100 or more.
  if (cart.isMember && cart.subtotal >= 100) total = total * 0.9;
  // WELCOME10 takes $10 off, but never below zero.
  if (cart.coupon === 'WELCOME10') total = total - 10;

  return Math.max(0, Math.round(total * 100) / 100);
}
