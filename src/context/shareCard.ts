// A picture of a context check for Instagram, TikTok and WhatsApp: the opening line, the
// verse and the address of the full story on the website. Drawn on the device; nothing is
// uploaded.
import { checkUrl, refLabel, type AppContextCheck } from "./checks";

const size = { width: 1080, height: 1350 };
// The app's light palette (src/styles.css), so the card looks the same in every theme.
const colors = { bg: "#f6f0e7", ink: "#251914", strong: "#854b38", muted: "#6d5548", card: "#e6d5c1" };
const font = (weight: number, px: number) => `${weight} ${px}px Manrope, system-ui, -apple-system, "Segoe UI", sans-serif`;

function wrap(ctx: CanvasRenderingContext2D, value: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function loadIcon(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = "/icon-192.png";
  });
}

export async function drawShareCard(check: AppContextCheck): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device cannot draw the picture.");
  await document.fonts?.ready;
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, size.width, size.height);
  const margin = 96;
  const icon = await loadIcon();
  if (icon) ctx.drawImage(icon, margin, margin, 88, 88);
  ctx.fillStyle = colors.ink;
  ctx.font = font(600, 44);
  ctx.textBaseline = "middle";
  ctx.fillText("HisFullGlory", margin + (icon ? 112 : 0), margin + 44);
  ctx.fillStyle = colors.strong;
  ctx.font = font(600, 30);
  ctx.textBaseline = "alphabetic";
  ctx.fillText("CONTEXT CHECK", margin, margin + 196);
  // The opening line, as large as it fits.
  let px = 72;
  let lines: string[] = [];
  for (; px >= 44; px -= 4) {
    ctx.font = font(400, px);
    lines = wrap(ctx, check.hook, size.width - margin * 2);
    if (lines.length * px * 1.3 <= 640) break;
  }
  ctx.fillStyle = colors.ink;
  lines.forEach((line, i) => ctx.fillText(line, margin, margin + 300 + i * px * 1.3));
  ctx.fillStyle = colors.strong;
  ctx.font = font(600, 48);
  ctx.fillText(refLabel(check.verse), margin, size.height - margin - 120);
  ctx.fillStyle = colors.card;
  ctx.fillRect(margin, size.height - margin - 80, size.width - margin * 2, 2);
  ctx.fillStyle = colors.muted;
  ctx.font = font(400, 32);
  ctx.fillText(checkUrl(check).replace("https://", ""), margin, size.height - margin - 20);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be made."))), "image/png"),
  );
}

/** Shares the picture through the phone's share sheet, or saves it where that is not possible. */
export async function shareCheckPicture(check: AppContextCheck): Promise<"shared" | "saved" | "cancelled"> {
  const blob = await drawShareCard(check);
  const file = new File([blob], `hisfullglory-${check.slug}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `${check.hook} ${checkUrl(check)}` });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  return "saved";
}
