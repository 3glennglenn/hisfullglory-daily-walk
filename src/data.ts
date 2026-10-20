import { dateNumber, type PlanSlug } from "./storage";
export interface DailyContent {
  reference: string;
  quote: string;
  reflection: string;
  question: string;
}
// Exact WEB text verified against https://ebible.org/engwebp/PSA023.htm
// and https://ebible.org/engwebp/PSA121.htm (public domain, updated WEB).
export const daily: DailyContent[] = [
  {
    reference: "Psalm 23:1",
    quote: "The LORD is my shepherd; I shall lack nothing.",
    reflection:
      "A shepherd knows the flock and stays close. Begin today by remembering that you do not walk alone. Bring your needs to God honestly, and notice the care already around you.",
    question: "Where have you noticed God’s care this week?",
  },
  {
    reference: "Psalm 23:2",
    quote:
      "He makes me lie down in green pastures. He leads me beside still waters.",
    reflection:
      "Rest can be an act of trust. A full schedule does not have to crowd out a quiet moment with God. Set aside a small pause, and let your attention return to his presence.",
    question: "What would making room for a quiet moment look like today?",
  },
  {
    reference: "Psalm 23:3",
    quote:
      "He restores my soul. He guides me in the paths of righteousness for his name’s sake.",
    reflection:
      "God’s guidance shapes ordinary choices. You can begin again today, asking for wisdom for one faithful next step. Growth often happens through small acts of obedience.",
    question: "What is one faithful next step you can take?",
  },
  {
    reference: "Psalm 23:4",
    quote:
      "Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me. Your rod and your staff, they comfort me.",
    reflection:
      "This psalm does not pretend that difficult valleys disappear. It points to God’s presence within them. Bring the hard parts of today into prayer, and stay connected to people who care for you.",
    question: "How can you remember God’s presence in a difficult moment?",
  },
  {
    reference: "Psalm 23:5",
    quote:
      "You prepare a table before me in the presence of my enemies. You anoint my head with oil. My cup runs over.",
    reflection:
      "The image of a prepared table invites gratitude. Even amid conflict, there can be gifts to receive and kindness to share. Look for one ordinary blessing today.",
    question: "What ordinary gift can you thank God for today?",
  },
  {
    reference: "Psalm 23:6",
    quote:
      "Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in the LORD’s house forever.",
    reflection:
      "The psalm ends with a hope that stretches beyond today. Let God’s loving kindness inform how you treat others. A patient word or generous action can make that hope visible.",
    question: "Who could receive a small act of kindness from you?",
  },
  {
    reference: "Psalm 121:1",
    quote: "I will lift up my eyes to the hills. Where does my help come from?",
    reflection:
      "A question can become the beginning of prayer. You do not need perfect words. Take a moment to name what you need and turn your attention toward God.",
    question: "What honest question would you like to bring to God?",
  },
  {
    reference: "Psalm 121:2",
    quote: "My help comes from the LORD, who made heaven and earth.",
    reflection:
      "The Creator is also the one the psalmist turns to for help. Remembering this can make room for humility. Ask for help in prayer, and welcome practical support from trusted people.",
    question:
      "Where do you need to ask for help rather than carry everything alone?",
  },
  {
    reference: "Psalm 121:3",
    quote:
      "He will not allow your foot to be moved. He who keeps you will not slumber.",
    reflection:
      "God’s attentiveness is not measured by our energy. Whether today feels steady or tiring, you can return to him. Choose a small practice you can sustain, without trying to prove yourself.",
    question: "What small practice helps you turn toward God?",
  },
  {
    reference: "Psalm 121:4",
    quote: "Behold, he who keeps Israel will neither slumber nor sleep.",
    reflection:
      "The psalm remembers God’s faithful care for his people. Let that memory encourage your own prayer. You can entrust what you cannot control to him while doing the good that is yours to do.",
    question: "What would you like to entrust to God today?",
  },
  {
    reference: "Psalm 121:5",
    quote:
      "The LORD is your keeper. The LORD is your shade on your right hand.",
    reflection:
      "Shade offers an image of nearness and shelter. Notice where you find space to be attentive to God. Let a brief pause become an invitation to gratitude and prayer.",
    question: "Where can you pause and be attentive to God today?",
  },
  {
    reference: "Psalm 121:6",
    quote: "The sun will not harm you by day, nor the moon by night.",
    reflection:
      "The psalm speaks of care through the whole day and night. Bring every part of your routine into your walk with God. Faithfulness can take shape in work, rest, and how you speak to others.",
    question: "How can your daily routine become a place of prayer?",
  },
  {
    reference: "Psalm 121:7",
    quote: "The LORD will keep you from all evil. He will keep your soul.",
    reflection:
      "This song invites trust in God’s keeping care. It is a prayerful promise, not a reason to ignore danger or refuse support. Ask for wisdom to choose what is good and seek help when you need it.",
    question: "What wise, caring choice can you make today?",
  },
  {
    reference: "Psalm 121:8",
    quote:
      "The LORD will keep your going out and your coming in, from this time forward, and forever more.",
    reflection:
      "A journey is made of departures and returns. God is present in the ordinary transitions too. As you begin the next part of your day, offer a simple prayer of trust.",
    question: "Which transition in your day could become a reminder to pray?",
  },
];
export const contentFor = (date: string) =>
  daily[((dateNumber(date) % daily.length) + daily.length) % daily.length];
