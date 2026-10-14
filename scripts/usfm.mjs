// Plain verse text from WEB USFM. Used by scripts/import-web.mjs; tested in tests/bible-text.test.ts.
// An opening marker such as `\wj ` is followed by one space that only separates it from its
// text, so that space goes with the marker. A closing marker such as `\wj*` ends at its
// asterisk: the space after it belongs to the text and must stay, or the words on either
// side run together ("his only born\wj*\f + ...\f* \wj Son" must give "born Son").
export function verseText(raw) {
  return raw
    .replace(/\\f\s[\s\S]*?\\f\*/g, "")
    .replace(/\\x\s[\s\S]*?\\x\*/g, "")
    // Heading lines are not verse text: section headings, Psalm titles, and the speaker
    // labels of Song of Songs (`\sp Beloved`), which sit just before the next `\v`.
    .replace(/^\\(?:s\d*|sp|r|d|ms\d*|mr|cl|cp|rem)\b[^\n]*$/gm, "")
    .replace(/\\\+?w\s+([^|\\]*)(?:\|[^\\]*)?\\\+?w\*/g, "$1")
    .replace(/\\\+?[a-z]+\d*\*/gi, "")
    .replace(/\\\+?[a-z]+\d*\s?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Song of Songs names who speaks on `\sp` lines, just before the next verse or between two lines
// of one verse. They are not verse text: this returns the verse text and where each speaker starts
// (`at` is a character offset into the text, 0 before the first word). `opening` holds labels that
// stood before this verse; a label after the verse's last words opens the next verse, so it comes
// back in `next`.
export function verseWithSpeakers(raw, opening = []) {
  const parts = raw.split(/^\\sp[ \t]+([^\n]*)$/m);
  let text = verseText(parts[0]);
  const speakers = [];
  let pending = [...opening];
  if (text) {
    speakers.push(...pending.map((label) => ({ at: 0, label })));
    pending = [];
  }
  for (let i = 1; i < parts.length; i += 2) {
    pending.push(parts[i].trim());
    const words = verseText(parts[i + 1]);
    if (!words) continue;
    speakers.push(...pending.map((label) => ({ at: text ? text.length + 1 : 0, label })));
    pending = [];
    text = text ? `${text} ${words}` : words;
  }
  return { text, speakers, next: pending };
}
