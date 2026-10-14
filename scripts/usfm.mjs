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
