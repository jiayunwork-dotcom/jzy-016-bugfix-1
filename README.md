# 布雷顿循环（燃气轮机）热力试算服务

常驻后端的纯算力组件：给定压比、进气温度、涡轮入口温度、压气机/涡轮等熵效率、工质比热比，
立即返回压缩、加热、膨胀、排气四个状态点，以及比净功与热效率；并支持压比区间扫描寻优与多工况批量核算。
与机组巡检、燃料采购、电力调度、用户账户等业务域完全无关。

- 语言/运行时：TypeScript · Node.js 20
- HTTP 框架：NestJS 10
- 数据库：PostgreSQL 16 + TypeORM
- 一条命令构建启动：`docker compose up --build`

---

## 1. 快速开始

### Docker Compose（服务 + 数据库一起）

```bash
docker compose up --build
```

- API：http://localhost:3000
- PostgreSQL 16：localhost:5432（库/用户/密码均为 `brayton` / `brayton_secret`）
- 数据表由 TypeORM `synchronize` 自动建立；可用 `API_PORT` / `DB_PORT` 改宿主端口。

### 本机开发（需自备或用 compose 起一个数据库）

```bash
npm install
npm run start:dev        # 热重载
# 或
npm run build && npm run start:prod
```

数据库连接全部走环境变量：`DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME DB_SYNCHRONIZE`。

### 只跑测试（不需要数据库）

```bash
npm test                 # 单元测试（热力核心、校验、服务、并发）
npm run test:e2e         # HTTP 端到端（内存持久化）
npm run test:all         # 两者连跑
npm run typecheck        # 严格类型检查
```

---

## 2. 物理模型

工质按**定压比热为常数的理想气体**处理。比热、气体常数、比热比三者强制自洽（见
`src/thermo/isentropic.ts`），比热比一变，同温差的焓变必然跟着变，不存在脱钩的死数：

```
cp = gamma / (gamma - 1) · R
cv = R / (gamma - 1)
cp - cv = R
```

四个状态点（p 以进气压力归一化）：

| 状态 | 位置 | 温度 | 相对压力 |
| --- | --- | --- | --- |
| 1 | 压气机进气 | T1 | 1 |
| 2 | 压气机实际出口（燃烧室入口） | T2 | pr |
| 3 | 涡轮入口（燃烧室出口） | T3 | pr |
| 4 | 涡轮实际出口（排气） | T4 | 1（回到进气压力） |

- **压缩段**：等熵终点 `T2s = T1 · pr^((gamma−1)/gamma)`；压气机效率
  `eta_c = (T2s−T1)/(T2−T1)`，故 `T2 = T1 + (T2s−T1)/eta_c`。`eta_c < 1` 时实际温升更高，
  `eta_c = 1` 与等熵重合。
- **加热段（定压）**：`q_in = cp · (T3 − T2)`。
- **膨胀段**：等熵终点 `T4s = T3 · pr^((1−gamma)/gamma)`；涡轮效率
  `eta_t = (T3−T4)/(T3−T4s)`，故 `T4 = T3 − eta_t·(T3−T4s)`。`eta_t < 1` 时实际出口温度更高。
- **比净功**：`w_net = cp(T3−T4) − cp(T2−T1)`。
- **热效率**：`eta = w_net / q_in`。**加热量不大于零时热效率返回 `null`，绝不除零编造。**

### 内置硬约束（均有自动化测试看守）

1. 两侧效率为 1 时，热效率精确回到理想闭式 `1 − pr^((1−gamma)/gamma)`，且**与 T3 无关**；
2. 两侧效率为 1，压比 8 → 20，热效率升高；
3. 单独把压气机效率 1 → 0.8，同工况比净功下降；
4. T3 恰等于压气机实际出口 T2 时加热量为零、比净功非正、热效率为 null；
5. 实际循环热效率严格低于同压比理想闭式；
6. 计入部件效率后比净功随压比**先升后降**，扫描结果 `shape = RISE_THEN_FALL` 并标出拐点最优点，
   不沿用“压比越大越好”的理想式结论。

### 材料温度上限

`materialTemperatureLimit` 可省略。提供且 T3 超限时：

- 结果显式标注 `materialLimit.marker = "受入口温度限制"`、`exceeded = true`；
- **绝不截断到上限**——计算仍用原 T3，`effectiveTurbineInletTemperature` 回显原值；
- 未提供上限则不截断、不标注。

### 内置示范算例

`GET /cycles/demo`：压比 12，压气机/涡轮效率 0.86/0.90（航空改型常用量级），
T1=300 K、T3=1400 K；比净功为正，实际热效率约 0.379，低于同压比理想闭式约 0.508。

---

## 3. HTTP 接口

### `POST /cycles/ideal` —— 理想循环（不计部件效率，效率恒为 1）

```json
{ "pressureRatio": 12, "ambientTemperature": 300, "turbineInletTemperature": 1400, "gamma": 1.4 }
```

`gasConstant` 可选（默认 287 J/(kg·K)）；`materialTemperatureLimit` 可选。

### `POST /cycles/actual` —— 实际循环（计入部件效率）

```json
{
  "pressureRatio": 12,
  "ambientTemperature": 300,
  "turbineInletTemperature": 1400,
  "compressorEfficiency": 0.86,
  "turbineEfficiency": 0.9,
  "gamma": 1.4,
  "gasConstant": 287,
  "materialTemperatureLimit": 1500
}
```

