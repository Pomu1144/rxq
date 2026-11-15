    // rxq debug build only: a small log in the corner of the screen of every page load (and why), the tutorial
    // state each page sees, failed saves and script errors, kept across pages (and web view reloads) in
    // sessionStorage. Used to find why the tutorial's Next goes back to the village in the app.
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let script = WKUserScript(source: Self.rxqDiagJS, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        webView?.configuration.userContentController.addUserScript(script)
    }

    static let rxqDiagJS = #"""
    (function () {
      var K = '__rxq_diag', box = null;
      var page = function () { return location.pathname.split('/').pop() || '(start)'; };
      function get() { try { return JSON.parse(sessionStorage.getItem(K)) || []; } catch (e) { return []; } }
      function render() {
        if (!document.body) return;
        if (!box) {
          box = document.createElement('div');
          box.style.cssText = 'position:fixed;left:4px;bottom:4px;max-width:70vw;z-index:2147483647;pointer-events:none;' +
            'background:rgba(0,0,0,.78);color:#7fff7f;font:10px/1.25 Menlo,monospace;padding:4px 6px;border-radius:4px;white-space:pre-wrap;word-break:break-all';
          document.body.appendChild(box);
        }
        box.textContent = get().join('\n');
      }
      function add(s) {
        var a = get(); a.push(new Date().toTimeString().slice(0, 8) + ' ' + s); a = a.slice(-12);
        try { sessionStorage.setItem(K, JSON.stringify(a)); } catch (e) {}
        render();
      }
      var type = '?'; try { type = performance.getEntriesByType('navigation')[0].type; } catch (e) {}
      var tut = 'none';
      try {
        var t = JSON.parse(localStorage.getItem('blazing_tutorial_v1'));
        if (t) tut = t.status + ' ' + t.step + ' [' + (t.pages || []).join(',') + ']';
      } catch (e) { tut = 'ERR ' + e.name; }
      var login = '?'; try { login = localStorage.getItem('blazing-login-complete'); } catch (e) { login = 'ERR ' + e.name; }
      add('LOAD ' + page() + ' (' + type + ') login=' + login + ' tut=' + tut);
      window.addEventListener('pagehide', function () { add('leave ' + page()); });
      window.addEventListener('error', function (e) {
        add('JS ERROR ' + (e.message || '') + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || ''));
      });
      var set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        try { return set.call(this, k, v); }
        catch (e) { if (k !== K) add('SAVE FAILED ' + k + ' ' + e.name); throw e; }
      };
      document.addEventListener('DOMContentLoaded', render);
    })();
    """#
