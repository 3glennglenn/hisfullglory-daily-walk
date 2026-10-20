// A picture of a context check for Instagram, TikTok and WhatsApp: the opening line, the
// verse and the address of the full story on the website. Drawn on the device; nothing is
// uploaded.
import { aiUnreviewedCardLabel, checkUrl, refLabel, shareText, type AppContextCheck } from "./checks";

const size = { width: 1080, height: 1350 };
// Cover Light of src/styles.css (--bg, --surface, --ink, --muted, --link), so the card looks the same in every look and mode.
const colors = { bg: "#F3F1EE", surface: "#FFFFFF", ink: "#251914", muted: "#675A52", link: "#8D5C4B" };
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
  ctx.fillStyle = colors.link;
  ctx.font = font(600, 30);
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Context check", margin, margin + 196);
  // The opening line, as large as it fits. A check that no person checked leaves room for its label below.
  const unchecked = check.review === "ai-unreviewed";
  const room = unchecked ? 560 : 640;
  let px = 72;
  let lines: string[] = [];
  for (; px >= 44; px -= 4) {
    ctx.font = font(400, px);
    lines = wrap(ctx, check.hook, size.width - margin * 2);
    if (lines.length * px * 1.3 <= room) break;
  }
  ctx.fillStyle = colors.ink;
  lines.forEach((line, i) => ctx.fillText(line, margin, margin + 300 + i * px * 1.3));
  // D-06: the label of a check written by an AI model, above the reference, in ink at 600 and 40px, wrapped to the text width.
  if (unchecked) {
    ctx.font = font(600, 40);
    ctx.fillStyle = colors.ink;
    const label = wrap(ctx, aiUnreviewedCardLabel, size.width - margin * 2);
    label.forEach((line, i) => ctx.fillText(line, margin, size.height - margin - 192 - (label.length - 1 - i) * 52));
  }
  ctx.fillStyle = colors.link;
  ctx.font = font(600, 48);
  ctx.fillText(refLabel(check.verse), margin, size.height - margin - 120);
  // A hairline above the address: the muted colour at a third of its strength.
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = colors.muted;
  ctx.fillRect(margin, size.height - margin - 80, size.width - margin * 2, 2);
  ctx.globalAlpha = 1;
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
      await navigator.share({ files: [file], text: shareText(check) });
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
