# TanPit-01 · 南冈鞣场

鞣坑场地图作业台。登录后顶栏可在两个独立专页间切换：

- **坑位场地图**（`/`）：按行列铺开的坑位，点坑登记浸液酸碱度并改状态。
- **同行对照台**（`/compare`）：独立只读专页，按场筛选，按行列出各坑最近酸碱、本行鞣制中坑均值与差值。对照表不在场地图抽屉/详情区里交差。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Django 5 · Django Ninja（不是 DRF 视图集） |
| 结构 | Django app `pits`：models / rules / api 分文件 |
| 数据 | Django ORM · PostgreSQL 15 |
| 前端 | Lit 3 Web Component · Vite（pathname 路由，无前端框架路由库） |
| 部署 | Docker Compose |

## 路径与端口（docker-compose 实际映射）

- 前端：http://localhost:4830 （场地图 `/`，对照台 `/compare`）
- API：http://localhost:8830
- PostgreSQL：localhost:6230

## 演示账号

`admin` / `123456`，`worker` / `123456`

## 业务规则

规则集中在 `backend/pits/rules.py`，接口与对照台共用同一口径。

- **已放液**：最近一次浸液酸碱度必须在 **3.5～5.0**（含边界）。只看本坑，同行均值差不得用于拦截放液。
- **鞣制中**：同一行（同一鞣场、同一排）已有其他「鞣制中」坑时，取这些同行坑各自最近一次酸碱读数的**算术平均**（排除本坑），用本坑最近读数去减，差值为绝对值，**严格大于 0.6** 即中文挡住；本行没有鞣制中坑（或同行全无读数）则不比较。
- **并发**：改状态在单个数据库事务内按 id 升序锁住本行全部坑（`SELECT … FOR UPDATE`），锁内按最新状态重算规则。两名工同时把同一口坑拨成鞣制中，只入库一笔，后到者收到 409。

种子数据「南冈鞣场」东排即为验收行：东-1 鞣制中 4.0；东-甲注液 4.5（差 0.5 可过）；东-乙注液 5.0（差 1.0 应挡）。另有「北冈鞣场」体现按场筛选。旧快照缺少东排验收坑位时，`seed` 会自动清场重建（账号保留），且种子幂等。

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 登录取 token |
| GET | `/api/yards` | 全部鞣场 |
| GET | `/api/board?yard_id=` | 某场坑位图（不带 id 取第一场） |
| GET | `/api/compare?yard_id=` | 同行对照台只读数据：按行分组，含 `latestPh / peerMean / diff / overLimit` |
| POST | `/api/pits/{id}/samples` | 登记浸液酸碱 |
| POST | `/api/pits/{id}/status` | 改状态（规则拦截 400；并发重复 409） |

## 快速启动

```bash
docker compose up --build
```
