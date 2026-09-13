/* ==========================================================================
   小暖陪伴 Demo — 三端实时通信桥
   老人端 / 子女端 / 操作台 之间的事件总线
   - 优先使用 BroadcastChannel（同浏览器跨标签页实时互推）
   - 不支持时降级为 localStorage + storage 事件
   - 发端不会收到自己的消息，可避免事件循环
   消息协议：
     hello / hb        { role }                    上线与心跳（操作台据此检测在线）
     scenario          { kind: heart|fall|bp|conv } 场景下发
     handled           { title }                    子女端处理完毕 → 老人端安抚
     voice             { sec }                      语音关怀 → 老人端
     listened          {}                           老人端已收听 → 子女端
     medicine          {}                           吃药提醒 → 老人端
     medicine.done     { when }                     老人端已吃药 → 子女端
     ask               {}                           子女端问候 → 老人端
     reply             { text }                     奶奶回复 → 子女端
     call              { name }                     子女端拨号 → 老人端来电
     call.answered / call.rejected                 老人端接听/挂断 → 子女端
     call.out          {}                           老人端主动呼叫 → 子女端
     elder.ok / help   {}                           摔倒自检结果 → 子女端
     reset             {}                           重置两端演示数据
     log               { from, text }               各端行为 → 操作台事件流
   ========================================================================== */
(function () {
  'use strict';

  var CHAN = 'xiaonuan3';
  var LSKEY = 'xn_bus';
  var seq = 0;
  var handlers = {};

  var bc = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel(CHAN);
  } catch (e) { bc = null; }

  function emit(msg) {
    var fns = handlers[msg.type];
    if (!fns) return;
    fns.slice().forEach(function (fn) { try { fn(msg); } catch (e) {} });
  }

  function post(type, data) {
    var msg = {
      id: 'm' + (++seq) + '-' + Math.random().toString(36).slice(2, 8),
      t: Date.now(),
      type: type,
      data: data || {}
    };
    if (bc) {
      bc.postMessage(msg);
    } else {
      try { localStorage.setItem(LSKEY, JSON.stringify(msg)); } catch (e) {}
    }
    return msg;
  }

  function on(type, fn) {
    (handlers[type] = handlers[type] || []).push(fn);
    return function () {
      handlers[type] = (handlers[type] || []).filter(function (f) { return f !== fn; });
    };
  }

  if (bc) {
    bc.onmessage = function (e) { emit(e.data); };
  } else {
    window.addEventListener('storage', function (e) {
      if (e.key !== LSKEY || !e.newValue) return;
      try { emit(JSON.parse(e.newValue)); } catch (err) {}
    });
  }

  /* 角色进群：立即打招呼，之后每 5 秒心跳 */
  function join(role) {
    post('hello', { role: role });
    setInterval(function () { post('hb', { role: role }); }, 5000);
  }

  /* 便捷：把本端行为写入操作台事件流 */
  function log(role, text) {
    post('log', { from: role, text: text });
  }

  window.XNB = { post: post, on: on, join: join, log: log, CHAN: CHAN };
})();