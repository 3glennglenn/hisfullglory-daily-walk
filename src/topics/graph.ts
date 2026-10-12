// Editorial relationships are suggestions for reflection, never clinical advice.
export const devotionalTopics = [
  "Anxiety", "Purpose", "Relationships", "Heartbreak", "Temptation", "Faith",
  "Forgiveness", "Discipline", "Loneliness", "Grief", "Identity", "Marriage",
  "Money", "Prayer", "Growing closer to God",
] as const;
const additionalTopics = ["Pornography", "Alcohol", "Addiction", "Drugs", "Anger", "Pride",
  "Envy", "Gossip", "Returning to God", "New Christian", "Understanding Scripture"] as const;
export const topicLabels = [...devotionalTopics, ...additionalTopics] as const;
export type TopicLabel = typeof topicLabels[number];
export const topicIds = ["anxiety","purpose","relationships","heartbreak","temptation","faith","forgiveness","discipline","loneliness","grief","identity","marriage","money","prayer","growing-closer-to-god","pornography","alcohol","addiction","drugs","anger","pride","envy","gossip","returning-to-god","new-christian","understanding-scripture"] as const;
export type TopicId = typeof topicIds[number];
export interface Topic {
  id: TopicId;
  label: TopicLabel;
  devotional?: string;
  passages: string[];
  sensitive: boolean;
}
export const topicGraph: readonly Topic[] = topicLabels.map((label,index) => ({
  id: topicIds[index], label,
  devotional: devotionalTopics.some(t => t === label) ? label.toLowerCase().replaceAll(" ", "-") : undefined,
  passages: ["Grief", "Anxiety", "Loneliness", "Heartbreak"].includes(label)
    ? ["/bible/psalms/23", "/bible/romans/8"]
    : ["/bible/psalms/121"],
  sensitive: ["Temptation", "Pornography", "Alcohol", "Addiction", "Drugs", "Grief", "Heartbreak"].includes(label),
}));
const aliases: Readonly<Record<string, string>> = {
  "sexual-temptation": "temptation", "faith-and-doubt": "faith", "faith-&-doubt": "faith",
  "alcohol-and-sobriety": "alcohol", "addiction-recovery": "addiction", "heartbreak-and-healing": "heartbreak",
};
export function findTopic(value: string | undefined): Topic | undefined {
  if (!value) return undefined;
  return topicGraph.find(t => t.id === (aliases[value] ?? value));
}
export function validTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(v => typeof v === "string" && findTopic(v) ? [findTopic(v)!.id] : []))];
}
export type ResourceKind = "Scripture" | "Study" | "Devotional" | "Path" | "Community" | "Circle" | "Challenge" | "Pastoral article" | "Organization" | "Podcast/video" | "Professional help" | "Emergency guidance" | "Book" | "Product";
export interface Resource {
  id: string; title: string; path: string; kind: ResourceKind;
  topic: string; reason: string;
}
export function recommendResources(privateTopics: string[], followed: string[]): Resource[] {
  // No journal/prayer body, identity, popularity or commerce is accepted as an input.
  const ids = validTopics([...privateTopics, ...followed]);
  return (ids.length ? ids : ["growing-closer-to-god"]).flatMap(id => {
    const topic = findTopic(id)!;
    const reason = privateTopics.includes(id) ? "From your private preferences" : "From a topic you follow";
    const resources: Resource[] = topic.passages.map(path => ({ id: id + path, title: path.replace("/bible/", "").replaceAll("/", " · "), path, kind: "Scripture", topic: id, reason }));
    if (topic.devotional) resources.push({id: id + ":grow", title: topic.label + " devotional", path: "/grow/" + topic.devotional, kind: "Devotional", topic: id, reason});
    return resources;
  }).slice(0, 12);
}
