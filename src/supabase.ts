import { createClient } from "@supabase/supabase-js";
import { accountsInApp } from "./native/storeScope";
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
function publicKey(value: string): boolean {
  if (value.startsWith("sb_publishable_")) return true;
  try {
    return JSON.parse(atob(value.split(".")[1])).role === "anon";
  } catch {
    return false;
  }
}
function validUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" ||
      (u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname))
    );
  } catch {
    return false;
  }
}
// The store app of version 1.0 has no accounts (src/native/storeScope.ts): without a client every screen shows its
// guest form, and the app sends nothing to Supabase.
export const supabase =
  accountsInApp && url && key && validUrl(url) && publicKey(key) ? createClient(url, key) : null;
