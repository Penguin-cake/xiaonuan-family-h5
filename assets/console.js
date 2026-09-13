/* ==========================================================================
   小暖陪伴 · 三端联调操作台脚本
   - 在线检测：监听老人端 / 子女端心跳
   - 场景下发：向两端广播事件
   - 实时事件流：汇总三端 log 事件
   ========================================================================== */
(function () {
  'use strict';

  function $(sel) { return document.querySelector(sel); }

  var XNB = window.XNB || null;
  var lastSeen = { elder: 0, family: 0 };
  var seenOnce = { elder: false, family: false };

  function pad(n) { return String(n).padStart(2, '0'); }
  function stamp(ts) {
    var d = ts ? new Date(ts) : new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  /* ---------- 事件流 ---------- */
  var SRC_NAME = { elder: '老人端', family: '子女端', op: '操作台', sys: '系统' };
  function addLog(from, text) {
    var box = $('#cLog'); if (!box) return;
    var line = document.createElement('div');
    line.className = 'c-line ' + (from || 'sys');
    line.innerHTML = '<time>' + stamp() + '</time>'
      + '<span class="c-src">' + (SRC_NAME[from] || '系统') + '</span>'
      + '<span class="c-txt">' + text + '</span>';
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  /* ---------- 在线状态 ---------- */
  function setOnline(role, on) {
    var pill = $(role === 'elder' ? '#pillElder' : '#pillFamily');
    var dev = $(role === 'elder' ? '#devElder' : '#devFamily');
    var label = role === 'elder' ? '老人端' : '子女端';
    if (pill) {
      pill.className = 'c-pill ' + (on ? 'ok' : (seenOnce[role] ? 'off' : 'wait'));
      pill.textContent = on
        ? '🟢 ' + label + ' · 在线'
        : (seenOnce[role] ? '🔴 ' + label + ' · 已离线' : '🟡 ' + label + ' · 等待接入');
    }
    if (dev) {
      dev.className = 'c-dev ' + (on ? 'on' : 'off');
      var sub = dev.querySelector('.c-dev-txt span');
      if (sub) sub.textContent = on ? '已连接 · 心跳正常' : (seenOnce[role] ? '连接中断' : '未连接');
    }
  }

  function checkOnline() {
    var now = Date.now();
    setOnline('elder', now - lastSeen.elder < 9000);
    setOnline('family', now - lastSeen.family < 9000);
  }

  function dispatch(type, data) { if (XNB) XNB.post(type, data); }

  /* ---------- 三端事件 ---------- */
  if (XNB) {
    XNB.on('hello', function (m) {
      var r = m.data && m.data.role;
      if (r !== 'elder' && r !== 'family') return;
      lastSeen[r] = m.t || Date.now();
      if (!seenOnce[r]) {
        seenOnce[r] = true;
        addLog(r, '已接入操作台');
      }
    });
    XNB.on('hb', function (m) {
      var r = m.data && m.data.role;
      if (r === 'elder' || r === 'family') lastSeen[r] = m.t || Date.now();
    });
    XNB.on('log', function (m) {
      var d = m.data || {};
      addLog(d.from || 'sys', d.text || '');
    });
    XNB.join('console');
  }
  setInterval(checkOnline, 3000);
  checkOnline();
  addLog('sys', '操作台就绪：房间号 ' + (XNB ? XNB.room : '默认') + '（同房间三端可跨设备联动）');
  addLog('sys', '请在新标签页或其他设备（手机）打开老人端与子女端');

  /* ---------- 按钮 ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-c]');
    if (!t) return;
    var a = t.getAttribute('data-c');
    switch (a) {
      case 'sc-heart':
        dispatch('scenario', { kind: 'heart' });
        addLog('op', '下发场景：心率异常 128 次/分');
        break;
      case 'sc-fall':
        dispatch('scenario', { kind: 'fall' });
        addLog('op', '下发场景：疑似摔倒');
        break;
      case 'sc-bp':
        dispatch('scenario', { kind: 'bp' });
        addLog('op', '下发场景：血压偏高 158/95');
        break;
      case 'sc-conv':
        dispatch('scenario', { kind: 'conv' });
        addLog('op', '下发场景：小暖关怀对话');
        break;
      case 'medicine':
        dispatch('medicine', {});
        addLog('op', '代子女端发送吃药提醒');
        break;
      case 'voice':
        dispatch('voice', { sec: 12 });
        addLog('op', '代子女端发送语音关怀（12秒）');
        break;
      case 'ask':
        dispatch('ask', {});
        addLog('op', '代子女端问候奶奶');
        break;
      case 'clear-log':
        $('#cLog').innerHTML = '';
        break;
      case 'reset':
        try {
          localStorage.removeItem('xn_demo');
          localStorage.removeItem('xn_persona');
          localStorage.removeItem('xn_toggles');
          localStorage.removeItem('xn_tags');
        } catch (err) {}
        dispatch('reset', {});
        addLog('op', '下发重置指令，两端即将恢复初始状态');
        break;
      case 'open-ends':
        window.open('elder.html', '_blank');
        window.open('index.html', '_blank');
        addLog('op', '已在新标签页打开老人端与子女端');
        break;
    }
  });
})();