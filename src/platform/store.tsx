import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { loadPlatform, savePlatform, recoverPlatform, scopedStorage, type StorageLike } from "./persistence";
import type { PlatformState, UpdatePlatform } from "./models";
// Defer the browser storage getter so SecurityError is caught by the persistence guard.
const browserStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  get length() { return localStorage.length; },
  key: (index: number) => localStorage.key(index),
};
const Store = createContext<null | {
  state: PlatformState;
  update: UpdatePlatform;
  notice: string;
  recover: () => void;
  storage: StorageLike;
}>(null);
export function PlatformProvider({ children, userId = null }: { children: ReactNode; userId?: string | null }) {
  const [storage] = useState(() => scopedStorage(browserStorage, userId));
  const [loaded] = useState(() => loadPlatform(storage));
  const [state, setState] = useState(loaded.state);
  const ref = useRef(state);
  const blocked = useRef(loaded.blocked);
  const [notice, setNotice] = useState(loaded.notice);
  const update = useCallback<UpdatePlatform>((fn) => {
    const next = fn(ref.current);
    if (!savePlatform(storage, next, blocked.current)) {
      setNotice(
        "Not saved. Check browser storage or recover your data in Settings.",
      );
      return false;
    }
    ref.current = next;
    setState(next);
    return true;
  }, []);
  const recover = () => {
    try {
      const next = recoverPlatform(storage);
      ref.current = next;
      setState(next);
      blocked.current = false;
      setNotice(
        "Recovery completed from available legacy data in this profile. Previous sources remain in the private backup.",
      );
    } catch {
      setNotice("Recovery failed: storage is unavailable.");
    }
  };
  return (
    <Store.Provider value={{ state, update, notice, recover, storage }}>
      {children}
    </Store.Provider>
  );
}
export function usePlatform() {
  const store = useContext(Store);
  if (!store) throw new Error("PlatformProvider missing");
  return store;
}
