// dsh-peakshift — DeepSeek Harness 错峰插件（Host 半）
//
// 设计原则：不接入任何新供应商 —— 完全复用 DSH 原生的多供应商能力
// （llm-pi-ai：在「设置 → 模型」里添加供应商、填 API Key，端点/模型目录自动）。
// 本插件只做一件事：监听 agent/request，把「手动切换供应商」变成「按峰谷自动切换」。
//
// 峰谷规则（DeepSeek 官方，2026-08-17 起生效）：
// 高峰为北京时间每天 09:00–12:00、14:00–18:00，其余为低谷（高峰价约为低谷 2 倍）。
// 官方口径为「每日固定时段」，无周末/节假日例外。
//
// 安全约定：默认关闭（enabled:false）；备用供应商/模型不可用或任何配置异常
// 都回落不改写，绝不影响正常对话。

import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

export const name = "dsh-peakshift";
export const inject = ["llm"];

const ROUTER_NS = settingsNamespace("price-router");
const PRIMARY_PROVIDER = "deepseek-official";

const DEFAULT_PEAK_WINDOWS = [
  { start: "09:00", end: "12:00" },
  { start: "14:00", end: "18:00" },
];

/** 错峰路由配置。 */
const RouterSchema = z.object({
  /** 「错峰」总开关。 */
  enabled: z.boolean().default(false),
  /** 主供应商（低谷时段使用；通常就是默认 DeepSeek）。 */
  primaryProvider: z.string().default("deepseek-official"),
  /** 备用供应商与模型（高峰时段使用；供应商在「设置 → 模型」中先接入）。 */
  fallbackProvider: z.string().default(""),
  /** 留空 = 自动使用该供应商的第一个模型。 */
  fallbackModel: z.string().default(""),
  /** 高峰时段窗口（北京时间 HH:mm）。 */
  peakWindows: z.array(z.object({
    start: z.string().default("09:00"),
    end: z.string().default("12:00"),
  })).default(DEFAULT_PEAK_WINDOWS),
  /** 峰谷交界前提醒开关。 */
  remindEnabled: z.boolean().default(true),
  /** 提前多少分钟提醒（默认 5）。 */
  remindMinutes: z.number().step(1).min(1).default(5),
  /**
   * 贵模型列表：高峰时段只有这些模型才切换到备用供应商。
   * 其余模型（如 deepseek-v4-flash 本身便宜）即使高峰也不切，避免负优化。
   * 列表为空 = 永不切换。
   */
  expensiveModels: z.array(z.string()).default(["deepseek-v4-pro"]),
  /** 主供应商当前可用的模型，供贵模型下拉选择（host 实时填充）。 */
  primaryModelOptions: z.array(z.object({
    id: z.string(),
    name: z.string().default(""),
  })).default([]),
  /** 备用供应商当前可用的模型，供备用模型下拉选择（host 实时填充）。 */
  fallbackModelOptions: z.array(z.object({
    id: z.string(),
    name: z.string().default(""),
  })).default([]),
});

/** "08:30" -> 510；非法输入返回 NaN（调用方视为未配置，不做判断）。 */
function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** 当前时刻换算为北京时间（Asia/Shanghai）的「当天分钟数」。 */
function beijingMinutes(now) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const mi = Number(parts.find((p) => p.type === "minute")?.value);
    return h * 60 + mi;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

