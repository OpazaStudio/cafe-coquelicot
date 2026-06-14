"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  addItem,
  cartCount,
  cartSubtotalCents,
  removeItem,
  sanitizeCart,
  setQty,
  type Cart,
  type CartItemInput,
} from "./cart";

const STORAGE_KEY = "coquelicot.cart.v1";

type CartContextValue = {
  items: Cart;
  count: number;
  subtotalCents: number;
  /** false tant que le localStorage n'a pas été relu (SSR → hydratation). */
  ready: boolean;
  add: (item: CartItemInput, qty?: number) => void;
  remove: (key: string) => void;
  changeQty: (key: string, qty: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

type CartState = { items: Cart; ready: boolean };

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>({ items: [], ready: false });
  const { items, ready } = state;
  const setItems = useCallback(
    (updater: (cart: Cart) => Cart) =>
      setState((s) => ({ ...s, items: updater(s.items) })),
    [],
  );

  useEffect(() => {
    let stored: Cart = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      stored = raw ? sanitizeCart(JSON.parse(raw)) : [];
    } catch {
      stored = [];
    }
    // Hydratation one-shot depuis le localStorage (système externe) : le SSR
    // doit rendre 0 article, le vrai panier n'existe que dans le navigateur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ items: stored, ready: true });
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // stockage indisponible (navigation privée…) : panier en mémoire seulement
    }
  }, [items, ready]);

  const add = useCallback(
    (item: CartItemInput, qty = 1) =>
      setItems((cart) => addItem(cart, item, qty)),
    [setItems],
  );
  const remove = useCallback(
    (key: string) => setItems((cart) => removeItem(cart, key)),
    [setItems],
  );
  const changeQty = useCallback(
    (key: string, qty: number) => setItems((cart) => setQty(cart, key, qty)),
    [setItems],
  );
  const clear = useCallback(() => setItems(() => []), [setItems]);

  return (
    <CartContext.Provider
      value={{
        items,
        count: cartCount(items),
        subtotalCents: cartSubtotalCents(items),
        ready,
        add,
        remove,
        changeQty,
        clear,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart doit être utilisé sous <CartProvider>.");
  }
  return ctx;
}
