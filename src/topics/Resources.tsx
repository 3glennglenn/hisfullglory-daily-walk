import { usePlatform } from "../platform/store";
import { recommendResources } from "./graph";
import { GroupedList, Row } from "../ui/List";

// Suggestions prepared on this device from the reader's chosen topics (shown inside My Walk). Same words as
// before, as grouped sections: the text, one row per suggestion, and the explanation as a disclosure row.
export function Resources() {
  const { state } = usePlatform();
  const resources = recommendResources(state.privateTopics, state.followedTopics);
  return (
    <>
      <GroupedList title="Scripture and a next step" plain>
        <div className="group-pad">
          <p>
            Suggestions are prepared on this device from your chosen topics. Journal and prayer text are never
            scanned.
          </p>
          {state.privateTopics.some((id) => ["addiction", "drugs", "alcohol", "anxiety"].includes(id)) && (
            <p>
              If you are in immediate danger, contact local emergency services or a trusted person who can help you
              reach safety. Community encouragement does not replace qualified medical, mental-health or addiction
              support.
            </p>
          )}
        </div>
      </GroupedList>
      {resources.length > 0 && (
        <GroupedList>
          {resources.map((r) => (
            <Row key={r.id} title={`${r.kind} · ${r.title}`} href={r.path} chevron />
          ))}
        </GroupedList>
      )}
      <details className="group-disclosure">
        <summary>Why these suggestions?</summary>
        <p>
          Only your explicit private preferences and followed topics are used. With no topics selected, we suggest the
          Growing closer to God journey. Popularity is not theological or professional authority.
        </p>
      </details>
    </>
  );
}