/** 当前是否处于高峰计价时段（官方口径：每天固定时段，无周末/节假日例外）。 */
export function isPeakNow(cfg, now = new Date()) {
  if (!cfg) return false;
  const m = beijingMinutes(now);
  const windows = Array.isArray(cfg.peakWindows) && cfg.peakWindows.length > 0
    ? cfg.peakWindows
    : DEFAULT_PEAK_WINDOWS;
  for (const w of windows) {
    const s = toMinutes(w?.start);
    const e = toMinutes(w?.end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    if (s < e ? m >= s && m < e : m >= s || m < e) return true;
  }
  return false;
}

/** 把请求改写到目标供应商/模型；推理档位交给目标接口的默认值。 */
function redirect(resolved, provider, model) {
  const next = { ...resolved, provider, model };
  delete next.reasoningEffort;
  return next;
}

export function apply(ctx) {
  let routerSource = () => ({});
  let directoryHandle = null;
  let lastDirectoryLabel = "";

  /** 备用供应商：设置里明确填了用之；否则自动选第一个已接入的非主供应商。 */
  const resolveFallbackProvider = (cfg) => {
    const explicit = cfg.fallbackProvider || "";
    if (explicit) return explicit;
    try {
      const ids = ctx.llm.listProviders().map((p) => p.id);
      return ids.find((id) => id !== (cfg.primaryProvider || PRIMARY_PROVIDER)) ?? "";
    } catch {
      return "";
    }
  };

  const disposeRouter = ctx.on("agent/request", async (_payload, next) => {
    try {
      const cfg = routerSource() ?? {};
      const resolved = await next();
      if (!resolved || typeof resolved.provider !== "string") return resolved;
      const peak = isPeakNow(cfg);
      const primaryProvider = cfg.primaryProvider || PRIMARY_PROVIDER;
      const fallbackProvider = resolveFallbackProvider(cfg);

      /**
       * 备用模型解析：preferred 填了且在供应商目录中 → 用之；
       * preferred 为空 → 取该供应商第一个模型；两者皆无 → 空串（不切换）。
       */
      const pickFallbackModel = (provider, preferred) => {
        try {
          const models = ctx.llm.listModels(provider) ?? [];
          if (preferred && models.some((m) => m.id === preferred)) return preferred;
          if (!preferred) return models[0]?.id ?? "";
          return "";
        } catch {
          return "";
        }
      };

      // 勾选「错峰」且当前为高峰、当前在主供应商、且当前模型在贵模型列表里时，
      // 才改写到备用。低谷时段不改写，请求自然回到 DeepSeek。
      const expensiveModels = Array.isArray(cfg.expensiveModels) ? cfg.expensiveModels : [];
      if (
        cfg.enabled === true
        && peak
        && fallbackProvider
        && resolved.provider === primaryProvider
        && expensiveModels.includes(resolved.model)
      ) {
        const model = pickFallbackModel(fallbackProvider, cfg.fallbackModel || "");
        if (!model) return resolved;
        return redirect(resolved, fallbackProvider, model);
      }
      return resolved;
    } catch {
      return next();
    }
  });

  /**
   * 刷新模型页卡片标题：实时显示开关与备用供应商状态。
   * 标题不变时跳过 replace，避免 llm/adapters-updated 自激循环。
   */
  const updateDirectoryLabel = () => {
    if (!directoryHandle) return;
    try {
      const cfg = routerSource() ?? {};
      const fb = resolveFallbackProvider(cfg);
      const label = cfg.enabled === true
        ? `错峰：开 · 备用 ${fb || "未接入"}`
        : "错峰：关";
      if (label === lastDirectoryLabel) return;
      lastDirectoryLabel = label;
      directoryHandle.replace([{
        provider: "price-router",
        displayName: label,
        settingsNs: String(ROUTER_NS),
        settingsPath: [],
      }]);
    } catch {
      // 标签刷新失败不影响路由功能
    }
  };

  // 设置区段（实时读取，改动无需重启）
  installSettingsSection(ctx, ROUTER_NS, RouterSchema, {}, {
    setSource: (source) => { routerSource = source; },
    onChange: () => { refreshAll(); },
  });

  /**
   * 把主/备用供应商「当前实际可用」的模型列表（llm.listModels，即已绑定密钥
   * 后可选择的模型）写入设置分节，供浏览器下拉选择。发现模型列表变化才写，
   * 避免 settings/updated 自激循环。单个供应商查询失败不拖垮另一个。
   */
  let lastModelOptionsKey = "";
  const refreshModelOptions = async () => {
    const settings = ctx.get("settings");
    if (!settings) return;
    try {
      const cfg = routerSource() ?? {};
      const primaryProvider = cfg.primaryProvider || PRIMARY_PROVIDER;
      const fb = resolveFallbackProvider(cfg);
      const toOptions = (models) => (models ?? []).map((m) => ({ id: m.id, name: m.name || m.id }));
      let primaryModels = [];
      let fallbackModels = [];
      try {
        primaryModels = await ctx.llm.listModels(primaryProvider);
      } catch {
        // 主供应商目录不可用 → 空列表
      }
      if (fb) {
        try {
          fallbackModels = await ctx.llm.listModels(fb);
        } catch {
          // 备用供应商目录不可用 → 空列表
        }
      }
      const key = JSON.stringify([primaryProvider, fb, primaryModels.map((m) => m.id), fallbackModels.map((m) => m.id)]);
      if (key === lastModelOptionsKey) return;
      lastModelOptionsKey = key;
      await settings.update(String(ROUTER_NS), {
        primaryModelOptions: toOptions(primaryModels),
        fallbackModelOptions: toOptions(fallbackModels),
      });
    } catch {
      // 模型列表刷新失败不影响路由功能
    }
  };

  const refreshAll = () => {
    updateDirectoryLabel();
    refreshModelOptions();
  };

  // 把 price-router 设置分节声明为可配置供应商目录条目。
  // 官方 wire 只把「供应商目录条目的 settingsNs + 两个硬编码白名单」暴露给
  // Web 配置界面（dsh-host-apiproxy 的 exposedNamespaces），目录声明是第三方
  // 插件让自有设置分节对浏览器可读写的唯一通道。本条目不注册适配器，因此
  // 不会出现在模型选择器；模型页会显示一张状态卡片（标题实时反映开关状态）。
  try {
    directoryHandle = ctx.llm.registerConfigurableProviders([{
      provider: "price-router",
      displayName: "错峰：关",
      settingsNs: String(ROUTER_NS),
      settingsPath: [],
    }]);
  } catch (error) {
    ctx.logger?.warn?.("[dsh-peakshift] 声明设置暴露目录条目失败:", error?.message ?? error);
  }

  // 供应商接入/移除时刷新卡片标题与模型列表
  const disposeAdaptersEvent = ctx.on("llm/adapters-updated", () => {
    refreshAll();
  });

  // 初始刷新一次
  refreshAll();

  return () => {
    disposeAdaptersEvent?.();
    directoryHandle?.();
    disposeRouter?.();
  };
}
