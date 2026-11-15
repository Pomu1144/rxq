"""rxq: add the build's page scripts to GameViewController.

Every script in the list is added to the web view as a WKUserScript (one capacitorDidLoad override for all of them):
  js/<name>.js        run as is, before the page's own scripts
  css/<page>.css      style fix for one page: added at the end of <head> (so it wins over the page's own CSS) on the
                      page whose <body> has class "page-<page minus a -compact/-fix suffix>", unless the website
                      already links the same file (then NXBNVNB has it and the copy here is not needed)
usage: inject.py GameViewController.swift FILE...
"""
import json, os, sys

vc, files = sys.argv[1], sys.argv[2:]
here = os.path.dirname(os.path.abspath(__file__))
scripts = []
for f in files:
    path = os.path.join(here, f)
    src = open(path).read()
    if f.endswith('.css'):
        base = os.path.basename(f)
        page = base[:-4].split('-')[0]
        src = ("(function () {\n"
               "  var css = %s, file = %s, cls = %s;\n"
               "  function add() {\n"
               "    if (!document.body || !document.body.classList.contains(cls)) return;\n"
               "    if (document.querySelector('link[href*=\"' + file + '\"]')) return;\n"
               "    var st = document.createElement('style'); st.setAttribute('data-rxq', file); st.textContent = css;\n"
               "    document.head.appendChild(st);\n"
               "  }\n"
               "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();\n"
               "})();\n") % (json.dumps(src), json.dumps(base), json.dumps('page-' + page))
    scripts.append((f, src))

body = ["    // rxq: page scripts added by rxq's build (see patch/ in Pomu1144/rxq): " + ", ".join(f for f, _ in scripts),
        "    override func capacitorDidLoad() {",
        "        super.capacitorDidLoad()",
        "        guard let ucc = webView?.configuration.userContentController else { return }",
        "        for js in Self.rxqScripts {",
        "            ucc.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))",
        "        }",
        "    }",
        "    static let rxqScripts: [String] = ["]
for f, src in scripts:
    body.append('        // ' + f)
    body.append('        ' + json.dumps(src) + ',')   # a JSON string is a valid Swift string literal here
body.append("    ]")
snippet = "\n".join(body) + "\n"

s = open(vc).read()
anchor = "class GameViewController: CAPBridgeViewController {"
assert anchor in s, "GameViewController changed: update rxq"
if "import WebKit" not in s:
    s = s.replace("import Capacitor", "import Capacitor\nimport WebKit", 1)
s = s.replace(anchor, anchor + "\n" + snippet, 1)
open(vc, "w").write(s)
print("added to GameViewController:", ", ".join(f for f, _ in scripts))
