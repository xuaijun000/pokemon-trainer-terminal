// 对战数据注册表 — 每个游戏版本注册自己的宝可梦/技能/道具数据
// 用法：window.BATTLE_REGISTRY['版本id'] = { pkm:[], moves:[], items:[] }
// battle.js 通过 loadBattleGameData(gameId) 切换版本，不同版本数据完全隔离
window.BATTLE_REGISTRY = {};
