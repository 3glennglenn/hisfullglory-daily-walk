// Sharing a file from the store app. Inside the iPhone app a link with a `download` attribute does nothing, so a backup
// or a picture would never reach the reader; there the file is written to the app's cache and handed to the phone's
// share sheet (Save to Files, Mail, AirDrop, Messages). Outside the store app this returns "unavailable" and the caller
// keeps its web behaviour. The plugins are loaded only when they are used, so the web build does not carry them.
import { Capacitor } from "@capacitor/core";

export type ShareFileResult = "shared" | "cancelled" | "unavailable";

/** Base64 of a Blob, without the "data:...;base64," prefix. */
async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Writes `data` to the cache as `name` and opens the share sheet with it, in the store app only. */
export async function shareFileNatively(name: string, data: string | Blob, title: string): Promise<ShareFileResult> {
  if (!Capacitor.isNativePlatform()) return "unavailable";
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const written =
    typeof data === "string"
      ? await Filesystem.writeFile({ path: name, data, directory: Directory.Cache, encoding: Encoding.UTF8 })
      : await Filesystem.writeFile({ path: name, data: await base64Of(data), directory: Directory.Cache });
  try {
    await Share.share({ title, files: [written.uri] });
    return "shared";
  } catch {
    // The reader closed the share sheet without choosing a place.
    return "cancelled";
  }
}
