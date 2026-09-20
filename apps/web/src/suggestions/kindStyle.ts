import type { SuggestionKind } from "@module-atelier/contracts";

/**
 * 建议类型的视觉区分：
 * mechanical = 机械问题（琥珀/黄铜，扳手）
 * canon      = 设定冲突（血红，警示）
 * question   = 提问（墨蓝）
 * idea       = 灵感（森林绿/奥术紫，火花）
 * draft      = 草稿（奥术紫，羽毛笔）
 * 创意类建议绝不能画成「错误」。
 */
export const kindStyle: Record<
  SuggestionKind,
  { icon: string; label: string; text: string; border: string; bg: string }
> = {
  mechanical: {
    icon: "⚙",
    label: "机械",
    text: "text-brass",
    border: "border-brass/50",
    bg: "bg-brass/10"
  },
  canon: {
    icon: "⚠",
    label: "正典",
    text: "text-oxblood",
    border: "border-oxblood/50",
    bg: "bg-oxblood/10"
  },
  question: {
    icon: "❓",
    label: "提问",
    text: "text-azure",
    border: "border-azure/50",
    bg: "bg-azure/10"
  },
  idea: {
    icon: "✦",
    label: "灵感",
    text: "text-forest",
    border: "border-forest/50",
    bg: "bg-forest/10"
  },
  draft: {
    icon: "✎",
    label: "草稿",
    text: "text-arcane",
    border: "border-arcane/50",
    bg: "bg-arcane/10"
  }
};

export const statusLabel: Record<string, string> = {
  pending: "待处理",
  accepted: "已接受",
  rejected: "已拒绝",
  later: "稍后",
  stale: "已过期",
  failed: "失败"
};
