/* ==========================================================================
   小暖陪伴 Demo — 三端实时通信桥（v2 · 支持跨设备）
   老人端 / 子女端 / 操作台 之间的事件总线
   - 通道 1：MQTT over WSS（EMQX 公共 Broker）→ 跨设备 / 跨浏览器实时互通
   - 通道 2：BroadcastChannel → 同浏览器跨标签页实时互推（更低延迟）
   - 通道 3：localStorage + storage 事件（兜底）
   - 同一条消息可能经多个通道到达，按消息 id 去重，避免重复触发
   房间机制：URL 追加 ?room=xxx 可自定义房间号（默认 xiaonuan-2026）
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

  /* ---------- 房间号（三端同房间即可互通） ---------- */
  var room = 'xiaonuan-2026';
  try {
    var rm = location.search.match(/[?&]room=([^&]+)/);
    if (rm) {
      var r = decodeURIComponent(rm[1]).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      if (r) room = r;
    }
  } catch (e) {}

  var MQTT_TOPIC = 'xiaonuan-h5/' + room + '/bus';
  var MQTT_BROKERS = [
    'wss://broker-cn.emqx.io:8084/mqtt',   // EMQX 公共 Broker · 国内（腾讯云上海）
    'wss://broker.emqx.io:8084/mqtt'       // EMQX 公共 Broker · 国际
  ];
  var MQTT_CDN = [
    'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js',
    'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js'
  ];

  /* ---------- 本地事件分发 ---------- */
  function emit(msg) {
    var fns = handlers[msg.type];
    if (!fns) return;
    fns.slice().forEach(function (fn) { try { fn(msg); } catch (e) {} });
  }

  /* 去重：同一条消息可能经 MQTT + BC 双通道各到达一次 */
  var seen = {};
  var seenAt = Date.now();
  function emitOnce(msg) {
    if (!msg || !msg.id) { emit(msg); return; }
    if (seen[msg.id]) return;
    seen[msg.id] = true;
    if (Date.now() - seenAt > 60000) {
      seen = {};
      seen[msg.id] = true;
      seenAt = Date.now();
    }
    emit(msg);
  }

  /* ---------- 同步通道：BroadcastChannel（localStorage 兜底） ---------- */
  var bc = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel(CHAN);
  } catch (e) { bc = null; }

  if (bc) {
    bc.onmessage = function (e) { emitOnce(e.data); };
  } else {
    window.addEventListener('storage', function (e) {
      if (e.key !== LSKEY || !e.newValue) return;
      try { emitOnce(JSON.parse(e.newValue)); } catch (err) {}
    });
  }

  /* ---------- 云端通道：MQTT over WSS（跨设备） ---------- */
  var mqtt = null;
  var mqttTried = false;

  function connectMqtt(idx) {
    if (typeof window.mqtt === 'undefined') return;
    if (idx >= MQTT_BROKERS.length) {
      post('log', { from: 'sys', text: '云通道连接失败：跨设备联动不可用（同浏览器标签页联动不受影响）' });
      return;
    }
    var c = window.mqtt.connect(MQTT_BROKERS[idx], {
      clean: true,
      keepalive: 30,
      connectTimeout: 8000,
      reconnectPeriod: 5000,
      clientId: 'xn-' + room + '-' + Math.random().toString(36).slice(2, 10)
    });
    var done = false;
    c.on('connect', function () {
      if (done) return;
      mqtt = c;
      /* 订阅确认后再广播连接日志（避免订阅未生效时 publish 回环丢消息） */
      c.subscribe(MQTT_TOPIC, function () {
        post('log', { from: 'sys', text: '云通道已连接（房间 ' + room + '）：三端可跨设备实时联动' });
      });
    });
    c.on('message', function (t, payload) {
      try { emitOnce(JSON.parse(payload.toString())); } catch (e) {}
    });
    c.on('error', function () {
      if (done) return;
      done = true;
      try { c.end(true); } catch (e) {}
      connectMqtt(idx + 1);
    });
  }

  function loadMqttLib(idx) {
    if (idx >= MQTT_CDN.length) return;
    var s = document.createElement('script');
    s.src = MQTT_CDN[idx];
    s.async = true;
    s.onload = function () { connectMqtt(0); };
    s.onerror = function () { loadMqttLib(idx + 1); };
    document.head.appendChild(s);
  }

  function tryMqtt() {
    if (mqttTried) return;
    mqttTried = true;
    if (typeof window.mqtt === 'undefined') loadMqttLib(0);
    else connectMqtt(0);
  }

  /* ---------- 发送 ---------- */
  function post(type, data) {
    var msg = {
      id: 'm' + (++seq) + '-' + Math.random().toString(36).slice(2, 8),
      t: Date.now(),
      type: type,
      data: data || {}
    };
    if (bc) bc.postMessage(msg);
    else { try { localStorage.setItem(LSKEY, JSON.stringify(msg)); } catch (e) {} }
    if (mqtt && mqtt.connected) {
      try { mqtt.publish(MQTT_TOPIC, JSON.stringify(msg)); } catch (e) {}
    }
    return msg;
  }

  function on(type, fn) {
    (handlers[type] = handlers[type] || []).push(fn);
    return function () {
      handlers[type] = (handlers[type] || []).filter(function (f) { return f !== fn; });
    };
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

  window.XNB = {
    post: post,
    on: on,
    join: join,
    log: log,
    CHAN: CHAN,
    room: room,
    topic: MQTT_TOPIC,
    cloud: function () { return !!(mqtt && mqtt.connected); },
    connectCloud: tryMqtt
  };

  tryMqtt();
})();