import { supabase } from "../supabase";
import { validCircleResult, type CircleRpcName, type CircleRpcResults } from "./circleContracts";
export type { Circle, CircleMember, CirclePost, CircleReport, CircleRpcName } from "./circleContracts";

// No persistent cache, offline mutation queue, logging or sensitive error output.
export async function circleRpc<N extends CircleRpcName>(name: N, args: Record<string, unknown> = {}): Promise<CircleRpcResults[N]> {
  if (!supabase || !navigator.onLine) throw new Error("Circles need a configured server and an internet connection.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (error) throw new Error("Unable to complete this request. Check sign-in, current rules, permissions and migration 006. Refresh before retrying a submission.");
    if (!validCircleResult(name, data)) throw new Error("Unexpected Circle response contract");
    return data;
  } catch {
    throw new Error("Circles are unavailable or access changed. Check your connection and sign-in, then refresh. A timed-out submission may have saved; check before retrying.");
  } finally { clearTimeout(timeout); }
}
