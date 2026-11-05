import { useEffect } from 'react';
import { clearCart } from './store';

/** Empties the cart once checkout succeeded. Renders nothing. */
export default function ClearCart() {
  useEffect(() => clearCart(), []);
  return null;
}
