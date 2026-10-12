import { daily } from "../data";
import { devotionalTopics } from "../topics/graph";
export const topics = devotionalTopics;
const applications = [
  "Name one worry without judging yourself. Ask God for help, and consider reaching out to someone you trust. Faith and appropriate professional support can belong together.",
  "Look for one ordinary act of faithfulness before asking for a complete map of your future. Serve someone with what you already have.",
  "Listen before preparing your reply. Ask how patience and truthful kindness could change one conversation today.",
  "Loss in a relationship deserves time and care. Bring your hurt to God and choose one supportive connection today.",
  "Notice a situation that makes a harmful choice easier. Ask for help and make one practical change to your environment.",
  "Trust can begin with a small step even when questions remain. Bring one honest question to God in prayer.",
  "Forgiveness does not require denying harm or removing safe boundaries. Ask for wisdom for a truthful next step.",
  "Choose a rhythm small enough to return to tomorrow. A missed day can become a beginning, without shame.",
  "Bring loneliness into prayer and consider one safe human connection. Invite a conversation or take part in a local community.",
  "You do not need to hurry grief. Remember someone or something you have lost, and make room for tears and companionship.",
  "Consider how being loved by God might shape the words you use about yourself. Name a strength with humility and gratitude.",
  "Make room for honest listening and mutual care. Unsafe relationships need practical help and protection, not silence.",
  "Notice how spending, saving and generosity reflect your priorities. This is a spiritual reflection, not financial advice.",
  "A short, honest prayer is enough to begin. Listen, ask, thank and make room for silence.",
  "Jesus invites attention to God in everyday life. Choose one small act of love and return to Scripture with a teachable heart.",
];
export function recommendedJourney(goals: string[]) {
  const map: Record<string, string> = {
    "Understand the Bible": "faith",
    "Grow closer to God": "growing-closer-to-god",
    Prayer: "prayer",
    Peace: "anxiety",
    "Purpose & direction": "purpose",
    Relationships: "relationships",
    Consistency: "discipline",
    "Healing through a difficult season": "grief",
  };
  return map[goals[0]] ?? "growing-closer-to-god";
}
export const devotionals = topics.map((topic, i) => ({
  id: topic.toLowerCase().replaceAll(" ", "-"),
  topic,
  title: `Walking with God through ${topic.toLowerCase()}`,
  description: applications[i],
  days: Array.from({ length: 5 }, (_, d) => ({
    title: [
      "Be present",
      "Receive care",
      "Take one step",
      "Make room",
      "Keep walking",
    ][d],
    scripture: daily[(i + d) % daily.length],
    teaching: `${daily[(i + d) % daily.length].reflection} ${applications[i]}`,
    question: `As you reflect on ${topic.toLowerCase()}, ${daily[(i + d) % daily.length].question.charAt(0).toLowerCase() + daily[(i + d) % daily.length].question.slice(1)}`,
    prayer: `Lord Jesus, meet me as I bring ${topic.toLowerCase()} to you. Help me receive your care and take one faithful step today. Amen.`,
  })),
}));
