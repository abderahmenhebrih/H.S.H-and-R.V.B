// Shared chat reaction configuration (single source of truth — do not
// duplicate these literals across components).
//
// Picker choice: NO third-party emoji picker is installed and none is added:
// the full picker below is a lightweight modal grid over this curated static
// dataset (pure JS, no native modules), so the dev client needs no rebuild.

export const QUICK_SEND_EMOJI = "🤝";

export const QUICK_REACTIONS: string[] = ["❤️", "😂", "😮", "😢", "😡", "👍"];

export type ReactionCategory = { id: string; label: string; emojis: string[] };

export const REACTION_CATEGORIES: ReactionCategory[] = [
  {
    id: "frequent",
    label: "Frequently used",
    emojis: ["❤️", "😂", "😮", "😢", "😡", "👍", "🤝", "🔥", "🎉", "👏", "🙏", "😍"],
  },
  {
    id: "smileys",
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😙", "😚",
      "😋", "😛", "😝", "🤪", "🤨", "🧐", "🤓", "😎", "🥳", "😏",
      "😒", "😞", "😔", "😟", "😕", "🙁", "😣", "😖", "😫", "😩",
      "🥺", "😢", "😭", "😤", "😡", "🤬", "😳", "🥵",
    ],
  },
  {
    id: "gestures",
    label: "Gestures",
    emojis: [
      "👍", "👎", "👌", "🤞", "✋", "👋", "🤙", "💪",
      "🙏", "👏", "🙌", "🫶", "✊", "👊", "🤛", "🤜",
      "👐", "🤲", "🤝", "✌️", "🤟", "👋",
    ],
  },
  {
    id: "hearts",
    label: "Hearts",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
      "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘",
    ],
  },
  {
    id: "symbols",
    label: "Symbols & Objects",
    emojis: [
      "🔥", "⭐", "🌟", "✨", "💯", "🎉", "🎊", "🎈",
      "🎁", "🏆", "👑", "💡", "📌", "✅", "❌", "❓",
      "❗", "💤", "🎵", "🎶", "☕", "👀", "💎", "🚀",
    ],
  },
];

export type ReactionGroup = { emoji: string; count: number; mine: boolean };

// Groups raw reaction entries by emoji (count desc), flagging the viewer's
// own active emoji. Legacy 🤝 entries group exactly like any other emoji.
export function groupReactionCounts(reactions: any[] | undefined, myId?: string): ReactionGroup[] {
  if (!Array.isArray(reactions) || reactions.length === 0) return [];
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const emoji = typeof r?.emoji === "string" ? r.emoji : "";
    if (!emoji) continue;
    const prev = map.get(emoji) || { count: 0, mine: false };
    prev.count += 1;
    if (myId && r?.accountId === myId) prev.mine = true;
    map.set(emoji, prev);
  }
  return [...map.entries()]
    .map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }))
    .sort((a, b) => b.count - a.count || (a.mine ? -1 : 0));
}

// Standalone quick-send messages (content exactly 🤝, no attachments) render
// large without a bubble, Messenger Like-style — still normal messages
// semantically (ordering, receipts, reply, delete all apply).
export function isQuickEmojiMessage(item: any): boolean {
  if (!item || item.isDeleted || item.deletedAt) return false;
  if (typeof item.content !== "string" || item.content.trim() !== QUICK_SEND_EMOJI) return false;
  const atts = Array.isArray(item.attachments) ? item.attachments : [];
  return atts.length === 0;
}
