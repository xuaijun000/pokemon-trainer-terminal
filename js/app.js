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

  const state = {
    view: 'dex',
    query: '',
    officialDex: [],
    activeDexId: null,
    team: loadJson(STORAGE.team, []),
    records: loadJson(STORAGE.records, []),
    story: loadJson(STORAGE.story, {}),
    partner: null,
    partnerTab: 'status',
    encountersKey: ''
  };

  const registry = window.BATTLE_REGISTRY?.champions || {};
  const champions = registry.pkm || [];
  const moves = registry.moves || [];
  const items = registry.items || [];
  const championsByNum = new Map(champions.map(p => [Number(p.num), p]));
  const championsBySlug = new Map(champions.map(p => [p.slug, p]));

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

  function getDexEntries(){
    const official = state.officialDex.length
      ? state.officialDex.map(row => {
          const c = championsByNum.get(Number(row.id));
          return { id:Number(row.id), zhName:row.zhName, descZh:row.descZh, champion:c, types:c?.types || [], stats:c?.stats || null, spriteUrl:c?.spriteUrl };
        })
      : champions.map(p => ({ id:Number(p.num), zhName:p.name, descZh:'Champions 对战数据已移植。完整中文图鉴可通过本地服务器载入 JSON 后显示。', champion:p, types:p.types || [], stats:p.stats || null, spriteUrl:p.spriteUrl }));
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
    state.activeDexId = id;
    markTask('pokedex');
    const entry = getDexEntries().find(e => e.id === id);
    if(!entry) return;
    const stats = entry.stats || {};
    $('#dex-detail').innerHTML = `
      <div class="pkm-detail">
        <div class="pkm-detail-top">
          <div class="pkm-art"><img src="${esc(spriteFor(entry))}" alt=""></div>
          <div>
            <p class="eyebrow">#${String(entry.id).padStart(4,'0')}</p>
            <h3>${esc(entry.zhName)}</h3>
            ${typePills(entry.types)}
            <p class="pkm-desc">${esc(entry.descZh || '暂无中文描述。')}</p>
          </div>
        </div>
        ${entry.stats ? `
          <div class="stat-list">
            ${Object.entries(STAT_LABEL).map(([key,label]) => {
              const value = Number(stats[key] || 0);
              return `<div class="stat-row"><span>${label}</span><span class="stat-bar"><span class="stat-fill" style="width:${Math.min(100,value / 160 * 100)}%"></span></span><b>${value}</b></div>`;
            }).join('')}
          </div>
        ` : '<p class="pkm-desc">这只宝可梦暂未接入 Champions 种族值数据。</p>'}
        <div class="detail-actions">
          <button class="action-btn primary" type="button" id="detail-add-team">加入队伍</button>
          <button class="action-btn" type="button" id="detail-set-partner">设为伙伴</button>
        </div>
      </div>
    `;
    $('#detail-add-team').addEventListener('click', () => addToTeam(entry.id));
    $('#detail-set-partner').addEventListener('click', () => setPartner(entry.id));
    renderDex();
  }

  function renderGames(){
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

  function renderBattle(){
    renderTeam();
    renderTeamPicks();
    renderMoves();
    renderItems();
    renderRecords();
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