export interface PlanDay {
  title: string;
  scripture: DailyContent;
  devotional: string;
  question: string;
  prayer: string;
  action: string;
}
export interface Plan {
  slug: PlanSlug;
  title: string;
  description: string;
  days: PlanDay[];
}
const day = (
  title: string,
  verse: number,
  devotional: string,
  question: string,
  prayer: string,
  action: string,
): PlanDay => ({
  title,
  scripture: daily[verse],
  devotional,
  question,
  prayer,
  action,
});
export const plans: Plan[] = [
  {
    slug: "closer-to-god",
    title: "Closer to God",
    description:
      "Five gentle steps toward a more attentive relationship with God.",
    days: [
      day(
        "Begin with belonging",
        0,
        "Closeness begins with receiving God’s care, not earning it. Read this verse slowly. Let the picture of the shepherd help you begin a conversation with God as you are.",
        "What makes it difficult to receive care?",
        "Lord, help me receive your care and walk with you today. Amen.",
        "Take two quiet minutes to speak honestly to God.",
      ),
      day(
        "Make room to listen",
        1,
        "A quiet moment does not need to be impressive. Put aside one distraction, read the words again, and ask what faithful attention could look like in your life.",
        "What distraction could you set aside briefly?",
        "God, teach me to listen with a willing heart. Amen.",
        "Put your phone aside for five minutes of Scripture and prayer.",
      ),
      day(
        "Choose one faithful step",
        2,
        "A relationship grows through shared life. Invite God into an ordinary decision. Ask for wisdom, consider what love requires, and take the next good step.",
        "Which decision would you like to bring into prayer?",
        "Lord, guide my choices toward what is good. Amen.",
        "Do one act of service without seeking recognition.",
      ),
      day(
        "Practice gratitude",
        4,
        "Gratitude trains our attention toward gifts we can easily overlook. Name something you received, someone who cared, and one opportunity to share kindness.",
        "Which blessing have you almost overlooked?",
        "Father, thank you for the gifts in this ordinary day. Amen.",
        "Write down three specific things you are thankful for.",
      ),
      day(
        "Carry kindness forward",
        5,
        "Your walk with God continues beyond this plan. Choose a small rhythm to carry forward. Let loving kindness shape your words and the way you show up for others.",
        "What rhythm will you continue tomorrow?",
        "Lord, let your kindness shape my daily life. Amen.",
        "Choose a time for a daily pause and encourage one person.",
      ),
    ],
  },
  {
    slug: "consistent-in-the-word",
    title: "Consistent in the Word",
    description: "Build a simple Scripture rhythm, one day at a time.",
    days: [
      day(
        "Start small",
        8,
        "Consistency grows from a practice you can return to. One short passage read with attention matters. Make today’s goal simple enough to repeat tomorrow.",
        "When could you make a little room for Scripture?",
        "God, give me a willing heart to return to your Word. Amen.",
        "Choose a daily time and place for five minutes of reading.",
      ),
      day(
        "Read with attention",
        6,
        "Read the question in this verse twice. Notice what you might rush past. Scripture invites both attention and honest conversation with God.",
        "Which word or phrase holds your attention?",
        "Lord, help me read slowly and listen carefully. Amen.",
        "Read today’s verse aloud twice and write one observation.",
      ),
      day(
        "Connect reading and prayer",
        7,
        "Turn what you read into prayer. You can thank God, ask a question, or name a need. Your response can be brief and sincere.",
        "How would you respond to this verse in your own words?",
        "Creator God, help me turn reading into conversation with you. Amen.",
        "Pray one sentence in response to the verse.",
      ),
      day(
        "Live what you read",
        2,
        "Reading becomes part of daily life when it shapes a choice. Ask what a loving and faithful response might be in one situation today.",
        "Where could this passage shape a practical choice?",
        "God, guide me from hearing into faithful action. Amen.",
        "Choose one concrete act of patience or generosity.",
      ),
      day(
        "Return with grace",
        13,
        "A day away is an invitation to return, not a verdict on your faith. Keep your rhythm simple. Plan how you will begin again when life interrupts it.",
        "What will help you return after a day away?",
        "Lord, help me return to your Word with humility and hope. Amen.",
        "Write a simple reading rhythm for the coming week.",
      ),
    ],
  },
  {
    slug: "peace-in-god",
    title: "Peace in God",
    description: "Create space for trust, honest prayer, and quiet attention.",
    days: [
      day(
        "Pause in God’s presence",
        1,
        "Begin with a small pause. Bring the day as it is into prayer. You do not have to resolve everything before spending time with God.",
        "What are you carrying into this moment?",
        "God, meet me in this moment and help me turn toward you. Amen.",
        "Set aside two minutes for a quiet prayer.",
      ),
      day(
        "Name what is hard",
        3,
        "The psalm makes room for a difficult valley. You can pray honestly about what is hard. God’s presence and the care of trusted people can be part of your daily walk.",
        "What would an honest prayer sound like today?",
        "Lord, walk with me through what is difficult. Amen.",
        "Name one concern in private prayer and contact someone trusted if you need support.",
      ),
      day(
        "Ask for help",
        7,
        "Trust does not mean carrying everything alone. Ask God for wisdom and consider what practical support would be useful. Receiving help can be an act of humility.",
        "Who could offer wise, practical support?",
        "God, help me recognize and receive good support. Amen.",
        "Ask a trusted person for help with one practical task.",
      ),
      day(
        "Release one burden",
        9,
        "Some things are yours to act on; others are beyond your control. Bring both into prayer. Choose one helpful action, and entrust what remains to God.",
        "What is yours to do, and what can you entrust to God?",
        "Father, give me wisdom for my part and trust for the rest. Amen.",
        "Write down one next step, then pray over what you cannot control.",
      ),
      day(
        "Carry trust into tomorrow",
        13,
        "A daily rhythm of prayer can accompany ordinary transitions. Choose one moment as a reminder of God’s presence. Keep seeking wisdom, community, and appropriate support as you walk forward.",
        "Which daily transition could remind you to pray?",
        "Lord, keep my attention turned toward you as I go and return. Amen.",
        "Choose a regular moment for a short prayer tomorrow.",
      ),
    ],
  },
];
