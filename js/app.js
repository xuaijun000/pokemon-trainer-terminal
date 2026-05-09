(function(){
  const STORAGE = {
    team: 'ptt.team.v1',
    records: 'ptt.records.v1',
    story: 'ptt.story.v1',
    partner: 'ptt.partner.v1',
    tasks: 'ptt.tasks.v1'
  };

  const TYPE_ZH = {
    normal:'一般', fire:'火', water:'水', electric:'电', grass:'草', ice:'冰',
    fighting:'格斗', poison:'毒', ground:'地面', flying:'飞行', psychic:'超能力',
    bug:'虫', rock:'岩石', ghost:'幽灵', dragon:'龙', dark:'恶', steel:'钢', fairy:'妖精'
  };
  const TYPE_COLOR = {
    normal:'#b8b089', fire:'#f27d42', water:'#5da7f2', electric:'#f5cf4c',
    grass:'#67c56d', ice:'#7dd8dc', fighting:'#dd6b5f', poison:'#b66bd8',
    ground:'#d5a85b', flying:'#91a9ff', psychic:'#f071a6', bug:'#9fc45a',
    rock:'#c5ad69', ghost:'#8f7ad8', dragon:'#7c86f4', dark:'#8a7768',
    steel:'#9fb2c8', fairy:'#ee92bd'
  };
  const STAT_LABEL = { hp:'HP', atk:'攻击', def:'防御', spa:'特攻', spd:'特防', spe:'速度' };
  const GEN_RANGE = { 1:[1,151], 2:[152,251], 3:[252,386] };
  const RESULT_ZH = { win:'胜利', lose:'失败', draw:'平局' };

  const GAME_VERSIONS = [
    { id:'frlg', label:'火红 / 叶绿', sub:'FireRed · LeafGreen', gen:'Gen III', active:true,
      mapImg:'assets/map/火红叶绿全局地图.png',
      mapStripHtml:`<img src="assets/map/七岛缩略图.png" alt="七岛缩略图"><span>七岛区域已移植，可继续接热点层。</span>` },
    { id:'rby',  label:'红 / 蓝 / 黄',  sub:'Red · Blue · Yellow',  gen:'Gen I',   active:false },
    { id:'gsc',  label:'金 / 银 / 水晶', sub:'Gold · Silver · Crystal', gen:'Gen II',  active:false },
    { id:'rse',  label:'红宝石 / 绿宝石', sub:'Ruby · Sapphire · Emerald', gen:'Gen III', active:false },
    { id:'dppt', label:'钻石 / 珍珠 / 白金', sub:'Diamond · Pearl · Platinum', gen:'Gen IV', active:false },
    { id:'hgss', label:'心金 / 魂银',   sub:'HeartGold · SoulSilver', gen:'Gen IV', active:false },
    { id:'bw',   label:'黑 / 白',       sub:'Black · White',        gen:'Gen V',   active:false },
    { id:'sv',   label:'朱 / 紫',       sub:'Scarlet · Violet',     gen:'Gen IX',  active:false },
  ];

  const state = {
    view: 'dex',
    query: '',
    officialDex: [],
    activeDexId: null,
    activeDetailFormNum: null,
    gameVersion: 'frlg',
    team: loadJson(STORAGE.team, []),
    records: loadJson(STORAGE.records, []),
    story: loadJson(STORAGE.story, {}),
    partner: null,
    partnerTab: 'status',
    encountersKey: '',
    lookupId: null,
    lookupFormat: 'champions'
  };

  const registry = window.BATTLE_REGISTRY?.champions || {};
  const champions = registry.pkm || [];
  const moves = registry.moves || [];
  const items = registry.items || [];
  const championsByNum = new Map(champions.map(p => [Number(p.num), p]));
  const championsBySlug = new Map(champions.map(p => [p.slug, p]));
  const movesBySlug = new Map(moves.map(m => [m.slug, m]));
  // num in Champions data is a roster index, not the real Pokédex ID.
  // Parse the actual dex ID from spriteUrl (e.g. ".../pokemon/6.png" → 6).
  const championsByDexId = new Map();
  champions.forEach(p => {
    const m = (p.spriteUrl || '').match(/\/(\d+)\.png/);
    if(m){ const id = Number(m[1]); if(!championsByDexId.has(id)) championsByDexId.set(id, p); }
  });

  function $(sel, root=document){ return root.querySelector(sel); }
  function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
  function saveJson(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function loadJson(key, fallback){
    try{ return JSON.parse(localStorage.getItem(key) || '') || fallback; }
    catch{ return fallback; }
  }
  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function todayKey(){ return new Date().toISOString().slice(0,10); }
  function spriteFor(entry){
    const num = Number(entry?.num || entry?.id || entry?.pkm_id || 25);
    return entry?.spriteUrl || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${num}.png`;
  }
  function nameFor(numOrSlug){
    if(typeof numOrSlug === 'number') return championsByNum.get(numOrSlug)?.name || `#${numOrSlug}`;
    const p = championsBySlug.get(numOrSlug);
    return p?.name || String(numOrSlug || '').split('-').map(s => s ? s[0].toUpperCase() + s.slice(1) : '').join(' ');
  }
  function typePills(types=[]){
    return `<div class="type-row">${types.map(t => {
      const color = TYPE_COLOR[t] || '#aab';
      return `<span class="type-pill" style="color:${color}">${TYPE_ZH[t] || t}</span>`;
    }).join('')}</div>`;
  }
  function abilityName(slug){
    return slug.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
  }
  function buildLearnset(learnset){
    const matched = learnset
      .map(slug => movesBySlug.get(slug))
      .filter(Boolean)
      .sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
      .slice(0, 20);
    if(!matched.length) return '';
    return `
      <div class="detail-section">
        <p class="eyebrow">Learnset · ${learnset.length} 招式</p>
        <div class="learnset-list">
          ${matched.map(m => `
            <div class="learnset-card">
              <span class="learnset-type" style="color:${TYPE_COLOR[m.type] || '#aab'}">${TYPE_ZH[m.type] || m.type}</span>
              <strong>${esc(m.name)}</strong>
              <span class="learnset-meta">${m.cat === 'physical' ? '物理' : m.cat === 'special' ? '特殊' : '变化'}</span>
              ${m.power ? `<b class="learnset-power">${m.power}</b>` : '<span class="learnset-dash">—</span>'}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  function calcSpeed(base, ev=252, iv=31, level=50, natureBoost=false){
    const nature = natureBoost ? 1.1 : 1.0;
    return Math.floor(Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100 + 5) * nature);
  }
  function taskState(){
    const all = loadJson(STORAGE.tasks, {});
    const key = todayKey();
    all[key] = all[key] || {};
    saveJson(STORAGE.tasks, all);
    return all[key];
  }
  function markTask(id){
    const all = loadJson(STORAGE.tasks, {});
    const key = todayKey();
    all[key] = all[key] || {};
    all[key][id] = true;
    saveJson(STORAGE.tasks, all);
    if(state.partnerTab === 'tasks') renderPartnerBody();
  }

  async function loadOfficialDex(){
    try{
      const res = await fetch('data/pokedex_zh_official.json', { cache:'force-cache' });
      if(res.ok) state.officialDex = await res.json();
    }catch{
      state.officialDex = [];
    }
  }

  function dexIdFromSprite(p){
    const m = (p.spriteUrl || '').match(/\/(\d+)\.png/);
    return m ? Number(m[1]) : null;
  }
  function getFormChampions(baseSlug){
    if(!baseSlug) return [];
    return champions.filter(p => {
      const id = dexIdFromSprite(p);
      return id && id >= 10000 && (
        p.slug === 'mega-' + baseSlug ||
        p.slug.startsWith('mega-' + baseSlug + '-')
      );
    });
  }
  function getDexEntries(){
    const official = state.officialDex.length
      ? state.officialDex.map(row => {
          const c = championsByDexId.get(Number(row.id));
          return { id:Number(row.id), zhName:row.zhName, descZh:row.descZh, champion:c, types:c?.types || [], stats:c?.stats || null, spriteUrl:c?.spriteUrl };
        })
      : champions.filter(p => { const id = dexIdFromSprite(p); return id !== null && id < 10000; })
               .map(p => {
          const id = dexIdFromSprite(p) ?? Number(p.num);
          return { id, zhName:p.name, descZh:'Champions 对战数据已移植。完整中文图鉴可通过本地服务器载入 JSON 后显示。', champion:p, types:p.types || [], stats:p.stats || null, spriteUrl:p.spriteUrl };
        });
    return official.sort((a,b) => a.id - b.id);
  }

  function bindNavigation(){
    $all('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.view));
    });
    $('#global-search').addEventListener('input', event => {
      state.query = event.target.value.trim().toLowerCase();
      renderCurrentView();
    });
  }

  function setView(view){
    state.view = view;
    $all('.nav-btn').forEach(btn => btn.classList.toggle('is-active', btn.dataset.view === view));
    $all('.view').forEach(el => el.classList.toggle('is-active', el.id === `view-${view}`));
    $('#view-title').textContent = view === 'dex' ? '训练师图鉴' : view === 'games' ? '游戏记录中心' : '对战工作台';
    renderCurrentView();
  }

  function renderCurrentView(){
    if(state.view === 'dex') renderDex();
    if(state.view === 'games') renderGames();
    if(state.view === 'battle') renderBattle();
  }

  function renderTodayFocus(){
    const pool = champions.length ? champions : [{ name:'皮卡丘', num:25 }];
    const pick = pool[new Date().getDate() % pool.length];
    $('#today-focus').textContent = pick.name;
    $('#today-copy').textContent = `今日适合整理 ${pick.name} 的图鉴、队伍或冒险记录。`;
  }

  function renderDex(){
    const filter = $('#dex-filter').value;
    const q = state.query;
    let entries = getDexEntries();
    if(filter in GEN_RANGE){
      const [min,max] = GEN_RANGE[filter];
      entries = entries.filter(e => e.id >= min && e.id <= max);
    }
    if(filter === 'champions') entries = entries.filter(e => e.champion);
    if(q){
      entries = entries.filter(e => String(e.id).includes(q) || e.zhName.toLowerCase().includes(q) || e.champion?.slug?.includes(q));
    }
    const list = entries.slice(0, q ? 120 : 180);
    $('#dex-list').innerHTML = list.map(e => `
      <button class="dex-card ${state.activeDexId === e.id ? 'is-active' : ''}" type="button" data-dex-id="${e.id}">
        <img src="${esc(spriteFor(e))}" alt="">
        <span>
          <span class="dex-no">#${String(e.id).padStart(4,'0')}</span>
          <span class="dex-name">${esc(e.zhName)}</span>
          ${typePills(e.types)}
        </span>
      </button>
    `).join('') || `<div class="empty-state"><strong>没有匹配结果</strong><span>换个关键词试试。</span></div>`;
    $all('.dex-card').forEach(card => card.addEventListener('click', () => renderDexDetail(Number(card.dataset.dexId))));
  }

  function renderDexDetail(id){
    if(state.activeDexId !== id) state.activeDetailFormNum = null;
    state.activeDexId = id;
    markTask('pokedex');
    const entry = getDexEntries().find(e => e.id === id);
    if(!entry) return;

    const baseChampion = entry.champion;
    const display = state.activeDetailFormNum !== null
      ? (championsByNum.get(state.activeDetailFormNum) || baseChampion)
      : baseChampion;
    const forms = getFormChampions(baseChampion?.slug);

    const stats = display?.stats || {};
    const statTotal = Object.values(stats).reduce((sum, v) => sum + Number(v), 0);
    const displayTypes = display?.types || entry.types;
    const displayName = display ? display.name : entry.zhName;
    const displaySprite = display ? spriteFor(display) : spriteFor(entry);

    const formSelectorHtml = forms.length ? `
      <div class="form-selector">
        <button class="form-chip ${state.activeDetailFormNum === null ? 'is-active' : ''}" type="button" data-form-num="base">
          <img src="${esc(spriteFor(baseChampion || entry))}" alt="">
          <span>${esc(entry.zhName)}</span>
        </button>
        ${forms.map(f => `
          <button class="form-chip ${state.activeDetailFormNum === Number(f.num) ? 'is-active' : ''}" type="button" data-form-num="${f.num}">
            <img src="${esc(spriteFor(f))}" alt="">
            <span>${esc(f.name)}</span>
          </button>
        `).join('')}
      </div>
    ` : '';

    $('#dex-detail').innerHTML = `
      <div class="pkm-detail">
        ${formSelectorHtml}
        <div class="pkm-detail-top">
          <div class="pkm-art"><img src="${esc(displaySprite)}" alt=""></div>
          <div>
            <p class="eyebrow">#${String(entry.id).padStart(4,'0')}</p>
            <h3>${esc(displayName)}</h3>
            ${typePills(displayTypes)}
            <p class="pkm-desc">${esc(entry.descZh || '暂无中文描述。')}</p>
          </div>
        </div>
        ${display?.stats ? `
          <div class="stat-list">
            ${Object.entries(STAT_LABEL).map(([key,label]) => {
              const value = Number(stats[key] || 0);
              return `<div class="stat-row"><span>${label}</span><span class="stat-bar"><span class="stat-fill" style="width:${Math.min(100,value / 160 * 100)}%"></span></span><b>${value}</b></div>`;
            }).join('')}
            <div class="stat-row stat-total-row">
              <span>总计</span>
              <span class="stat-bar"><span class="stat-fill stat-fill-total" style="width:${Math.min(100, statTotal / 720 * 100)}%"></span></span>
              <b>${statTotal}</b>
            </div>
          </div>
        ` : '<p class="pkm-desc">这只宝可梦暂未接入 Champions 种族值数据。</p>'}
        ${display?.abilities?.length ? `
          <div class="detail-section">
            <p class="eyebrow">特性</p>
            <div class="ability-row">
              ${display.abilities.map(slug => `<span class="ability-chip">${esc(abilityName(slug))}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        ${buildLearnset(display?.learnset || [])}
        <div class="detail-actions">
          <button class="action-btn primary" type="button" id="detail-add-team">加入队伍</button>
          <button class="action-btn" type="button" id="detail-set-partner">设为伙伴</button>
        </div>
      </div>
    `;
    $all('[data-form-num]').forEach(btn => btn.addEventListener('click', () => {
      state.activeDetailFormNum = btn.dataset.formNum === 'base' ? null : Number(btn.dataset.formNum);
      renderDexDetail(id);
    }));
    const actionChampion = display || baseChampion;
    $('#detail-add-team').addEventListener('click', () => { if(actionChampion) addToTeam(Number(actionChampion.num)); });
    $('#detail-set-partner').addEventListener('click', () => { if(actionChampion) setPartner(Number(actionChampion.num)); });
    renderDex();
  }

  function renderGameVersionBar(){
    const bar = $('#game-ver-bar');
    if(!bar) return;
    bar.innerHTML = GAME_VERSIONS.map(v => `
      <button class="game-ver-btn ${v.id === state.gameVersion ? 'is-active' : ''} ${v.active ? '' : 'is-placeholder'}"
              type="button" data-ver="${v.id}" ${v.active ? '' : 'title="即将支持"'}>
        <span class="ver-gen">${v.gen}</span>
        <span class="ver-label">${v.label}</span>
        <span class="ver-sub">${v.sub || ''}</span>
      </button>
    `).join('');
    $all('[data-ver]').forEach(btn => btn.addEventListener('click', () => {
      const ver = GAME_VERSIONS.find(v => v.id === btn.dataset.ver);
      if(!ver) return;
      state.gameVersion = ver.id;
      renderGames();
    }));
  }

  function renderGames(){
    renderGameVersionBar();
    const ver = GAME_VERSIONS.find(v => v.id === state.gameVersion) || GAME_VERSIONS[0];
    const label = $('#map-ver-label');
    if(label) label.textContent = ver.sub || ver.label;
    if(!ver.active){
      const placeholder = `<div class="empty-state ver-placeholder"><strong>${ver.label}</strong><span>此版本数据待接入，敬请期待。</span></div>`;
      const storyEl = $('#story-list');
      const encounterEl = $('#encounter-list');
      const mapWrap = $('#map-frame-wrap');
      if(storyEl) storyEl.innerHTML = placeholder;
      if(encounterEl) encounterEl.innerHTML = placeholder;
      if(mapWrap) mapWrap.innerHTML = placeholder;
      const prog = $('#story-progress');
      if(prog) prog.textContent = '—';
      return;
    }
    const mapImg = $('#map-img');
    const mapStrip = $('#map-strip');
    const mapWrap = $('#map-frame-wrap');
    if(mapWrap && !mapWrap.querySelector('.map-frame')){
      mapWrap.innerHTML = `
        <div class="map-frame"><img id="map-img" src="${ver.mapImg || ''}" alt=""></div>
        <div class="map-strip" id="map-strip">${ver.mapStripHtml || ''}</div>
      `;
    } else if(mapImg) {
      mapImg.src = ver.mapImg || '';
      if(mapStrip && ver.mapStripHtml) mapStrip.innerHTML = ver.mapStripHtml;
    }
    renderStory();
    renderEncounters();
  }

  function storyNodes(){
    return (window.FRLG_STORY_TIMELINE?.chapters || []).flatMap((chapter, chapterIndex) =>
      chapter.nodes.map((node, nodeIndex) => ({ ...node, chapter:chapter.title, chapterIndex, nodeIndex, key:`${chapterIndex}-${nodeIndex}` }))
    );
  }

  function renderStory(){
    const chapters = window.FRLG_STORY_TIMELINE?.chapters || [];
    const total = storyNodes().length || 1;
    const done = Object.values(state.story).filter(Boolean).length;
    $('#story-progress').textContent = `${Math.round(done / total * 100)}%`;
    $('#story-list').innerHTML = chapters.map((chapter, chapterIndex) => `
      <article class="story-chapter">
        <h4>${esc(chapter.title)}</h4>
        ${chapter.nodes.map((node, nodeIndex) => {
          const key = `${chapterIndex}-${nodeIndex}`;
          return `<label class="story-node">
            <input type="checkbox" data-story-key="${key}" ${state.story[key] ? 'checked' : ''}>
            <span>${esc(node.text)}<small>${esc(node.ep)}</small></span>
          </label>`;
        }).join('')}
      </article>
    `).join('');
    $all('[data-story-key]').forEach(input => input.addEventListener('change', () => {
      state.story[input.dataset.storyKey] = input.checked;
      saveJson(STORAGE.story, state.story);
      markTask('story');
      renderStory();
    }));
  }

  function renderEncounters(){
    const data = window.FRLG_ENCOUNTERS || {};
    const keys = Object.keys(data).sort();
    if(!state.encountersKey) state.encountersKey = keys.find(k => k.includes('viridian')) || keys[0] || '';
    const select = $('#encounter-location');
    if(select.options.length !== keys.length){
      select.innerHTML = keys.map(key => `<option value="${esc(key)}">${esc(locationName(key, data[key]))}</option>`).join('');
      select.addEventListener('change', () => {
        state.encountersKey = select.value;
        renderEncounters();
      });
    }
    select.value = state.encountersKey;
    const encounters = (data[state.encountersKey]?.encounters || []).slice(0, 28);
    $('#encounter-list').innerHTML = encounters.map(row => `
      <article class="encounter-card">
        <span>
          <strong>${esc(nameFor(row.slug))}</strong>
          <small>${esc((row.methods || []).join(' / '))}</small>
        </span>
        <span class="counter">Lv.${row.minLv}-${row.maxLv} · ${row.rate}%</span>
      </article>
    `).join('') || `<div class="empty-state"><strong>暂无遭遇数据</strong><span>可以继续从原站移植地图热点。</span></div>`;
  }

  function locationName(key, row){
    return row?.zh || key.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
  }

  function renderLookupSearch(){
    const q = ($('#lookup-search')?.value || '').trim().toLowerCase();
    const picksEl = $('#lookup-picks');
    if(!picksEl) return;
    if(!q){
      picksEl.innerHTML = `<div class="lookup-hint"><span>输入名称或编号开始查询</span></div>`;
      return;
    }
    const pool = champions;
    const picks = pool.filter(p =>
      String(p.num).includes(q) || p.name.toLowerCase().includes(q) || p.slug.includes(q)
    ).slice(0, 12);
    picksEl.innerHTML = picks.map(p => `
      <button class="pick-card lookup-pick ${state.lookupId === Number(p.num) ? 'is-active' : ''}" type="button" data-lookup="${p.num}">
        <img src="${esc(spriteFor(p))}" alt="">
        <span>${esc(p.name)}<small>#${p.num}</small></span>
      </button>
    `).join('') || `<div class="lookup-hint"><span>没有找到匹配宝可梦</span></div>`;
    $all('[data-lookup]').forEach(btn => btn.addEventListener('click', () => {
      state.lookupId = Number(btn.dataset.lookup);
      $('#lookup-search').value = '';
      renderLookupSearch();
      renderLookupResult();
    }));
  }

  function renderLookupResult(){
    const el = $('#lookup-result');
    if(!el) return;
    if(!state.lookupId){
      el.innerHTML = `<div class="empty-state"><strong>选择一只宝可梦</strong><span>搜索并点击查看对战数据。</span></div>`;
      return;
    }
    const p = championsByNum.get(state.lookupId);
    if(!p){ el.innerHTML = ''; return; }

    const stats = p.stats || {};
    const statTotal = Object.values(stats).reduce((sum, v) => sum + Number(v), 0);
    const baseSpeed = Number(stats.spe || 0);

    const spd       = calcSpeed(baseSpeed, 252, 31, 50, false);
    const spdTimid  = calcSpeed(baseSpeed, 252, 31, 50, true);
    const spdScarf  = Math.floor(spd * 1.5);
    const spdScarfT = Math.floor(spdTimid * 1.5);
    const spdTW     = spd * 2;

    const speedSorted = champions.slice().sort((a, b) => (Number(a.stats?.spe)||0) - (Number(b.stats?.spe)||0));
    const myIdx = speedSorted.findIndex(c => Number(c.num) === Number(p.num));
    const rank = myIdx + 1;
    const nearbyAbove = speedSorted.slice(myIdx + 1, myIdx + 4);
    const nearbyBelow = speedSorted.slice(Math.max(0, myIdx - 3), myIdx).reverse();

    const offMoves = (p.learnset || [])
      .map(slug => movesBySlug.get(slug))
      .filter(m => m && m.power)
      .sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
      .slice(0, 8);

    el.innerHTML = `
      <div class="lookup-inner">
        <div class="lookup-header">
          <div class="pkm-art lookup-art">
            <img src="${esc(spriteFor(p))}" alt="${esc(p.name)}">
          </div>
          <div class="lookup-name-block">
            <p class="eyebrow">#${String(p.num).padStart(4,'0')} · Pokemon Champions</p>
            <h3>${esc(p.name)}</h3>
            ${typePills(p.types || [])}
            <div class="ability-row" style="margin-top:8px">
              ${(p.abilities || []).map(slug => `<span class="ability-chip">${esc(abilityName(slug))}</span>`).join('')}
            </div>
          </div>
          <div class="lookup-stat-block">
            <div class="stat-list">
              ${Object.entries(STAT_LABEL).map(([key, label]) => {
                const val = Number(stats[key] || 0);
                return `<div class="stat-row"><span>${label}</span><span class="stat-bar"><span class="stat-fill" style="width:${Math.min(100,val/160*100)}%"></span></span><b>${val}</b></div>`;
              }).join('')}
              <div class="stat-row stat-total-row">
                <span>总计</span>
                <span class="stat-bar"><span class="stat-fill stat-fill-total" style="width:${Math.min(100,statTotal/720*100)}%"></span></span>
                <b>${statTotal}</b>
              </div>
            </div>
          </div>
        </div>

        <div class="lookup-sections">
          <div class="lookup-section">
            <p class="eyebrow">速度线 · Lv.50 · 252 EV / 31 IV</p>
            <div class="speed-grid">
              <div class="speed-row"><span>中性</span><b>${spd}</b></div>
              <div class="speed-row"><span>+速度性格（Timid / Jolly）</span><b>${spdTimid}</b></div>
              <div class="speed-row"><span>讲究围巾（中性）</span><b>${spdScarf}</b></div>
              <div class="speed-row"><span>讲究围巾（+速度性格）</span><b>${spdScarfT}</b></div>
              <div class="speed-row"><span>顺风（×2）</span><b>${spdTW}</b></div>
            </div>
            <p class="speed-rank-text">Champions 速度排名：第 <b>${rank}</b> / ${speedSorted.length}</p>
            <div class="speed-tier-chart">
              ${nearbyAbove.slice().reverse().map(c => `<span class="speed-chip speed-chip-above">${esc(c.name)}<small>${c.stats?.spe}</small></span>`).join('')}
              <span class="speed-chip speed-chip-self">${esc(p.name)}<small>${baseSpeed}</small></span>
              ${nearbyBelow.map(c => `<span class="speed-chip speed-chip-below">${esc(c.name)}<small>${c.stats?.spe}</small></span>`).join('')}
            </div>
          </div>

          ${offMoves.length ? `
            <div class="lookup-section">
              <p class="eyebrow">主要招式（威力前 8）</p>
              <div class="learnset-list">
                ${offMoves.map(m => `
                  <div class="learnset-card">
                    <span class="learnset-type" style="color:${TYPE_COLOR[m.type]||'#aab'}">${TYPE_ZH[m.type]||m.type}</span>
                    <strong>${esc(m.name)}</strong>
                    <span class="learnset-meta">${m.cat==='physical'?'物理':m.cat==='special'?'特殊':'变化'}</span>
                    <b class="learnset-power">${m.power}</b>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderLookup(){
    renderLookupSearch();
    renderLookupResult();
  }

  function renderBattle(){
    renderTeam();
    renderTeamPicks();
    renderMoves();
    renderItems();
    renderRecords();
    renderLookup();
  }

  function addToTeam(num){
    if(state.team.includes(num) || state.team.length >= 6 || !championsByNum.has(num)) return;
    state.team.push(num);
    saveJson(STORAGE.team, state.team);
    markTask('team');
    renderBattle();
  }

  function removeFromTeam(num){
    state.team = state.team.filter(id => id !== num);
    saveJson(STORAGE.team, state.team);
    renderBattle();
  }

  function renderTeam(){
    const slots = Array.from({ length:6 }, (_, i) => state.team[i] ? championsByNum.get(state.team[i]) : null);
    $('#team-slots').innerHTML = slots.map((p, i) => p ? `
      <div class="team-slot filled">
        <img src="${esc(spriteFor(p))}" alt="">
        <strong>${esc(p.name)}</strong>
        <button type="button" data-remove="${p.num}">移除</button>
      </div>
    ` : `<div class="team-slot">Slot ${i + 1}</div>`).join('');
    $all('[data-remove]').forEach(btn => btn.addEventListener('click', () => removeFromTeam(Number(btn.dataset.remove))));
  }

  function renderTeamPicks(){
    const q = ($('#team-search').value || state.query).trim().toLowerCase();
    const picks = champions.filter(p => {
      if(state.team.includes(Number(p.num))) return false;
      if(!q) return true;
      return String(p.num).includes(q) || p.name.toLowerCase().includes(q) || p.slug.includes(q);
    }).slice(0, 18);
    $('#team-picks').innerHTML = picks.map(p => `
      <button class="pick-card" type="button" data-add="${p.num}">
        <img src="${esc(spriteFor(p))}" alt="">
        <span>${esc(p.name)}<small>#${p.num}</small></span>
      </button>
    `).join('');
    $all('[data-add]').forEach(btn => btn.addEventListener('click', () => addToTeam(Number(btn.dataset.add))));
  }

  function renderMoves(){
    const q = state.query;
    const filtered = moves.filter(m => !q || m.name.toLowerCase().includes(q) || m.nameEn?.toLowerCase().includes(q) || m.type?.includes(q)).slice(0, 28);
    $('#move-count').textContent = `${filtered.length}/${moves.length}`;
    $('#move-list').innerHTML = filtered.map(m => `
      <article class="move-card">
        <span>
          <strong>${esc(m.name)}</strong>
          <small>${esc(m.nameEn || m.slug)} · ${esc(m.effect || '暂无效果描述')}</small>
        </span>
        <span class="move-meta">
          <span class="meta-chip">${esc(TYPE_ZH[m.type] || m.type)}</span>
          <span class="meta-chip">${esc(m.cat || '-')}</span>
          <span class="meta-chip">${m.power ?? '-'}</span>
        </span>
      </article>
    `).join('');
  }

  function renderItems(){
    const q = state.query;
    const filtered = items.filter(it => !q || it.name.toLowerCase().includes(q) || it.nameEn?.toLowerCase().includes(q) || it.effect?.toLowerCase().includes(q)).slice(0, 18);
    $('#item-list').innerHTML = filtered.map(it => `
      <article class="item-card">
        <strong>${esc(it.name)}</strong>
        <small>${esc(it.nameEn || it.slug)} · ${esc(it.effect || '')}</small>
      </article>
    `).join('');
  }

  function addRecord(result){
    const note = $('#battle-note').value.trim();
    const teamNames = state.team.map(num => championsByNum.get(num)?.name).filter(Boolean);
    state.records.unshift({ result, note, team:teamNames, createdAt:new Date().toISOString() });
    state.records = state.records.slice(0, 50);
    saveJson(STORAGE.records, state.records);
    $('#battle-note').value = '';
    markTask('battle');
    renderRecords();
  }

  function renderRecords(){
    const wins = state.records.filter(r => r.result === 'win').length;
    const loses = state.records.filter(r => r.result === 'lose').length;
    const draws = state.records.filter(r => r.result === 'draw').length;
    $('#record-summary').innerHTML = [
      ['胜场', wins], ['负场', loses], ['平局', draws]
    ].map(([label,value]) => `<div class="summary-tile"><strong>${value}</strong><span>${label}</span></div>`).join('');
    $('#record-list').innerHTML = state.records.slice(0, 10).map(r => `
      <article class="record-card">
        <strong>${esc(RESULT_ZH[r.result])}</strong>
        <small>${esc(new Date(r.createdAt).toLocaleString())}</small>
        <small>${esc(r.team?.join(' / ') || '未绑定队伍')}</small>
        ${r.note ? `<small>${esc(r.note)}</small>` : ''}
      </article>
    `).join('') || `<div class="empty-state"><strong>还没有战绩</strong><span>记录一场胜负后会在这里统计。</span></div>`;
  }

  function defaultPartner(){
    const pikachu = championsBySlug.get('pikachu') || championsByNum.get(25) || champions[0];
    return {
      pkm_id: Number(pikachu?.num || 25),
      nickname: pikachu?.name || '皮卡丘',
      level: 5,
      exp: 0,
      hunger: 82,
      mood: 78,
      energy: 86,
      bond: 12,
      logs: [],
      updatedAt: new Date().toISOString()
    };
  }

  function loadPartner(){
    state.partner = loadJson(STORAGE.partner, null) || defaultPartner();
    savePartner();
    renderPartner();
  }

  function savePartner(){
    saveJson(STORAGE.partner, state.partner);
  }

  function setPartner(num){
    const p = championsByNum.get(Number(num));
    if(!p) return;
    state.partner = {
      ...defaultPartner(),
      ...state.partner,
      pkm_id: Number(p.num),
      nickname: p.name,
      updatedAt: new Date().toISOString()
    };
    addPartnerLog(`选择 ${p.name} 成为随身伙伴。`);
    savePartner();
    renderPartner();
  }

  function addPartnerLog(text){
    state.partner.logs = state.partner.logs || [];
    state.partner.logs.unshift({ text, at:new Date().toISOString() });
    state.partner.logs = state.partner.logs.slice(0, 20);
  }

  function renderPartner(){
    const p = championsByNum.get(Number(state.partner.pkm_id)) || champions[0];
    $('#partner-name').textContent = state.partner.nickname || p?.name || '随身伙伴';
    $('#partner-orb-name').textContent = state.partner.nickname || p?.name || '伙伴';
    $('#partner-sprite').src = spriteFor(p || { num:25 });
    $('#partner-sprite').alt = state.partner.nickname || '';
    renderPartnerBody();
  }

  function renderPartnerBody(){
    const tab = state.partnerTab;
    const body = $('#partner-body');
    if(tab === 'status') body.innerHTML = renderPartnerStatus();
    if(tab === 'training') body.innerHTML = renderPartnerTraining();
    if(tab === 'tasks') body.innerHTML = renderPartnerTasks();
    if(tab === 'logs') body.innerHTML = renderPartnerLogs();
    if(tab === 'settings') body.innerHTML = renderPartnerSettings();
    bindPartnerBody();
  }

  function statLine(label, value){
    return `<div class="partner-stat"><span>${label}</span><span class="stat-bar"><span class="stat-fill" style="width:${Math.max(0,Math.min(100,value))}%"></span></span><b>${value}</b></div>`;
  }

  function renderPartnerStatus(){
    const p = championsByNum.get(Number(state.partner.pkm_id));
    return `
      <p class="eyebrow">Lv.${state.partner.level} · ${esc(p?.name || '')}</p>
      ${typePills(p?.types || [])}
      <div style="height:12px"></div>
      ${statLine('饱食', state.partner.hunger)}
      ${statLine('心情', state.partner.mood)}
      ${statLine('精力', state.partner.energy)}
      ${statLine('羁绊', state.partner.bond)}
    `;
  }

  function renderPartnerTraining(){
    const actions = [
      ['feed','喂食','饱食 +16，心情 +4'],
      ['pat','抚摸','心情 +10，羁绊 +4'],
      ['play','玩耍','心情 +14，精力 -8'],
      ['train','训练','经验 +18，精力 -16'],
      ['rest','休息','精力 +24'],
      ['adventure','冒险','羁绊 +8，经验 +8']
    ];
    return `<div class="partner-actions">${actions.map(([id,label,copy]) => `
      <button class="partner-action" type="button" data-partner-action="${id}">
        <strong>${label}</strong>
        <small>${copy}</small>
      </button>
    `).join('')}</div>`;
  }

  function renderPartnerTasks(){
    const done = taskState();
    const tasks = [
      ['pokedex','查看一只宝可梦','图鉴板块'],
      ['story','推进一项通关清单','游戏板块'],
      ['team','加入一只队伍成员','对战板块'],
      ['battle','记录一场对战','对战板块'],
      ['interact','与伙伴互动一次','伙伴浮窗']
    ];
    return tasks.map(([id,title,from]) => `
      <div class="task-row">
        <strong>${done[id] ? '已完成' : '待完成'} · ${title}</strong>
        <span>${from}</span>
      </div>
    `).join('');
  }

  function renderPartnerLogs(){
    const logs = state.partner.logs || [];
    return logs.map(log => `
      <div class="log-row">
        <strong>${esc(log.text)}</strong>
        <span>${esc(new Date(log.at).toLocaleString())}</span>
      </div>
    `).join('') || `<div class="empty-state"><strong>还没有记录</strong><span>互动、换伙伴和跨板块操作都会写到这里。</span></div>`;
  }

  function renderPartnerSettings(){
    return `
      <div class="settings-row">
        <strong>更换伙伴</strong>
        <span>第一版使用 Champions 名单，后续可以接完整图鉴。</span>
        <select id="partner-select">
          ${champions.slice().sort((a,b) => a.num - b.num).map(p => `<option value="${p.num}" ${Number(state.partner.pkm_id) === Number(p.num) ? 'selected' : ''}>#${p.num} ${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="settings-row">
        <strong>公开展示</strong>
        <span>Supabase schema 已移植到 scripts 目录，可把这里接到 pkm_partner.is_public。</span>
      </div>
    `;
  }

  function bindPartnerBody(){
    $all('[data-partner-action]').forEach(btn => btn.addEventListener('click', () => partnerAction(btn.dataset.partnerAction)));
    const select = $('#partner-select');
    if(select) select.addEventListener('change', () => setPartner(Number(select.value)));
  }

  function partnerAction(action){
    const p = state.partner;
    const apply = {
      feed:      { hunger:16, mood:4, energy:0, bond:1, exp:4, text:'享用了一份食物。' },
      pat:       { hunger:0, mood:10, energy:0, bond:4, exp:2, text:'靠近你接受了抚摸。' },
      play:      { hunger:-4, mood:14, energy:-8, bond:5, exp:5, text:'和你玩了一会儿。' },
      train:     { hunger:-8, mood:-2, energy:-16, bond:2, exp:18, text:'完成了一轮训练。' },
      rest:      { hunger:-2, mood:4, energy:24, bond:1, exp:1, text:'舒服地休息了一下。' },
      adventure: { hunger:-8, mood:8, energy:-12, bond:8, exp:8, text:'和你短途冒险。' }
    }[action];
    if(!apply) return;
    ['hunger','mood','energy','bond'].forEach(key => {
      p[key] = Math.max(0, Math.min(100, Number(p[key] || 0) + Number(apply[key] || 0)));
    });
    p.exp = Number(p.exp || 0) + apply.exp;
    p.level = Math.max(Number(p.level || 1), 1 + Math.floor(p.exp / 80));
    p.updatedAt = new Date().toISOString();
    addPartnerLog(apply.text);
    savePartner();
    markTask('interact');
    renderPartner();
  }

  function bindControls(){
    $('#dex-filter').addEventListener('change', renderDex);
    $('#team-search').addEventListener('input', renderTeamPicks);
    $('#clear-team').addEventListener('click', () => {
      state.team = [];
      saveJson(STORAGE.team, state.team);
      renderBattle();
    });
    $all('[data-result]').forEach(btn => btn.addEventListener('click', () => addRecord(btn.dataset.result)));
    $('#reset-story').addEventListener('click', () => {
      state.story = {};
      saveJson(STORAGE.story, state.story);
      renderStory();
    });
    $('#lookup-search').addEventListener('input', renderLookupSearch);
    $('#lookup-format').addEventListener('change', e => { state.lookupFormat = e.target.value; renderLookup(); });
    $('#partner-orb').addEventListener('click', () => $('#partner-panel').classList.toggle('is-open'));
    $('#partner-close').addEventListener('click', () => $('#partner-panel').classList.remove('is-open'));
    $all('[data-partner-tab]').forEach(btn => btn.addEventListener('click', () => {
      state.partnerTab = btn.dataset.partnerTab;
      $all('[data-partner-tab]').forEach(item => item.classList.toggle('is-active', item === btn));
      renderPartnerBody();
    }));
  }

  async function init(){
    bindNavigation();
    bindControls();
    renderTodayFocus();
    loadPartner();
    await loadOfficialDex();
    renderDex();
    renderGames();
    renderBattle();
  }

  init();
})();
