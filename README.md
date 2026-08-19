# dsh-peakshift · 错峰插件 / Peak-shift plugin

给 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 的错峰插件。
A peak-shift plugin for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness).

---

## 中文

### 这是什么

DeepSeek API 自 2026-08-17 起实行峰谷计价：每天 **09:00–12:00、14:00–18:00（北京时间）为高峰**，价格约为低谷的 2 倍；其余为低谷。

本插件**不接入任何新供应商**——完全复用 DSH 原生的多供应商能力。你在「设置 → 模型」里像平时一样添加供应商、填 API Key（端点与模型目录自动），本插件只把「手动切换供应商」变成「按峰谷自动切换」：

- 高峰时段，把「贵模型」（默认 `deepseek-v4-pro`）自动切到你选的便宜备用供应商；
- 低谷时段自动用回 DeepSeek；
- 便宜模型（如 `deepseek-v4-flash`）即使高峰也不切，避免负优化。

### 功能

- **错峰开关**（独立设置页「错峰」）
- **备用供应商 / 备用模型**：只列「已接入」的供应商，及其下实际可用的模型
- **贵模型列表**：可增删，只列 DeepSeek 实际可用的模型
- **交界前提醒**：切换前弹窗提醒（默认提前 5 分钟）
- **模型页状态卡片**：实时显示「错峰：开/关 · 备用 xxx」
- **默认关闭、异常安全**：未勾选或配置异常时，请求原样通过

### 安装

1. 把本目录放进 DSH 的 node_modules：

   ```powershell
   Copy-Item -Recurse <本目录> "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-peakshift"
   ```

   或 `npm install dsh-peakshift`（已发布后）。

2. 编辑 `~/.dsh/profiles/web/cordis.patch.yml`，加入：

   ```yaml
   - insert:
       - id: dsh-peakshift
         name: dsh-peakshift
   ```

3. 重启 DSH。

### 卸载

> ⚠️ 重要：DSH 要求 `cordis.patch.yml` 的**顶层必须是数组**。删除挂载行后，文件末尾必须保留一个空数组 `[]`，否则 DSH 会启动失败（报 `must be a top-level YAML array`）。

1. 编辑 `~/.dsh/profiles/web/cordis.patch.yml`，**只删除**下面两行（其余内容保留）：

   ```yaml
   - insert:
       - id: dsh-peakshift
         name: dsh-peakshift
   ```

2. 确认文件**末尾保留着 `[]`**（没有的话手动补上），最终应类似：

   ```yaml
   # Your patch layer for this dsh profile, applied after every bundle layer:
   # a top-level YAML array of loader patch entries (id-targeted config
   # overrides, disables, and insert lists; `!!js` expressions allowed).
   []
   ```

3. 删除 `~/.dsh/profiles/node_modules/dsh-peakshift` 目录；
4. 重启 DSH。

### 使用

1. 「设置 → 模型」：添加一个便宜供应商（Moonshot、GLM、OpenAI 兼容网关……），填 API Key；
2. 「设置 → 错峰」：勾选「错峰」，选好备用供应商/模型，贵模型列表默认 `deepseek-v4-pro`；
3. 完成。高峰时段请求自动走备用供应商，低谷自动用回 DeepSeek。

### 配置项（settings.yaml 的 `price-router:` 分节）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `false` | 错峰总开关 |
| `primaryProvider` | `deepseek-official` | 主供应商（低谷时段使用） |
| `fallbackProvider` | 空 | 备用供应商（留空 = 自动选第一个已接入的） |
| `fallbackModel` | 空 | 备用模型（留空 = 该供应商第一个模型） |
| `peakWindows` | `09:00–12:00`、`14:00–18:00` | 高峰时段窗口（北京时间） |
| `expensiveModels` | `["deepseek-v4-pro"]` | 贵模型列表（高峰才切走的模型） |
| `remindEnabled` / `remindMinutes` | `true` / `5` | 交界前提醒开关与提前分钟数 |

### 注意事项

- 峰谷时段按北京时间计算，与机器时区无关。
- 备用供应商必须先接入（未接入时自动跳过切换，不影响对话）。
- 官方口径为「每日固定时段」，无周末/节假日例外。
- 切换只发生在「自动模式」下且请求正指向主供应商的贵模型时；你在模型选择器里手动选的模型永远优先。
- 模型页的「错峰」卡片是官方设置通道的钥匙（浏览器对插件设置的读写只对供应商目录条目开放），卡片本身不可编辑，配置在「错峰」页完成。

### 开发