返回（节选）：

```json
{
  "kind": "actual",
  "states": {
    "compressorInlet":  { "index": 1, "temperature": 300,  "relativePressure": 1 },
    "compressorOutlet": { "index": 2, "temperature": 660.7, "relativePressure": 12 },
    "turbineInlet":     { "index": 3, "temperature": 1400, "relativePressure": 12 },
    "exhaust":          { "index": 4, "temperature": 759.5, "relativePressure": 1 }
  },
  "heatAdded": 742422.0,
  "netWork": 281095.4,
  "thermalEfficiency": 0.3785,
  "idealClosedFormEfficiency": 0.5083,
  "materialLimit": { "exceeded": false, "marker": null, "effectiveTurbineInletTemperature": 1400 }
}
```

### `POST /cycles/scan` —— 压比区间扫描寻优（T1、T3 钉死）

```json
{
  "ambientTemperature": 300, "turbineInletTemperature": 1400,
  "compressorEfficiency": 0.86, "turbineEfficiency": 0.9, "gamma": 1.4,
  "minPressureRatio": 2, "maxPressureRatio": 40, "step": 0.5
}
```

返回 `points[]`（每点：`pressureRatio/netWork/thermalEfficiency/heatAdded`）、
`optimum`（净功最高点及其下标）、`shape`（`RISE_THEN_FALL` 等）与 `count`。
网格为闭区间且必含上下界。

### `POST /cycles/batch` —— 多工况批量核算

```json
{ "cases": [ { ...actual 或 ideal 工况 }, { "kind": "ideal", ... } ] }
```

HTTP 恒为 200（包络错误除外）。逐组返回 `caseNumber`（1 基）/`ok`/`result`/`errors`；
**任一组非法只指明“第几组、哪个参数”，其余组照常返回**，失败组绝不产出貌似正确的效率。

### `GET /cycles/demo` —— 内置示范算例（输入 + 结果）

### `GET /cycles/history` —— 历史条件查询

每次单点核算与扫描都持久化（JSONB 原样保存输入输出）。条件全部可选：

```
GET /cycles/history?type=cycle&pressureRatio=12&gamma=1.4
                     &ambientTemperature=300&turbineInletTemperature=1400
                     &limit=50&offset=0
```

`type ∈ cycle | scan | batch`，响应头 `X-Total-Count` 给出命中总数。

### `GET /conventions` —— 约定回显

返回默认比热比（1.4）、默认气体常数、材料上限处理策略（`FLAG_ONLY_NEVER_CLAMP`）、
各项容差、取值域、零加热规则、扫描形态约定与批量上限。

### 运行状态端点（监控采集）

- `GET /health/live`：进程存活；
- `GET /health/ready`：含数据库探活，异常时返回 503；
- `GET /health`：完整状态（uptime、数据库驱动与延迟）。

---

## 4. 输入校验规则

| 参数 | 约束 |
| --- | --- |
| `pressureRatio` / `minPressureRatio` | 严格大于 1 |
| `ambientTemperature` | 热力学温度，严格大于 0 |
| `turbineInletTemperature` | 有限值，且不得低于进气温度 |
| `gamma` | 严格大于 1 |
| `compressorEfficiency` / `turbineEfficiency` | 落在 (0, 1] |
| `gasConstant` | 可选，默认 287；若给须为正 |
| `materialTemperatureLimit` | 可选；若给须为正 |
| 扫描 `step` | 严格大于 0；`maxPressureRatio >= minPressureRatio` |

缺字段、非数值、`NaN`、`Infinity/-Infinity`、越界一律 HTTP 400，
响应体形如 `{ "error": "VALIDATION_FAILED", "errors": [{ "field", "code", "message" }] }`，
精确定位到参数名。任何未预期异常经全局过滤器收敛为结构化 JSON，不会崩溃或串扰其他并发请求。

---

## 5. 代码结构（按职责拆模块）

```
src/
  thermo/                       纯热力算力（无 IO、无框架依赖）
    constants.ts                默认值/容差/材料上限策略
    isentropic.ts               气体模型自洽、等熵关系、理想闭式、部件实际出口温度
    compressor.ts               压缩段
    turbine.ts                  膨胀段
    cycle.ts                    四状态点总装、加热量、净功、热效率、上限标注
    scan.ts                     压比网格、扫描寻优、拐点形态识别
    demo.ts                     内置示范算例
  validation/                   输入校验（与算力、持久化解耦）
    utils.ts cycle.validator.ts scan.validator.ts batch.validator.ts history.validator.ts
  persistence/                  持久化
    entities/                   TypeORM 实体（jsonb）
    repositories/               PostgreSQL 实现 + 内存实现（测试用，深拷贝隔离）
  calculations/                 计算编排、控制器、历史服务
  conventions/                  约定回显
  health/                       运行状态
  app.module.ts main.ts db.config.ts all-exceptions.filter.ts
test/                           单元测试
test/e2e/                       HTTP 端到端测试
```

计算核心是无状态纯函数：请求之间不共享任何可变数据；持久化实现对入参/出参做深拷贝，
并发请求结果互不干扰、历史不错乱（由并发测试与 30 路 HTTP 并发 e2e 看守）。
