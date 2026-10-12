// The website reads the AI explanations from the app's files at build time. Types, rules and
// validation live in the app (src/bible/ai.ts) so both show exactly the same thing.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseAiFile, type AiExplanation } from "../../../src/bible/ai.ts";
import type { BibleData } from "../../../src/bible/provider.ts";

export {
  aiFor,
  blocks,
  parseAiFile,
  publicDomainTranslations,
  sectionTitles,
  type AiExplanation,
} from "../../../src/bible/ai.ts";

const aiDir = join(resolve(process.cwd(), ".."), "public", "ai");

/** An invalid file throws, which stops the build. */
export function loadAiExplanations(bible: BibleData): AiExplanation[] {
  if (!existsSync(aiDir)) return [];
  return readdirSync(aiDir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) =>
      parseAiFile(
        JSON.parse(readFileSync(join(aiDir, file), "utf8")),
        file.replace(/\.json$/, ""),
        bible,
      ),
    );
}
