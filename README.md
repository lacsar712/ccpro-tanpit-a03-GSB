# TanPit-01 · 南冈鞣场

鞣坑场地图作业台。登录后顶栏可切换「坑位场地图」与「同行对照台」：场地图按行列铺开坑位，点坑登记浸液酸碱度并改状态；对照台是独立只读专页，按场筛选、按行列出各坑最近酸碱、同行鞣制中均值与差值。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Django 5 · Django Ninja（不是 DRF 视图集） |
| 结构 | Django app `pits`：models / rules / api 分文件 |
| 数据 | Django ORM · PostgreSQL 15 |
| 前端 | Lit 3 Web Component · Vite |
| 部署 | Docker Compose |

## 路径与端口

- 前端：http://localhost:4770
- API：http://localhost:8770
- PostgreSQL：localhost:6170

## 演示账号

`admin` / `123456`，`worker` / `123456`

## 业务规则

- 坑不可标「已放液」，除非最近一次浸液酸碱度在 **3.5～5.0**（只看这一条，不看同行均值）。
- 改「鞣制中」时，若同一行已有鞣制中的坑，取这些同行坑最近酸碱的**算术平均**，用本坑最近酸碱去减，**绝对值大于 0.6 则挡住**；本行没有鞣制中坑则不比。
- 同一坑重复设为当前状态会被拒绝；状态变更在事务内对同行坑按序加行锁，两名工同时抢改同一坑只入一笔。

规则在 `backend/pits/rules.py`，接口在 `backend/pits/api.py`（`GET /api/compare` 为对照台只读数据）。

## 快速启动

```bash
cd TanPit/TanPit-01
docker compose up --build
```
