(function () {
  if (window.__rxqSpritesLocal) return; window.__rxqSpritesLocal = true;
  var BASE = 'capacitor://localhost', KEY = '/assets/sprites/', on = true;
  function local(u) {
    if (!on || u == null) return null;
    var s = String(u); if (s.indexOf('assets/sprites/') < 0) return null;
    try {
      var a = new URL(s, document.baseURI);
      if (a.protocol !== 'https:' && a.protocol !== 'http:') return null;
      var i = a.pathname.indexOf(KEY); if (i < 0) return null;
      return BASE + a.pathname.slice(i) + a.search;
    } catch (e) { return null; }
  }
  var origFetch = window.fetch.bind(window);
  // the app's copy must answer, or the rewriting switches itself off (the website is used as before)
  origFetch(BASE + KEY + 'rxq-probe.json').then(function (r) { if (!r.ok) on = false; }).catch(function () { on = false; });
  window.fetch = function (input, init) {
    var u = typeof input === 'string' ? input : (input && input.url);
    var l = local(u);
    if (!l) return origFetch(input, init);
    return origFetch(l, init).then(function (r) { if (!r.ok) throw new Error('local ' + r.status); return r; })
      .catch(function () { return origFetch(input, init); });
  };
  var srcD = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (srcD && srcD.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true, enumerable: srcD.enumerable,
      get: function () { return srcD.get.call(this); },
      set: function (v) {
        var l = local(v); if (!l) { srcD.set.call(this, v); return; }
        var img = this, orig = v;
        var back = function () { img.removeEventListener('error', back); srcD.set.call(img, orig); };
        img.addEventListener('error', back);
        srcD.set.call(this, l);
      }
    });
  }
  function css(v) {
    if (typeof v !== 'string' || v.indexOf('assets/sprites/') < 0) return v;
    return v.replace(/url\((['"]?)([^'")]+)\1\)/g, function (m, q, u) { var l = local(u); return l ? 'url("' + l + '")' : m; });
  }
  var bgD = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'backgroundImage');
  if (bgD && bgD.set) {
    Object.defineProperty(CSSStyleDeclaration.prototype, 'backgroundImage', {
      configurable: true, enumerable: bgD.enumerable,
      get: function () { return bgD.get.call(this); },
      set: function (v) { bgD.set.call(this, css(v)); }
    });
  }
  var spD = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (name, value, prio) {
    if (name === 'background-image' || name === 'background') value = css(value);
    return spD.call(this, name, value, prio);
  };
})();
