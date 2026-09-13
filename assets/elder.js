/* ==========================================================================
   小暖陪伴 · 老人端脚本
   - 本地：语音按钮（找小暖）/ 一键呼叫 / 预警安抚弹层
   - 联动：接收操作台与子女端事件（预警安抚、吃药提醒、语音、
     呼叫、问候），并把奶奶的回复与状态实时回传
   ========================================================================== */
(function () {
  'use strict';

  function $(sel) { return document.querySelector(sel); }

  var XNB = window.XNB || null;
  function postT(type, data) { if (XNB) XNB.post(type, data); }
  function logT(text) { if (XNB) XNB.log('elder', text); }

  function pad(n) { return String(n).padStart(2, '0'); }
  function stamp() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* ---------- Toast ---------- */
  function toast(msg) {
    var w = $('#eToast'); if (!w) return;
    var t = document.createElement('div');
    t.className = 'e-toast'; t.textContent = msg;
    w.appendChild(t);
    setTimeout(function () { t.classList.add('hide'); }, 2600);
    setTimeout(function () { t.remove(); }, 3100);
  }

  /* ---------- 弹层 ---------- */
  function openOv(id) { var el = $(id); if (el) el.classList.add('open'); }
  function closeOv(id) { var el = $(id); if (el) el.classList.remove('open'); }
  function setText(sel, txt) { var el = $(sel); if (el) el.textContent = txt; }

  /* ---------- 顶部状态胶囊 ---------- */
  function setPill(id, state, txt) {
    var el = $(id); if (!el) return;
    el.classList.remove('warn', 'danger');
    if (state) el.classList.add(state);
    var t = el.querySelector('.txt');
    if (t && txt !== undefined) t.textContent = txt;
  }
  function okPill(id, txt) { setPill(id, '', txt); }

  /* ================= 场景响应 ================= */
  function heartAlarm() {
    setPill('#pill-heart', 'danger', '心率偏快');
    openOv('#comfortOverlay');
    logT('手环检测到心率异常 128 次/分，小暖开始安抚');
  }

  function fallAlarm() {
    setPill('#pill-act', 'danger', '疑似摔倒');
    openOv('#fallOverlay');
    logT('摄像头检测到疑似摔倒，小暖向奶奶确认情况');
  }

  function bpAlarm() {
    setPill('#pill-bp', 'warn', '血压偏高');
    openOv('#bpOverlay');
    logT('血压监测到偏高 158/95，小暖提醒休息');
  }

  function convFlow() {
    openOv('#convOverlay');
    logT('小暖发起关怀对话「嘉怡周六要来看您」');
  }

  function medRemind() {
    openOv('#medOverlay');
    logT('小暖语音提醒奶奶吃降压药');
  }

  function voiceIn(sec) {
    sec = sec || 5;
    toast('收到嘉怡的语音留言');
    logT('收到子女端语音关怀（' + sec + '秒）');
    setTimeout(function () {
      toast('✓ 已为奶奶播放语音留言');
      postT('listened', {});
      logT('奶奶收听了嘉怡的语音留言 → 已回执子女端');
    }, 2600);
  }

  function askFlow() {
    openOv('#askOverlay');
    logT('子女端发来问候，小暖替嘉怡询问奶奶近况');
  }

  function callIn(name) {
    setText('#callInName', (name || '嘉怡') + ' 来电');
    openOv('#callInOverlay');
    logT('子女端' + (name || '嘉怡') + '拨打进来，小暖辅助接听');
  }

  function callOut(name) {
    setText('#callOutName', '正在呼叫 ' + name + '…');
    setText('#callOutNote', '小暖正在帮您拨号');
    openOv('#callOutOverlay');
    postT('call.out', {});
    logT('奶奶想和' + name + '说话，小暖代拨（演示）');
    setTimeout(function () {
      setText('#callOutNote', '已接通（演示通话中）…');
    }, 2000);
  }

  /* ================= 三端事件监听 ================= */
  if (XNB) {
    XNB.on('scenario', function (m) {
      var k = m.data && m.data.kind;
      if (k === 'heart') heartAlarm();
      else if (k === 'fall') fallAlarm();
      else if (k === 'bp') bpAlarm();
      else if (k === 'conv') convFlow();
    });
    XNB.on('medicine', function () { medRemind(); });
    XNB.on('voice', function (m) { voiceIn(m.data && m.data.sec); });
    XNB.on('ask', function () { askFlow(); });
    XNB.on('call', function (m) { callIn(m.data && m.data.name); });
    XNB.on('handled', function () {
      toast('嘉怡已经知道啦，马上联系您 💚');
      logT('小暖向奶奶传达「家人已联系」，奶奶安心');
    });
    XNB.on('reset', function () { location.reload(); });
    XNB.join('elder');
    logT('老人端已上线，小暖开始今天的陪伴');
  }

  /* ================= 交互 ================= */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-e]');
    if (t) {
      var a = t.getAttribute('data-e');
      switch (a) {
        case 'comfort-close':
          closeOv('#comfortOverlay');
          okPill('#pill-heart', '心率正常');
          toast('心率回到 82 了 👍');
          logT('奶奶情绪稳定，心率恢复正常');
          break;
        case 'comfort-help':
          closeOv('#comfortOverlay');
          okPill('#pill-heart', '心率正常');
          postT('help', {});
          toast('正在联系嘉怡和建国…');
          logT('奶奶按下紧急呼叫 → 已向子女端发送求助');
          break;
        case 'fall-ok':
          closeOv('#fallOverlay');
          okPill('#pill-act', '活动正常');
          postT('elder.ok', {});
          toast('没事就好！以后起身慢一点哦');
          logT('奶奶确认「我没事」→ 已通知子女端');
          break;
        case 'fall-help':
          setText('#fallNote', '正在联系嘉怡和社区医院…');
          postT('help', {});
          logT('奶奶需要帮助 → 已向子女端发送紧急预警');
          setTimeout(function () {
            closeOv('#fallOverlay');
            setText('#fallNote', '');
            okPill('#pill-act', '活动正常');
            toast('小暖已经通知嘉怡和社区医院，马上就来！');
          }, 2600);
          break;
        case 'bp-close':
          closeOv('#bpOverlay');
          okPill('#pill-bp', '血压正常');
          toast('小暖帮您看着血压，别着急');
          logT('奶奶开始休息，血压逐步回落');
          break;
        case 'bp-help':
          closeOv('#bpOverlay');
          okPill('#pill-bp', '血压正常');
          postT('help', {});
          toast('正在联系嘉怡…');
          logT('奶奶在血压场景下呼叫了家人');
          break;
        case 'med-done':
          closeOv('#medOverlay');
          postT('medicine.done', { when: stamp() });
          toast('真棒奶奶！我告诉嘉怡啦');
          logT('奶奶已完成吃药 → 已回执子女端');
          break;
        case 'med-later':
          closeOv('#medOverlay');
          toast('好的，十分钟后小暖再提醒您');
          logT('奶奶说稍后再吃，小暖将再次提醒');
          break;
        case 'call-answer':
          closeOv('#callInOverlay');
          postT('call.answered', {});
          toast('嘉怡和您聊了 30 秒（演示通话）😊');
          logT('奶奶接听了电话（演示通话 30 秒）');
          break;
        case 'call-reject':
          closeOv('#callInOverlay');
          postT('call.rejected', {});
          logT('奶奶挂断了电话');
          break;
        case 'callout-close':
          closeOv('#callOutOverlay');
          break;
        case 'help-nothing':
          closeOv('#helpOverlay');
          toast('好呀，那咱们聊聊天，您今天想聊点什么？');
          break;
        case 'help-call':
          closeOv('#helpOverlay');
          callOut('嘉怡');
          break;
        case 'ask-good':
          closeOv('#askOverlay');
          postT('reply', { text: '挺好的' });
          toast('那太好啦，我这就告诉嘉怡！');
          logT('奶奶回复「挺好的」→ 已同步子女端');
          break;
        case 'ask-tired':
          closeOv('#askOverlay');
          postT('reply', { text: '有点累，想歇会儿' });
          toast('那您先歇着，我帮您定个 20 分钟后的闹钟');
          logT('奶奶回复「有点累」→ 已同步子女端');
          break;
        case 'ask-miss':
          closeOv('#askOverlay');
          postT('reply', { text: '想她们啦' });
          toast('嘉怡也想您，她周末就回来！');
          logT('奶奶回复「想她们啦」→ 已同步子女端');
          break;
        case 'conv-happy':
          closeOv('#convOverlay');
          postT('reply', { text: '高兴，这丫头总惦记我' });
          toast('那太好啦，我这就告诉嘉怡 😊');
          logT('奶奶期待嘉怡回家 → 已同步子女端');
          break;
        case 'conv-maybe':
          closeOv('#convOverlay');
          toast('好嘞，那咱们周六再说～');
          break;
      }
      return;
    }

    if (e.target.closest('#voiceBtn')) {
      var vb = $('#voiceBtn');
      if (vb) {
        vb.classList.add('listening');
        setTimeout(function () { vb.classList.remove('listening'); }, 1600);
      }
      openOv('#helpOverlay');
      logT('奶奶点击「跟小暖说话」');
    }
  });
})();