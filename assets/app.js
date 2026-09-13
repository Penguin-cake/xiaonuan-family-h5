/* ==========================================================================
   小暖陪伴 · 子女端 H5 Demo v2 — 共享交互脚本
   依赖：assets/styles.css
   所有页面通过 data-action 事件委托驱动交互（无需内联 onclick）
   演示场景状态通过 localStorage（xn_*）跨页面持久化
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- 工具 ---------- */
  var $  = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var page = document.body.getAttribute('data-page') || '';
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('xn_' + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) { try { localStorage.setItem('xn_' + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('xn_' + k); } catch (e) {} },
    clearAll: function () { ['demo', 'persona', 'toggles', 'tags'].forEach(this.del, this); }
  };
  /* ---------- 三端通信桥 ---------- */
  var XNB = window.XNB || null;
  function postBus(type, data) { if (XNB) XNB.post(type, data); }
  function busLog(text) { if (XNB) XNB.log('family', text); }

  function closeByClass(sel) { var el = $(sel); if (el) el.classList.remove('open'); }
  function openByClass(sel) { var el = $(sel); if (el) el.classList.add('open'); }
  function setText(sel, v) { var el = $(sel); if (el) el.textContent = v; }

  /* ---------- Toast ---------- */
  function toast(msg) {
    var wrap = $('#toastWrap');
    if (!wrap) return;
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () { t.classList.add('hide'); }, 2500);
    setTimeout(function () { t.remove(); }, 3000);
  }

  /* ---------- 状态栏实时时钟 ---------- */
  function tickClock() {
    var el = $('#sbClock');
    if (!el) return;
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    el.textContent = p(d.getHours()) + ':' + p(d.getMinutes());
  }
  tickClock();
  setInterval(tickClock, 15 * 1000);

  /* ---------- 演示场景定义 ---------- */
  var SCENARIOS = {
    heart: {
      icon: '❤️‍🔥', title: '严重预警 · 心率异常',
      bodyHtml: '奶奶心率 <b>128</b> 次/分',
      time: '刚刚触发 · 已超时 3 分钟',
      bannerHtml: '奶奶心率异常 128次/分<br><small style="font-weight:500;opacity:.8">刚刚触发 · 请立即处理</small>',
      det: [['hrValue', '128', true], ['hrStatus', '异常', true]]
    },
    fall: {
      icon: '🆘', title: '紧急预警 · 摔倒检测',
      bodyHtml: '摄像头检测到奶奶可能摔倒',
      time: '刚刚触发 · 请立即确认',
      bannerHtml: '检测到奶奶可能摔倒<br><small style="font-weight:500;opacity:.8">刚刚触发 · 请立即确认</small>',
      det: [['camValue', '异常', true], ['camStatus', '异常', true]]
    },
    bp: {
      icon: '🩺', title: '异常提醒 · 血压偏高',
      bodyHtml: '奶奶血压 <b>158/95</b> mmHg',
      time: '10 分钟前触发',
      bannerHtml: '奶奶血压偏高 158/95<br><small style="font-weight:500;opacity:.8">10 分钟前触发 · 请提醒休息</small>',
      det: [['bpValue', '158/95', true], ['bpStatus', '偏高', true]]
    }
  };

  /* ---------- 首页：检测数据与预警横幅 ---------- */
  function setDet(id, text, warn) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('warn', !!warn);
  }
  function setBanner(html, state) {
    var banner = $('#alertBanner'), txt = $('#alertBannerText');
    if (!banner || !txt) return;
    txt.innerHTML = html;
    banner.className = 'alert-top ' + state;
  }
  function applyHome(type) {
    var s = SCENARIOS[type];
    s.det.forEach(function (u) { setDet(u[0], u[1], u[2]); });
    setBanner(s.bannerHtml, 'red');
  }

  /* ---------- 预警弹层 + AI 电话流程 ---------- */
  function openAlert(sc) {
    var overlay = $('#alertOverlay');
    if (!overlay) return;
    setText('#alertIcon', sc.icon);
    setText('#alertTitle', sc.title);
    var body = $('#alertBody'); if (body) body.innerHTML = sc.bodyHtml;
    setText('#alertTime', sc.time);
    overlay.classList.add('open');
  }
  function closeAlert(markDone) {
    closeByClass('#alertOverlay');
    if (markDone && page === 'home') {
      var title = ($('#alertTitle') || {}).textContent || '当前预警';
      setBanner('已处理：' + title + '<br><small style="font-weight:500;opacity:.8">您已标记处理完毕</small>', 'green');
    }
    toast('✅ 已标记处理完毕');
  }

  var callTimers = [];
  function resetCallFlow() {
    callTimers.forEach(clearTimeout);
    callTimers = [];
    var s3 = $('#callStep3'), s3s = $('#callStatus3'), cs = $('#callStatus');
    if (s3) { s3.classList.add('active'); s3.classList.remove('done'); s3.textContent = '3'; }
    if (s3s) { s3s.textContent = '待拨打'; s3s.classList.remove('ok'); }
    if (cs) { cs.textContent = '⏳ 正在拨打中……'; cs.classList.remove('done'); }
  }
  function openCallFlow() {
    var modal = $('#aiCallModal');
    if (!modal) return;
    resetCallFlow();
    modal.classList.add('open');
    callTimers.push(setTimeout(function () {
      var s3 = $('#callStep3'), s3s = $('#callStatus3'), cs = $('#callStatus');
      if (s3) { s3.classList.remove('active'); s3.classList.add('done'); s3.textContent = '✓'; }
      if (s3s) { s3s.textContent = '已接通'; s3s.classList.add('ok'); }
      if (cs) cs.textContent = '✅ 朝阳区社区医院已接通，正在说明情况';
    }, 2000));
    callTimers.push(setTimeout(function () {
      var cs = $('#callStatus');
      if (cs) { cs.textContent = '☑ 呼叫流程结束，社区医院将安排上门查看'; cs.classList.add('done'); }
    }, 4400));
  }
  function closeCallFlow() {
    closeByClass('#aiCallModal');
    resetCallFlow();
  }

  /* ---------- 远程关怀（首页）：录音交互 ---------- */
  var remote = {
    sec: 0, timer: null, busy: false,
    openRecorder: function () {
      var list = $('#remoteList'), rec = $('#recorderView');
      if (list) list.hidden = true;
      if (rec) rec.hidden = false;
      this.resetRec();
    },
    resetRec: function () {
      clearInterval(this.timer); this.timer = null; this.busy = false; this.sec = 0;
      var mic = $('#recMic'), t = $('#recTimer'), w = $('#recWave'), h = $('#recHint');
      if (mic) mic.classList.remove('recording');
      if (t) { t.textContent = '0:00'; t.classList.remove('recording'); }
      if (w) w.classList.remove('active');
      if (h) h.textContent = '点击麦克风开始录音';
      ['#recPlay', '#recRedo', '#recSend'].forEach(function (s) {
        var b = $(s); if (b) b.disabled = true;
      });
    },
    toggleRec: function () {
      var mic = $('#recMic'), t = $('#recTimer'), w = $('#recWave'), h = $('#recHint');
      if (!mic) return;
      this.busy = !this.busy;
      if (this.busy) {
        mic.classList.add('recording');
        if (w) w.classList.add('active');
        if (t) t.classList.add('recording');
        if (h) h.textContent = '录音中…点击停止';
        var self = this, start = Date.now();
        this.timer = setInterval(function () {
          self.sec = (Date.now() - start) / 1000;
          var m = Math.floor(self.sec / 60), s = Math.floor(self.sec % 60);
          if (t) t.textContent = m + ':' + String(s).padStart(2, '0');
        }, 200);
      } else {
        clearInterval(this.timer); this.timer = null;
        mic.classList.remove('recording');
        if (w) w.classList.remove('active');
        if (t) t.classList.remove('recording');
        if (h) h.textContent = '录音完成，可试听或发送';
        var pb = $('#recPlay'), rb = $('#recRedo'), sb = $('#recSend');
        if (pb) pb.disabled = false;
        if (rb) rb.disabled = false;
        if (sb) sb.disabled = false;
      }
    },
    play: function () {
      var t = $('#recTimer');
      toast('▶ 正在试听（' + (t ? t.textContent : '0:00') + '）… 播放完毕');
    },
    send: function () {
      var sec = Math.max(1, Math.round(this.sec || 3));
      toast('🎤 语音关怀已发送，小暖将在奶奶端播放');
      this.exit();
      postBus('voice', { sec: sec });
      busLog('子女端：发送语音关怀（' + sec + '秒）→ 老人端');
    },
    exit: function () {
      this.resetRec();
      var list = $('#remoteList'), rec = $('#recorderView');
      if (list) list.hidden = false;
      if (rec) rec.hidden = true;
      closeByClass('#remoteSheet');
    }
  };

  /* ---------- 关怀页：新增对话 ---------- */
  function insertConversation(silent) {
    var list = $('#convList');
    if (!list || $('#conv-new')) return;
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    var time = p(d.getHours()) + ':' + p(d.getMinutes());
    var li = document.createElement('li');
    li.className = 'calm open';
    li.id = 'conv-new';
    li.setAttribute('data-action', 'conv-toggle');
    li.innerHTML =
      '<div class="conv-head"><span class="tt">' + time + '</span>' +
      '<span class="conv-topic">睡前关怀</span>' +
      '<span class="conv-mood calm">平静</span>' +
      '<span class="conv-chev">›</span></div>' +
      '<div class="conv-expand open">' +
        '<div class="item"><span class="role">小暖</span><span>奶奶，睡前记得量一下血压，顺手把手环充上电哦。</span></div>' +
        '<div class="item"><span class="role">奶奶</span><span>好，我这就去量。</span></div>' +
        '<div class="item"><span class="role">小暖</span><span>奶奶真配合！测完早点休息，明天见～</span></div>' +
      '</div>';
    list.insertBefore(li, list.firstChild);
    var cnt = $('#statConvCount');
    if (cnt) cnt.textContent = ((parseInt(cnt.textContent, 10) || 0) + 1) + ' 次';
    if (!silent) toast('💬 已新增一条对话记录');
  }

  /* ---------- 记录页：新增预警记录 ---------- */
  function insertAlertRecord(kind) {
    var wrap = $('#alertList');
    if (!wrap) return;
    var defs = {
      heart: { lvl: 'red', icon: '🔴', t: '刚刚 · 心率 128 次/分', s: '严重预警，AI已自动通知家属并安抚老人', badge: '✅ 已处理' },
      fall: { lvl: 'red', icon: '🆘', t: '刚刚 · 疑似摔倒', s: '摄像头检测到疑似摔倒，请立即与奶奶确认', badge: '✅ 已确认' },
      bp: { lvl: 'orange', icon: '🩺', t: '刚刚 · 血压 158/95', s: '血压偏高，已提醒奶奶静坐休息并监测', badge: '✅ 已提醒' },
      lowActivity: { lvl: 'orange', icon: '🟠', t: '刚刚 · 活动量骤降', s: '今日上午活动量低于日常水平，小暖已主动询问', badge: '⏳ 待关注', pending: true }
    };
    var d = defs[kind];
    if (!d) return;
    var card = document.createElement('div');
    card.className = 'alert-card ' + d.lvl;
    card.innerHTML =
      '<span class="ico">' + d.icon + '</span>' +
      '<div class="txt"><div class="t">' + d.t + '</div>' +
      '<div class="s">' + d.s + '</div>' +
      '<span class="process ' + (d.pending ? 'pending' : 'done') + '">' + d.badge + '</span></div>';
    wrap.insertBefore(card, wrap.firstChild);
    if (d.pending) {
      setTimeout(function () {
        var p = card.querySelector('.process');
        if (p) { p.className = 'process done'; p.textContent = '✅ 已关注'; }
      }, 4000);
    }
    toast('🟠 已新增一条预警记录');
  }

  /* ---------- 演示场景触发（跨页面） ---------- */
  function triggerLocal(type) {
    closeByClass('#demoPanel');
    var st = store.get('demo', {});
    if (type === 'heart' || type === 'fall' || type === 'bp') {
      st[type] = true;
      store.set('demo', st);
      openAlert(SCENARIOS[type]);
      if (page === 'home') applyHome(type);
      toast('🔴 老人端检测到异常，已同步至子女端');
      return;
    }
    if (type === 'conv') {
      st.conv = true;
      store.set('demo', st);
      if (page === 'care') { insertConversation(false); }
      else { location.href = 'care.html#new'; }
      return;
    }
    if (type === 'alert') {
      st.alert = true;
      store.set('demo', st);
      if (page === 'records') { insertAlertRecord('lowActivity'); }
      else { location.href = 'records.html#new'; }
      return;
    }
  }

  /* 本端主动触发：本地生效 + 广播给老人端 / 操作台 */
  function trigger(type) {
    triggerLocal(type);
    postBus('scenario', { kind: type, from: 'family' });
    busLog('子女端：下发场景「' + type + '」');
  }

  /* 页面加载时恢复演示场景（跨页面持久化） */
  function applyDemoState() {
    var st = store.get('demo', {});
    if (page === 'home') {
      if (st.bp) applyHome('bp');
      if (st.heart) applyHome('heart');
      if (st.fall) applyHome('fall');
    }
    if (page === 'care' && st.conv) insertConversation(true);
    if (page === 'records') {
      if (st.bp) insertAlertRecord('bp');
      if (st.heart) insertAlertRecord('heart');
      if (st.fall) insertAlertRecord('fall');
      if (st.alert) insertAlertRecord('lowActivity');
    }
  }

  /* ---------- 我的页：小暖人设 ---------- */
  var PERSONAS = [
    {
      id: 'gentle', ico: '👧', name: '温柔耐心孙女',
      desc: '称呼“奶奶”，温柔耐心像亲孙女，语速放慢、咬字清楚',
      rows: { '称呼方式': '奶奶', '性格风格': '温柔耐心，像亲孙女', '说话语速': '慢一点，咬字清楚', '爱聊话题': '家常、京剧、儿孙近况', '禁区话题': '丁爷爷（已故）' }
    },
    {
      id: 'humor', ico: '👴', name: '幽默唠嗑老友',
      desc: '称呼“王大姐”，风趣幽默爱开玩笑，语速适中',
      rows: { '称呼方式': '王大姐', '性格风格': '风趣幽默，爱开玩笑', '说话语速': '语速适中', '爱聊话题': '新闻趣事、老歌、老物件', '禁区话题': '疾病细节' }
    },
    {
      id: 'health', ico: '🧑‍⚕️', name: '沉稳健康管家',
      desc: '称呼“王阿姨”，简洁专业有条理，按时提醒起居用药',
      rows: { '称呼方式': '王阿姨', '性格风格': '简洁专业，有条理', '说话语速': '适中清晰', '爱聊话题': '健康数据、锻炼计划', '禁区话题': '无' }
    }
  ];
  function renderPersona(id) {
    var p = PERSONAS.filter(function (x) { return x.id === id; })[0] || PERSONAS[0];
    $$('.persona-option').forEach(function (o) {
      var sel = o.getAttribute('data-id') === p.id;
      o.classList.toggle('selected', sel);
      var ck = o.querySelector('.p-check');
      if (ck) ck.textContent = sel ? '✓' : '';
    });
    setText('#pCur', p.name);
    setText('#pCall', p.rows['称呼方式']);
    setText('#pChar', p.rows['性格风格']);
    setText('#pSpeed', p.rows['说话语速']);
    setText('#pTopic', p.rows['爱聊话题']);
    setText('#pSafe', p.rows['禁区话题']);
    store.set('persona', { id: p.id });
  }

  /* ---------- 我的页：爱好标签 ---------- */
  function renderTags() {
    var wrap = $('#hobbyTags');
    if (!wrap || !$('#tagAddChip')) return;
    var tags = store.get('tags', []);
    tags.forEach(function (t) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = '🏷 ' + t;
      wrap.insertBefore(chip, $('#tagAddChip'));
    });
  }
  function addTag() {
    var input = $('#tagInput');
    var v = (input && input.value || '').trim();
    if (!v) { toast('⚠️ 请输入标签内容'); return; }
    var tags = store.get('tags', []);
    tags.push(v);
    store.set('tags', tags);
    renderTags();
    closeByClass('#tagSheet');
    if (input) input.value = '';
    toast('🏷 已添加标签「' + v + '」');
  }

  /* ---------- 我的页：通知开关 ---------- */
  function renderToggles() {
    var tf = store.get('toggles', {});
    $$('.toggle').forEach(function (t) {
      var key = t.getAttribute('data-key');
      var on = key && key in tf ? tf[key] : true;
      t.classList.toggle('on', on);
    });
  }

  /* ---------- 事件委托 ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]');
    if (t) {
      var act = t.getAttribute('data-action');
      /* 遮罩点击关闭：仅点到遮罩本身才关闭 */
      if (act === 'overlay-close') {
        if (e.target === t) t.classList.remove('open');
        return;
      }
      switch (act) {
        case 'demo-toggle': { var dp = $('#demoPanel'); if (dp) dp.classList.toggle('open'); break; }
        case 'demo-close': closeByClass('#demoPanel'); break;
        case 'scenario-heart': trigger('heart'); break;
        case 'scenario-fall': trigger('fall'); break;
        case 'scenario-bp': trigger('bp'); break;
        case 'scenario-conv': trigger('conv'); break;
        case 'scenario-alert': trigger('alert'); break;
        case 'reset-demo':
          postBus('reset', {}); busLog('子女端：重置演示数据（已广播）');
          store.clearAll(); location.reload(); break;
        case 'alert-open': openAlert(SCENARIOS.heart); break;
        case 'alert-ok': {
          closeAlert(true);
          var tt = ($('#alertTitle') || {}).textContent || '当前预警';
          postBus('handled', { title: tt });
          busLog('子女端：预警「' + tt + '」已标记处理完毕 → 老人端安抚');
          break;
        }
        case 'call-open': openCallFlow(); break;
        case 'call-close': closeCallFlow(); break;
        case 'remote-open': openByClass('#remoteSheet'); break;
        case 'remote-close': remote.exit(); break;
        case 'remote-record': remote.openRecorder(); break;
        case 'remote-medicine':
          toast('💊 已发送：小暖将在奶奶端语音提醒吃药'); closeByClass('#remoteSheet');
          postBus('medicine', {}); busLog('子女端：发送吃药提醒 → 老人端'); break;
        case 'remote-ask':
          toast('💬 已发送：小暖将替您问候奶奶今天的情况'); closeByClass('#remoteSheet');
          postBus('ask', {}); busLog('子女端：发送问候 → 老人端小暖代问'); break;
        case 'rec-toggle': remote.toggleRec(); break;
        case 'rec-play': remote.play(); break;
        case 'rec-redo': remote.resetRec(); break;
        case 'rec-send': remote.send(); break;
        case 'chat-toggle': {
          var hl = t.closest('.chat-highlight');
          if (hl) {
            hl.classList.toggle('open');
            var d = hl.querySelector('.chat-detail');
            if (d) d.classList.toggle('open');
          }
          break;
        }
        case 'conv-toggle': {
          if (e.target.closest('.conv-expand')) return;
          var li = t.closest('li');
          if (li) {
            li.classList.toggle('open');
            var d = li.querySelector('.conv-expand');
            if (d) d.classList.toggle('open');
          }
          break;
        }
        case 'det-toast': toast(t.getAttribute('data-toast') || ''); break;
        case 'persona-open': openByClass('#personaSheet'); break;
        case 'persona-select': renderPersona(t.getAttribute('data-id')); closeByClass('#personaSheet'); break;
        case 'tag-open': {
          openByClass('#tagSheet');
          var ti = $('#tagInput');
          if (ti) setTimeout(function () { ti.focus(); }, 280);
          break;
        }
        case 'tag-confirm': addTag(); break;
        case 'tag-cancel': closeByClass('#tagSheet'); break;
        case 'persona-close': closeByClass('#personaSheet'); break;
        case 'call-person': {
          var n = t.getAttribute('data-name') || '联系人';
          toast('📞 正在呼叫 ' + n + ' …');
          postBus('call', { name: n });
          busLog('子女端：向 ' + n + ' 发起呼叫 → 老人端来电');
          break;
        }
      }
      return;
    }
    /* 开关切换 */
    var tg = e.target.closest('.toggle');
    if (tg) {
      var key = tg.getAttribute('data-key');
      var tf = store.get('toggles', {});
      var next = !tg.classList.contains('on');
      tg.classList.toggle('on', next);
      tf[key] = next;
      store.set('toggles', tf);
    }
  });

  /* Esc 关闭所有弹层 */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      $$('.demo-panel.open,.alert-overlay.open,.ai-call-modal.open,.remote-sheet.open,.sheet-overlay.open')
        .forEach(function (el) { el.classList.remove('open'); });
    }
  });

  /* ---------- 初始化 ---------- */
  applyDemoState();
  renderPersona(store.get('persona', { id: 'gentle' }).id);
  renderToggles();
  renderTags();

  /* ---------- 三端联动：监听其他端事件 ---------- */
  if (XNB) {
    /* 操作台（或演示面板）下发的场景 → 本端执行本地效果 */
    XNB.on('scenario', function (m) {
      var d = m.data || {};
      triggerLocal(d.kind);
    });
    /* 子女端处理预警后，老人端由小暖转达（本端仅提示） */
    XNB.on('handled', function () {
      toast('🤖 老人端：小暖已告诉奶奶家里人都知道啦，奶奶安心了');
    });
    /* 老人端收听语音关怀回执 */
    XNB.on('listened', function () {
      toast('🎧 奶奶刚刚听完您的语音关怀，心情不错');
    });
    /* 老人端吃药回执 */
    XNB.on('medicine.done', function (m) {
      toast('💊 收到确认：奶奶已按时吃药（' + ((m.data && m.data.when) || '刚刚') + '）');
    });
    /* 老人端摔倒后选择「需要帮助」 */
    XNB.on('help', function () {
      var st = store.get('demo', {});
      st.fall = true;
      store.set('demo', st);
      if (page === 'home') applyHome('fall');
      openAlert(SCENARIOS.fall);
      toast('🆘 老人端：奶奶需要帮助，请立即处理');
    });
    /* 老人端摔倒后选择「我没事」 */
    XNB.on('elder.ok', function () {
      toast('😌 老人端：奶奶说「我没事」，虚惊一场');
    });
    /* 奶奶的回复 */
    XNB.on('reply', function (m) {
      toast('💬 奶奶说：「' + ((m.data && m.data.text) || '好') + '」');
    });
    /* 老人端主动呼叫家人 */
    XNB.on('call.out', function () {
      toast('📞 奶奶想和您说话，小暖已代拨（演示）');
    });
    /* 来电结果 */
    XNB.on('call.answered', function () {
      toast('✅ 奶奶已接听您的电话（演示通话）');
    });
    XNB.on('call.rejected', function () {
      toast('📵 奶奶暂时没有接听，稍后再拨试试');
    });
    /* 操作台重置 */
    XNB.on('reset', function () {
      store.clearAll();
      location.reload();
    });
    XNB.join('family');
  }
})();