```text
dsh-peakshift/
├── lib/
│   ├── index.js    # Host 半：路由改写 + 设置分节 + 模型页状态卡片
│   └── client.js   # 浏览器半：设置页 + 交界前弹窗（ModuleLoader bundle）
├── package.json    # dsh.client 声明（platform: web）
├── LICENSE
└── README.md
```

Host 与浏览器半各自内置一份相同的计价算法，改动时请两边同步。

---

## English

### What it is

Since 2026-08-17 DeepSeek uses peak/off-peak pricing: **09:00–12:00 and 14:00–18:00 (Beijing time) are peak hours** (about 2× the off-peak price); the rest is off-peak.

This plugin **does not add any new provider** — it reuses DSH's native multi-provider support. You add providers and API keys in **Settings → Models** as usual; this plugin only turns "manually switching providers" into "switching automatically by peak/off-peak":

- during peak hours, it shifts your "expensive models" (default `deepseek-v4-pro`) to the cheaper backup provider you chose;
- during off-peak hours it switches back to DeepSeek;
- cheap models (e.g. `deepseek-v4-flash`) are never shifted, even at peak.

### Features

- **Peak-shift toggle** (dedicated "Peak shift" settings page)
- **Backup provider / model**: only lists *connected* providers and their actually available models
- **Expensive-models list**: add/remove; only lists DeepSeek models that are actually available
- **Transition reminder**: a popup before a switch (5 minutes ahead by default)
- **Status card on the Models page**: shows "Peak shift: on/off · backup xxx" in real time
- **Off by default, fail-safe**: when off or misconfigured, requests pass through untouched

### Install

1. Put this folder into DSH's node_modules:

   ```powershell
   Copy-Item -Recurse <this-folder> "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-peakshift"
   ```

   Or `npm install dsh-peakshift` (once published).

2. Edit `~/.dsh/profiles/web/cordis.patch.yml` and add:

   ```yaml
   - insert:
       - id: dsh-peakshift
         name: dsh-peakshift
   ```

3. Restart DSH.

### Uninstall

> ⚠️ Important: DSH requires `cordis.patch.yml` to have a **top-level array**. After removing the mount lines, keep an empty array `[]` at the end of the file — otherwise DSH fails to start (`must be a top-level YAML array`).

1. Edit `~/.dsh/profiles/web/cordis.patch.yml` and **remove only** these lines:

   ```yaml
   - insert:
       - id: dsh-peakshift
         name: dsh-peakshift
   ```

2. Make sure the file still **ends with `[]`** (add it if missing). It should look like:

   ```yaml
   # Your patch layer for this dsh profile, applied after every bundle layer:
   # a top-level YAML array of loader patch entries (id-targeted config
   # overrides, disables, and insert lists; `!!js` expressions allowed).
   []
   ```

3. Delete `~/.dsh/profiles/node_modules/dsh-peakshift`;
4. Restart DSH.

### Usage

1. **Settings → Models**: add a cheaper provider and fill in its API key;
2. **Settings → Peak shift**: enable the toggle, pick the backup provider/model (expensive models default to `deepseek-v4-pro`);
3. Done — peak-hour requests go to the backup provider, off-peak requests go back to DeepSeek.

### Configuration (`price-router:` section in settings.yaml)

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Master toggle |
| `primaryProvider` | `deepseek-official` | Primary provider (off-peak) |
| `fallbackProvider` | empty | Backup provider (empty = first connected one) |
| `fallbackModel` | empty | Backup model (empty = that provider's first model) |
| `peakWindows` | `09:00–12:00`, `14:00–18:00` | Peak windows (Beijing time) |
| `expensiveModels` | `["deepseek-v4-pro"]` | Models to shift away from at peak |
| `remindEnabled` / `remindMinutes` | `true` / `5` | Transition reminder toggle / lead minutes |

### Notes

- Peak/off-peak is computed in Beijing time, independent of the machine's timezone.
- The backup provider must be connected first; otherwise the plugin silently skips switching.
- The official rule is "fixed windows daily" — no weekend/holiday exceptions.
- Switching only happens in auto mode when the request targets the primary provider's expensive model; models you pick manually always win.
- The "Peak shift" card on the Models page is the key to the official settings channel (browser access to plugin settings only opens for provider-directory entries); the card itself is not editable — configure everything on the "Peak shift" page.

### Development

```text
dsh-peakshift/
├── lib/
│   ├── index.js    # Host half: routing rewrite + settings section + Models-page status card
│   └── client.js   # Browser half: settings page + transition popup (ModuleLoader bundle)
├── package.json    # dsh.client declaration (platform: web)
├── LICENSE
└── README.md
```

Host and browser halves each embed the same pricing algorithm — keep them in sync when editing.

## License

MIT
