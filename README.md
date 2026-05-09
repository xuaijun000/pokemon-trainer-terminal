# Pokemon Trainer Terminal

从 `GAME-JOURNAL` 拆出的宝可梦独立站原型。第一版采用静态前端，主结构是：

- 图鉴：中文图鉴检索、Champions 属性/种族值、加入队伍、设为伙伴
- 游戏：火红 / 叶绿地图资源、通关清单、野生遭遇查询
- 对战：队伍构筑、招式速查、道具速查、战绩记录
- 伙伴浮窗：全站常驻入口，状态、训练、每日任务、记录、设置通过次级面板展示

## 运行方式

推荐在本目录启动一个本地静态服务器，这样 `data/pokedex_zh_official.json` 可以被浏览器正常读取：

```powershell
cd pokemon-trainer-terminal
node server.mjs 5177
```

然后打开：

```text
http://localhost:5177
```

如果直接双击 `index.html`，大部分 JS 数据仍然可用，但中文官方图鉴 JSON 可能因为浏览器本地文件限制无法载入。

## 已移植内容

- `data/battle_registry.js`
- `data/pkm_champions_data.js`
- `data/moves_champions_data.js`
- `data/items_champions_data.js`
- `data/frlg_story.js`
- `data/frlg_encounters.js`
- `data/pokedex_zh_official.json`
- `assets/partner/*`
- `assets/map/*`
- `scripts/supabase-community-schema.sql`

## 后续建议

下一步可以把旧站中更重的功能分批接进来：

- 图鉴详情：移植进化链、特性、招式学习、形态切换
- 游戏地图：移植火红叶绿地图热点层和地点详情面板
- 对战：移植原有伤害计算、属性联防分析和公开队伍社区
- 伙伴：把本地 `localStorage` 状态改接 `pkm_partner`，并接入 `is_public` 排行榜
- 社区：把 `battle_records`、`team_likes`、`team_comments`、`community_match_posts` 接回 Supabase

这个项目目前没有改动旧站文件，可以继续和原 `index.html` 并存。
