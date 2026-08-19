// dsh-peakshift — DeepSeek Harness 错峰插件（Client 半）
// 浏览器 bundle：通用设置页「错峰」开关 + 峰谷交界前提醒弹窗。
// 与 Host 半（lib/index.js）共享同一套计价算法（逻辑保持一致）。
// 供应商本身在「设置 → 模型」页面用 DSH 原生功能接入；本开关只负责选择与状态。
window.__ModuleLoader__.load({
	id: "dsh-peakshift",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const { Modal, Button } = require("@deepseek-ai/dsh-client-ui-primitives");

		const NS = "dsh-peakshift";

		/* ---------- 词典 ---------- */
		const zh = {
			"nav": "错峰",
			"title": "错峰",
			"desc": "高峰时段（每天 9:00–12:00、14:00–18:00 北京时间）自动切换到便宜的备用供应商，低谷用回 DeepSeek。",
			"statusPeak": "当前：高峰（切到备用）",
			"statusOff": "当前：低谷（用 DeepSeek）",
			"statusNext": "下次切换",
			"statusNone": "48 小时内无切换",
			"fallbackProviderLabel": "备用供应商",
			"fallbackProviderAuto": "自动（第一个已接入的）",
			"fallbackModelLabel": "备用模型",
			"fallbackModelAuto": "跟随供应商默认",
			"fallbackEmpty": "还没接入供应商，先去「设置 → 模型」添加",
			"expensiveTitle": "贵模型（高峰才切走的）",
			"expensiveHint": "只有这些模型在高峰会切到备用；便宜的不用加。",
			"expensiveEmpty": "列表为空：任何模型都不切换",
			"expensiveSelectPlaceholder": "选模型…",
			"expensiveAdd": "添加",
			"remindTitle": "交界前提醒",
			"remindMinutes": "提前",
			"remindMinutesUnit": "分钟",
			"popupTitlePeak": "高峰即将开始",
			"popupTitleOff": "低谷即将开始",
			"popupDescPeak": "{time} 起进入高峰，将自动切换到备用供应商。",
			"popupDescOff": "{time} 起进入低谷，将自动切回 DeepSeek。",
			"popupClose": "知道了",
		};
		const en = {
			"nav": "Peak shift",
			"title": "Peak shift",
			"desc": "During peak hours (09:00–12:00 and 14:00–18:00 Beijing time daily) requests switch to the cheaper backup provider; off-peak hours use DeepSeek.",
			"statusPeak": "Now: peak (switching to backup)",
			"statusOff": "Now: off-peak (using DeepSeek)",
			"statusNext": "Next switch",
			"statusNone": "No switch within 48 h",
			"fallbackProviderLabel": "Backup provider",
			"fallbackProviderAuto": "Auto (first connected)",
			"fallbackModelLabel": "Backup model",
			"fallbackModelAuto": "Provider default",
			"fallbackEmpty": "No provider connected yet — add one in Settings → Models",
			"expensiveTitle": "Expensive models (shifted away at peak)",
			"expensiveHint": "Only these models switch at peak; cheap ones don't need to be here.",
			"expensiveEmpty": "List empty: nothing switches",
			"expensiveSelectPlaceholder": "Pick a model…",
			"expensiveAdd": "Add",
			"remindTitle": "Remind before a switch",
			"remindMinutes": "Remind",
			"remindMinutesUnit": "min before",
			"popupTitlePeak": "Peak hours start soon",
			"popupTitleOff": "Off-peak hours start soon",
			"popupDescPeak": "Peak hours start at {time}; switching to the backup provider automatically.",
			"popupDescOff": "Off-peak hours start at {time}; switching back to DeepSeek automatically.",
			"popupClose": "Got it",
		};

		/* ---------- 样式 ---------- */
		const CSS = [
			".dpr{display:flex;flex-direction:column;gap:12px;max-width:720px;color:var(--dsw-alias-label-primary)}",
			".dpr-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}",
			".dpr-head{display:flex;align-items:center;justify-content:space-between;gap:8px}",
			".dpr-title{margin:0;font-size:14px;font-weight:500;line-height:22px}",
			".dpr-desc{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}",
			".dpr-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
			".dpr-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
			".dpr-status{font-size:13px;line-height:20px}",
			".dpr-status.peak{color:var(--dsw-alias-state-warn-label)}",
			".dpr-status.off{color:var(--dsw-alias-state-success-primary)}",
			".dpr-field{display:flex;flex-direction:column;gap:4px;min-width:200px;flex:1}",
			".dpr-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
			".dpr-input{box-sizing:border-box;height:32px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 10px;font:inherit;font-size:13px;width:100%}",
			".dpr-select{box-sizing:border-box;height:32px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 8px;font:inherit;font-size:13px;max-width:100%}",
			".dpr-check{display:flex;align-items:center;gap:6px;font-size:13px;line-height:20px;cursor:pointer}",
			".dpr-check input{accent-color:var(--dsw-alias-state-business-primary)}",
			".dpr-divider{height:1px;background:var(--dsw-alias-border-l2);margin:2px 0}",
			".dpr-general{display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}",
			".dpr-general-col{display:flex;flex-direction:column;gap:6px;width:100%;color:var(--dsw-alias-label-primary)}",
			".dpr-general-label{font-weight:500}",
			".dpr-select-sm{width:auto;min-width:180px;height:28px}",
			".dpr-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:2px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}",
			".dpr-chip-del{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:14px;line-height:1;padding:0}",
			".dpr-chip-del:hover{color:var(--dsw-alias-state-error-primary)}",
		].join("");

		/* ---------- 与 Host 一致的计价算法 ---------- */
		const DEFAULT_PEAK_WINDOWS = [
			{ start: "09:00", end: "12:00" },
			{ start: "14:00", end: "18:00" },
		];
		const CLIENT_DEFAULTS = {
			enabled: false,
			primaryProvider: "deepseek-official",
			primaryModel: "deepseek-v4-pro",
			fallbackProvider: "",
			fallbackModel: "",
			peakWindows: DEFAULT_PEAK_WINDOWS,
			remindEnabled: true,
			remindMinutes: 5,
			expensiveModels: ["deepseek-v4-pro"],
			primaryModelOptions: [],
			fallbackModelOptions: [],
		};

		const BJ_TZ = "Asia/Shanghai";
		const BJ_MIN_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: BJ_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
		const BJ_DATE_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: BJ_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

		function toMinutes(hhmm) {
			const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
			return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
		}
		function beijingMinutes(now) {
			try {
				const parts = BJ_MIN_FMT.formatToParts(now);
				const h = Number(parts.find((p) => p.type === "hour")?.value);
				const mi = Number(parts.find((p) => p.type === "minute")?.value);
				return h * 60 + mi;
			} catch {
				return now.getHours() * 60 + now.getMinutes();
			}
		}
		function isPeakNow(cfg, now) {
			if (!cfg) return false;
			const m = beijingMinutes(now);
			const windows = Array.isArray(cfg.peakWindows) && cfg.peakWindows.length > 0 ? cfg.peakWindows : DEFAULT_PEAK_WINDOWS;
			for (const w of windows) {
				const s = toMinutes(w?.start);
				const e = toMinutes(w?.end);
				if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
				if (s < e ? m >= s && m < e : m >= s || m < e) return true;
			}
			return false;
		}
		/** 下一个峰/谷切换点：{ at: Date, kind: "peak" | "offpeak" }；72 小时内无切换返回 null。
		 *  边界只可能出现在窗口起止点或北京午夜（周末/节假日翻转），故只检查候选点。 */
		function nextBoundary(cfg, now) {
			const current = isPeakNow(cfg, now);
			const windows = Array.isArray(cfg.peakWindows) && cfg.peakWindows.length > 0 ? cfg.peakWindows : DEFAULT_PEAK_WINDOWS;
			let day0;
			try {
				const d = BJ_DATE_FMT.format(now).split("-").map(Number);
				day0 = new Date(Date.UTC(d[0], d[1] - 1, d[2], 0, 0, 0) - 8 * 3600e3);
			} catch {
				day0 = new Date(now);
				day0.setHours(0, 0, 0, 0);
			}
			const cand = [];
			for (let d = 0; d <= 2; d++) {
				const day = day0.getTime() + d * 86400e3;
				cand.push(day);
				for (const w of windows) {
					const s = toMinutes(w && w.start);
					const e = toMinutes(w && w.end);
					if (Number.isFinite(s)) cand.push(day + s * 60000);
					if (Number.isFinite(e)) cand.push(day + e * 60000);
				}
			}
			cand.sort((a, b) => a - b);
			for (const t of cand) {
				if (t <= now.getTime()) continue;
				const at = new Date(t);
				if (isPeakNow(cfg, at) !== current) {
					return { at, kind: isPeakNow(cfg, at) ? "peak" : "offpeak" };
				}
			}
			return null;
		}
		/** 把 Date 格式化为北京时间的 "HH:mm"。 */
		function formatTime(at) {
			try {
				const parts = BJ_MIN_FMT.formatToParts(at);
				return `${parts.find((p) => p.type === "hour")?.value}:${parts.find((p) => p.type === "minute")?.value}`;
			} catch {
				return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
			}
		}

		/* ---------- 小组件 ---------- */
		/** scope 缺失时的恒定占位（保持 hooks 数量一致）。 */
		const EMPTY_SUBSCRIBE = () => () => {};
		const EMPTY_SNAPSHOT = () => null;

		/** 渲染错误边界：崩溃时显示原因而不是空白。 */
		class DprErrorBoundary extends React.Component {
			constructor(props) {
				super(props);
				this.state = { error: null };
			}
			static getDerivedStateFromError(error) {
				return { error };
			}
			render() {
				if (this.state.error) {
					const err = this.state.error;
					const msg = String(err && err.message || err);
					const stack = err && err.stack ? String(err.stack).split("\n").slice(0, 6).join(" · ") : "";
					return React.createElement("div", { className: "dpr" },
						React.createElement("section", { className: "dpr-card" },
							React.createElement("p", { className: "dpr-hint" }, `渲染错误：${msg}`),
							stack ? React.createElement("p", { className: "dpr-hint" }, `堆栈：${stack}`) : null,
						),
					);
				}
				return this.props.children;
			}
		}

		/* ---------- 独立「错峰」设置页 ---------- */
		function PriceRouterSection(props) {
			const { ctx, t, scope, connApi, scopeError } = props;
			const snap = React.useSyncExternalStore(
				scope ? scope.subscribe.bind(scope) : EMPTY_SUBSCRIBE,
				scope ? scope.getSnapshot.bind(scope) : EMPTY_SNAPSHOT,
			);
			const [tick, setTick] = React.useState(0);
			const [providers, setProviders] = React.useState(null);
			const [expensivePick, setExpensivePick] = React.useState("");
			React.useEffect(() => {
				const h = window.setInterval(() => setTick((v) => v + 1), 30000);
				return () => window.clearInterval(h);
			}, []);

			// 供应商目录（与「设置 → 模型」同一数据源）
			React.useEffect(() => {
				let alive = true;
				const load = () => {
					if (!connApi || !connApi.llm || !connApi.llm.providers) return;
					connApi.llm.providers({}).then((res) => {
						if (!alive) return;
						if (res && res.result && res.result.ok) setProviders(res.result.value.providers ?? []);
					}).catch(() => {});
				};
				load();
				const off = ctx.remote && ctx.remote.$on ? ctx.remote.$on("llm/adapters-updated", load) : null;
				return () => {
					alive = false;
					if (off) off();
				};
			}, [ctx, connApi]);

			// 提前解析（hooks 之后才能条件 return）
			const cfg = snap && snap.status === "ready" && snap.value ? snap.value : CLIENT_DEFAULTS;
			const list = Array.isArray(providers) ? providers : [];
			const primaryProvider = cfg.primaryProvider || "deepseek-official";
			const fallbackProvider = cfg.fallbackProvider || "";

			if (scopeError || !scope) {
				return React.createElement("div", { className: "dpr" },
					React.createElement("section", { className: "dpr-card" },
						React.createElement("p", { className: "dpr-hint" }, `错峰：${scopeError || "设置服务不可用"}`),
					),
				);
			}

			const writable = snap ? snap.writable !== false : false;
			void tick;

			const now = new Date();
			const peak = isPeakNow(cfg, now);
			const boundary = nextBoundary(cfg, now);
			// 备用供应商只列「已接入」（active）的，未填 Key 的不出现
			const options = list.filter((p) => p.provider !== primaryProvider && p.active !== false);
			// 已绑定密钥「实际可用」的模型（host 用 llm.listModels 实时填充）
			const primaryModelOptions = Array.isArray(cfg.primaryModelOptions) ? cfg.primaryModelOptions : [];
			const fallbackModelOptions = Array.isArray(cfg.fallbackModelOptions) ? cfg.fallbackModelOptions : [];
			const expensiveModels = Array.isArray(cfg.expensiveModels) ? cfg.expensiveModels : [];

			const addExpensive = () => {
				const v = expensivePick;
				if (!v || expensiveModels.includes(v)) return;
				scope.set("expensiveModels", [...expensiveModels, v]);
				setExpensivePick("");
			};
			const removeExpensive = (id) => {
				scope.set("expensiveModels", expensiveModels.filter((x) => x !== id));
			};

			return React.createElement("div", { className: "dpr" },
				// ── 错峰总开关 ──
				React.createElement("section", { className: "dpr-card" },
					React.createElement("div", { className: "dpr-head" },
						React.createElement("h3", { className: "dpr-title" }, t("title")),
						React.createElement("label", { className: "dpr-check" },
							React.createElement("input", {
								type: "checkbox",
								checked: cfg.enabled === true,
								disabled: !writable,
								onChange: (e) => scope.set("enabled", e.target.checked),
							}),
							t("title"),
						),
					),
					React.createElement("p", { className: "dpr-desc" }, t("desc")),
					React.createElement("p", { className: "dpr-status " + (peak ? "peak" : "off") },
						peak ? t("statusPeak") : t("statusOff"),
						boundary ? ` · ${t("statusNext")} ${formatTime(boundary.at)}` : ` · ${t("statusNone")}`,
					),
				),
				// ── 备用供应商 + 模型 ──
				React.createElement("section", { className: "dpr-card" },
					React.createElement("h4", { className: "dpr-title" }, t("fallbackProviderLabel")),
					React.createElement("div", { className: "dpr-row" },
						React.createElement("div", { className: "dpr-field" },
							React.createElement("span", { className: "dpr-label" }, t("fallbackProviderLabel")),
							React.createElement("select", {
								className: "dpr-select",
								value: fallbackProvider,
								disabled: !writable,
								onChange: (e) => scope.set("fallbackProvider", e.target.value),
							},
								React.createElement("option", { value: "" }, t("fallbackProviderAuto")),
								options.map((p) => React.createElement("option", { key: p.provider, value: p.provider },
									`${p.displayName || p.provider} (${p.provider})${p.active === false ? " ⚠" : ""}`)),
							),
						),
						React.createElement("div", { className: "dpr-field" },
							React.createElement("span", { className: "dpr-label" }, t("fallbackModelLabel")),
							React.createElement("select", {
								className: "dpr-select",
								value: cfg.fallbackModel || "",
								disabled: !writable,
								onChange: (e) => scope.set("fallbackModel", e.target.value),
							},
								React.createElement("option", { value: "" }, t("fallbackModelAuto")),
								fallbackModelOptions.map((m) => React.createElement("option", { key: m.id, value: m.id },
									m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id)),
							),
						),
					),
					fallbackModelOptions.length === 0 && !fallbackProvider
						? React.createElement("p", { className: "dpr-hint" }, t("fallbackEmpty"))
						: null,
				),
				// ── 贵模型列表 ──
				React.createElement("section", { className: "dpr-card" },
					React.createElement("h4", { className: "dpr-title" }, t("expensiveTitle")),
					React.createElement("p", { className: "dpr-hint" }, t("expensiveHint")),
					expensiveModels.length === 0
						? React.createElement("p", { className: "dpr-hint" }, t("expensiveEmpty"))
						: React.createElement("div", { className: "dpr-row" },
							expensiveModels.map((id) => React.createElement("span", { key: id, className: "dpr-chip" },
								id,
								React.createElement("button", {
									className: "dpr-chip-del",
									type: "button",
									disabled: !writable,
									"aria-label": "删除",
									onClick: () => removeExpensive(id),
								}, "×"),
							)),
						),
					React.createElement("div", { className: "dpr-row" },
						React.createElement("select", {
							className: "dpr-select",
							value: expensivePick,
							disabled: !writable,
							onChange: (e) => setExpensivePick(e.target.value),
						},
							React.createElement("option", { value: "" }, t("expensiveSelectPlaceholder")),
							primaryModelOptions.map((m) => React.createElement("option", { key: m.id, value: m.id },
								m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id)),
						),
						React.createElement(Button, {
							variant: "outline",
							size: "sm",
							disabled: !writable || !expensivePick,
							onClick: addExpensive,
						}, t("expensiveAdd")),
					),
				),
				// ── 交界前提醒 ──
				React.createElement("section", { className: "dpr-card" },
					React.createElement("div", { className: "dpr-row" },
						React.createElement("label", { className: "dpr-check" },
							React.createElement("input", {
								type: "checkbox",
								checked: cfg.remindEnabled !== false,
								disabled: !writable,
								onChange: (e) => scope.set("remindEnabled", e.target.checked),
							}),
							t("remindTitle"),
						),
						React.createElement("span", { className: "dpr-label" }, t("remindMinutes")),
						React.createElement("input", {
							className: "dpr-input",
							type: "number",
							min: 1,
							max: 60,
							style: { width: 64, height: 28 },
							value: cfg.remindMinutes ?? 5,
							disabled: !writable || cfg.remindEnabled === false,
							onChange: (e) => {
								const n = Number(e.target.value);
								if (Number.isFinite(n) && n >= 1) scope.set("remindMinutes", Math.round(n));
							},
						}),
						React.createElement("span", { className: "dpr-label" }, t("remindMinutesUnit")),
					),
				),
			);
		}

		/* ---------- 峰谷交界前提醒弹窗 ---------- */
		function TransitionPopup(props) {
			const { t, scope } = props;
			const snap = React.useSyncExternalStore(
				scope ? scope.subscribe.bind(scope) : EMPTY_SUBSCRIBE,
				scope ? scope.getSnapshot.bind(scope) : EMPTY_SNAPSHOT,
			);
			const [notice, setNotice] = React.useState(null);
			const [dismissedKey, setDismissedKey] = React.useState("");
			const cfg = snap && snap.status === "ready" && snap.value ? snap.value : null;

			React.useEffect(() => {
				if (!cfg || cfg.enabled !== true || cfg.remindEnabled !== true) {
					setNotice(null);
					return;
				}
				const boundary = nextBoundary(cfg, new Date());
				if (!boundary) return;
				const key = `${boundary.kind}:${boundary.at.getTime()}`;
				if (key === dismissedKey) return;
				const remind = (Number(cfg.remindMinutes) > 0 ? Number(cfg.remindMinutes) : 5) * 60000;
				const delay = boundary.at.getTime() - Date.now() - remind;
				const show = () => setNotice({ key, kind: boundary.kind, at: boundary.at });
				if (delay <= 0) {
					show();
					return;
				}
				const h = window.setTimeout(show, delay);
				return () => window.clearTimeout(h);
			}, [cfg, dismissedKey]);

			if (!notice) return null;
			const enteringPeak = notice.kind === "peak";
			const time = formatTime(notice.at);
			const dismiss = () => {
				setDismissedKey(notice.key);
				setNotice(null);
			};
			return React.createElement(Modal, {
				open: true,
				onClose: dismiss,
				title: enteringPeak ? t("popupTitlePeak") : t("popupTitleOff"),
				closeLabel: t("popupClose"),
				description: (enteringPeak ? t("popupDescPeak") : t("popupDescOff")).replace("{time}", time),
				footer: React.createElement(Button, { onClick: dismiss }, t("popupClose")),
			});
		}

		/* ---------- 插件本体 ---------- */
		const inject = ["slots", "locale", "connection", "remote", "timer", "settingsScope"];

		function apply(ctx) {
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-peakshift";
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => tag.remove();
			}, "dsh-peakshift: styles");

			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-peakshift: dictionaries");
			const t = ctx.locale.bind(NS);

			// 设置 scope（失败时区段降级显示错误，而不是空白）。
			// 快照订阅在组件内部通过 useSyncExternalStore 完成（hooks 只能在组件里调用）。
			let scope = null;
			let scopeError = "";
			try {
				scope = ctx.settingsScope.bind({ namespace: "price-router" });
			} catch (error) {
				scopeError = error instanceof Error ? error.message : String(error);
			}

			const connection = ctx.get("connection");
			const connApi = connection?.api;

			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "peakshift",
				order: 9,
				label: () => t("nav"),
				locale: NS,
			}, () => React.createElement(DprErrorBoundary, null,
				React.createElement(PriceRouterSection, {
					ctx, t, scope, connApi, scopeError,
				}))))

			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "peakshift-reminder",
			}, () => React.createElement(DprErrorBoundary, null,
				React.createElement(TransitionPopup, { t, scope }))))
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
