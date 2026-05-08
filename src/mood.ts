/**
 * Memoria 情感色彩模块 (v2.0.3)
 * 基于关键词词典，7 种维度
 */
import { MoodType } from "./types";

type MoodDict = Record<MoodType, string[]>;

const moodDict: MoodDict = {
  happy: [
    "开心", "高兴", "快乐", "欣喜", "兴奋", "爽", "哈哈", "嘻嘻",
    "满足", "幸福", "惊喜", "棒", "太棒", "赞", "好玩", "有意思",
    "乐", "嘿嘿", "哇", "太好了", "真好",
    "nice", "yyds", "happy", "joy", "awesome", "great", "love",
    "amazing", "wonderful", "excited", "yay", "lol", "haha",
  ],
  touched: [
    "感动", "温暖", "暖心", "泪目", "心动", "治愈", "温馨", "感慨",
    "怀念", "想念", "思念", "难忘", "感激", "感谢", "不舍", "眷恋",
    "touched", "moved", "warm", "heartwarming", "nostalgic", "miss", "grateful",
  ],
  inspired: [
    "加油", "冲", "冲冲冲", "奥利给", "燃起来了", "打鸡血", "动力",
    "坚持", "努力", "不放弃", "突破", "自信", "勇敢", "鼓励", "鼓舞",
    "勇气", "相信自己", "你可以的", "我可以", "拼了", "干了", "撑住",
    "振作", "振奋", "昂扬", "斗志", "力量", "希望", "前进", "向前",
    "成长", "突破自我", "挑战", "出发", "启程", "搞起",
    "go", "inspired", "motivated", "encourage", "encouraged", "brave",
    "courage", "go for it", "you got this", "keep going", "never give up",
    "let's go", "hustle", "grit", "hope",
  ],
  sad: [
    "难过", "伤心", "失落", "低落", "沮丧", "抑郁", "孤独", "寂寞",
    "心碎", "遗憾", "可惜", "后悔", "哭了", "哭泣", "流泪", "泪水", "眼泪",
    "emo", "丧", "悲伤", "悲痛", "哀伤", "心酸", "痛苦", "难受",
    "委屈", "失望", "绝望", "心疼",
    "sad", "lonely", "depressed", "down", "heartbroken", "regret",
    "cry", "crying", "tears", "grief", "sorrow", "miserable",
  ],
  angry: [
    "烦", "烦躁", "愤怒", "生气", "恼火", "无语", "崩溃", "讨厌",
    "郁闷", "抓狂", "气死", "气人", "草", "靠", "卧槽", "气炸",
    "angry", "annoyed", "frustrated", "hate", "ugh", "wtf", "damn", "mad",
  ],
  fear: [
    "害怕", "恐惧", "恐怖", "吓人", "吓死", "吓到", "惊吓", "惊恐",
    "不安", "担忧", "担心", "忐忑", "焦虑", "紧张", "惊慌", "心慌",
    "毛骨悚然", "胆怯", "胆战心惊", "恐慌", "慌乱", "惶惶",
    "afraid", "scared", "fear", "terrifying", "horror",
    "anxious", "worried", "nervous", "panic", "frightened",
  ],
  tired: [
    "累", "好累", "太累", "疲惫", "疲倦", "精疲力尽", "筋疲力尽",
    "困", "困了", "想睡", "没劲", "无力", "倦怠", "困倦", "犯困",
    "乏力", "憔悴", "困得不行",
    "tired", "exhausted", "sleepy", "drained", "worn out", "burnout", "burnt out",
  ],
  neutral: [],
};

// 预编译正则
const moodRes: Record<MoodType, RegExp> = {} as any;
function getMoodRe(type: MoodType): RegExp {
  if (!moodRes[type]) {
    const words = moodDict[type];
    const escaped = words.map(w =>
      /^[\x00-\x7F]+$/.test(w) ? `\\b${escapeRegex(w)}\\b` : escapeRegex(w)
    );
    moodRes[type] = new RegExp(escaped.join("|"), "gi");
  }
  return moodRes[type];
}

/** 分析一段文本的情感倾向 */
export function detectMood(content: string): MoodType {
  if (!content) return "neutral";
  const scores: Record<string, number> = {
    happy: 0, touched: 0, inspired: 0, sad: 0, angry: 0, fear: 0, tired: 0,
  };
  for (const type of Object.keys(scores) as MoodType[]) {
    if (type === "neutral") continue;
    const re = getMoodRe(type);
    re.lastIndex = 0;
    const matched = content.match(re);
    if (matched) scores[type] = matched.length;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, second] = sorted;
  if (top[1] === 0 || top[1] === second[1]) return "neutral";
  return top[0] as MoodType;
}

/** 获取情感色条 CSS class */
export function moodClass(mood: MoodType): string {
  return `memoria-mood-${mood}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
