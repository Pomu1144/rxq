"""rxq: the Team Formation button set, drawn as SVG (no sprite sheets).

Writes the CSS block (with the SVGs inlined as data URIs) used by patch/css/teams-compact.css.
Shapes: a kunai-cut plate (both ends cut to a point) for buttons, an octagonal seal for pills and chips.
Each plate has a gold rim, an inner engraved line, a gloss band on the top half and a gold stud in each end,
so the art keeps its shape when stretched (border-image: the ends are fixed, the middle stretches).
usage: make_buttons.py PREFIX > block.css
"""
import sys, urllib.parse

def uri(svg):
    svg = " ".join(svg.split())
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=" =:/,.()'-") + '")'

GOLD = '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c2"/><stop offset=".45" stop-color="#e2b24f"/><stop offset=".55" stop-color="#b9822a"/><stop offset="1" stop-color="#6e4612"/></linearGradient>'

def plate(top, mid, bot, line, gloss=.22, stud=True, w=240, h=60, cut=20):
    """kunai-cut plate, viewBox w x h, ends cut over `cut` px"""
    c, m = cut, h / 2
    def poly(i):
        return f"{i*1.4},{m} {c+i*.55},{i} {w-c-i*.55},{i} {w-i*1.4},{m} {w-c-i*.55},{h-i} {c+i*.55},{h-i}"
    studs = ""
    if stud:
        for x in (c * .62, w - c * .62):
            studs += f'<path d="M{x},{m-5} L{x+4},{m} L{x},{m+5} L{x-4},{m} Z" fill="url(#g)" stroke="#3a2306" stroke-width=".6"/>'
    return uri(f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
      <defs>{GOLD}
        <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset=".5" stop-color="{mid}"/><stop offset="1" stop-color="{bot}"/></linearGradient>
        <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="{gloss}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <clipPath id="c"><polygon points="{poly(3.2)}"/></clipPath>
      </defs>
      <polygon points="{poly(0.6)}" fill="#120a03"/>
      <polygon points="{poly(1.4)}" fill="url(#g)"/>
      <polygon points="{poly(3.2)}" fill="url(#f)"/>
      <rect x="0" y="0" width="{w}" height="{m-1}" fill="url(#s)" clip-path="url(#c)"/>
      <polygon points="{poly(6.5)}" fill="none" stroke="{line}" stroke-width="1"/>
      {studs}
    </svg>''')

def seal(fill_top, fill_bot, line, size=60, gloss=.2):
    """octagonal seal, viewBox size x size, corners cut by 30%"""
    def octo(i):
        k = size * .3 + i * .4
        a, b = i, size - i
        return f"{a+k-i},{a} {b-k+i},{a} {b},{a+k-i} {b},{b-k+i} {b-k+i},{b} {a+k-i},{b} {a},{b-k+i} {a},{a+k-i}"
    return uri(f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
      <defs>{GOLD}
        <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{fill_top}"/><stop offset="1" stop-color="{fill_bot}"/></linearGradient>
        <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="{gloss}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <clipPath id="c"><polygon points="{octo(4)}"/></clipPath>
      </defs>
      <polygon points="{octo(0.8)}" fill="#120a03"/>
      <polygon points="{octo(2)}" fill="url(#g)"/>
      <polygon points="{octo(4)}" fill="url(#f)"/>
      <rect x="0" y="0" width="{size}" height="{size/2-1}" fill="url(#s)" clip-path="url(#c)"/>
      <polygon points="{octo(7.5)}" fill="none" stroke="{line}" stroke-width="1"/>
    </svg>''')

RED   = plate("#c8322a", "#8c1610", "#4d0806", "rgba(255,214,150,.45)", gloss=.30)
INK   = plate("#3a332b", "#1c1814", "#0c0a08", "rgba(226,178,79,.35)", gloss=.12)
INK_I = plate("#0f0d0b", "#1a1612", "#24201a", "rgba(226,178,79,.30)", gloss=.04, stud=False)   # inset field (search)
SEAL   = seal("#2e2822", "#0d0b09", "rgba(226,178,79,.35)")
SEAL_ON= seal("#ffe7a3", "#c58b2c", "rgba(90,50,8,.55)", gloss=.35)

P = sys.argv[1] if len(sys.argv) > 1 else ".page-teams"
print(f"""
/* ── Game buttons (drawn for this page, no sprite sheets; source: rxq tools/make_buttons.py) ──────────
   Buttons are a kunai-cut plate (pointed ends, gold rim, engraved inner line, gloss, gold studs):
     crimson = main action (Start Mission, Save Team); black lacquer = everything else.
   Team pills and filter chips are octagonal seals; the chosen one turns to gold.
   Every button presses in when tapped. */
{P} {{
  --btn-red: {RED};
  --btn-ink: {INK};
  --btn-field: {INK_I};
  --seal: {SEAL};
  --seal-on: {SEAL_ON};
  --btn-text-ink: 0 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 -1px 0 #000, 0 2px 3px rgba(0,0,0,.7);
}}
{P} .btn-rename-team, {P} .sort-btn, {P} .team-actions .btn-dark, {P} #prebattle-footer .ss-btn, {P} #char-filter,
{P} .team-actions .btn-darkgold, {P} #prebattle-footer #btn-start-battle, {P} .team-tab.jjk-tab, {P} .f-chip {{
  border-radius: 0 !important; clip-path: none !important; box-shadow: none !important; background: none !important;
  -webkit-backdrop-filter: none !important; backdrop-filter: none !important; border-style: solid !important; border-color: transparent !important;
  transition: transform .07s ease-out, filter .07s ease-out !important; -webkit-tap-highlight-color: transparent;
}}
{P} .btn-rename-team::before, {P} .btn-rename-team::after, {P} .sort-btn::before, {P} .sort-btn::after,
{P} .team-actions button::before, {P} .team-actions button::after,
{P} #prebattle-footer #btn-start-battle::before, {P} #prebattle-footer #btn-start-battle::after {{ display: none !important; }}
{P} .btn-rename-team:active, {P} .sort-btn:active, {P} .team-actions button:active, {P} #prebattle-footer button:active,
{P} .team-tab.jjk-tab:active, {P} .f-chip:active {{ transform: translateY(1px) scale(.95) !important; filter: brightness(.8) !important; }}

/* black lacquer plates (ends 12px at 30px tall) */
{P} .btn-rename-team, {P} .sort-btn, {P} .team-actions .btn-dark, {P} #prebattle-footer .ss-btn {{
  border-width: 0 12px !important; border-image: var(--btn-ink) 0 24 fill / 0 12px / 0 stretch !important;
  padding: 0 4px !important; color: #f1dca4 !important; text-shadow: var(--btn-text-ink) !important;
  font-family: var(--jjk-font, serif) !important; font-weight: 700 !important; font-style: normal !important;
  text-transform: uppercase !important; letter-spacing: .1em !important; font-size: 10.5px !important;
}}
{P} .sort-btn svg, {P} .sort-btn img {{ filter: drop-shadow(0 1px 0 #000) !important; }}
{P} #prebattle-footer .ss-btn {{ border-width: 0 16px !important; border-image-width: 0 16px !important; padding: 0 6px 0 0 !important; text-transform: none !important; letter-spacing: .03em !important; font-size: 12px !important; }}
{P} #prebattle-footer .ss-btn small {{ color: #bfa874 !important; text-shadow: 0 1px 0 #000 !important; font-size: 10px !important; }}
{P} #prebattle-footer .ss-btn .ss-none {{ border-color: rgba(241, 220, 164, .5) !important; background: rgba(0,0,0,.35) !important; color: #f1dca4 !important; }}
/* search: a sunken field in the same shape */
{P} #char-filter {{
  border-width: 0 12px !important; border-image: var(--btn-field) 0 24 fill / 0 12px / 0 stretch !important;
  padding: 0 4px 0 20px !important; color: #f1dca4 !important; font-size: 12.5px !important;
}}
{P} #char-filter::placeholder {{ color: rgba(241, 220, 164, .45) !important; }}
{P} .search-box > img {{ left: 14px !important; opacity: .85 !important; filter: brightness(1.5) drop-shadow(0 1px 0 #000) !important; }}

/* crimson main actions */
{P} .team-actions .btn-darkgold, {P} #prebattle-footer #btn-start-battle {{
  color: #fff6e0 !important; font-family: var(--jjk-font, serif) !important; font-weight: 800 !important; font-style: normal !important;
  text-transform: uppercase !important; letter-spacing: .12em !important;
  text-shadow: 0 1px 0 #3a0300, 1px 0 0 #3a0300, -1px 0 0 #3a0300, 0 -1px 0 #3a0300, 0 0 10px rgba(255, 170, 90, .45) !important;
  filter: drop-shadow(0 3px 4px rgba(0, 0, 0, .55)) !important;
}}
{P} #prebattle-footer #btn-start-battle {{
  height: 42px !important; min-width: 210px !important; padding: 0 6px !important; font-size: 14.5px !important;
  border-width: 0 17px !important; border-image: var(--btn-red) 0 24 fill / 0 17px / 0 stretch !important;
}}
{P} #prebattle-footer #btn-start-battle:disabled, {P} #prebattle-footer #btn-start-battle[disabled] {{ filter: grayscale(.9) brightness(.65) !important; }}
{P} .team-actions .btn-darkgold {{ font-size: 11px !important; border-width: 0 12px !important; border-image: var(--btn-red) 0 24 fill / 0 12px / 0 stretch !important; }}
{P} .team-actions .btn-darkgold, {P} .team-actions .btn-dark {{ flex-basis: 118px !important; width: 118px !important; height: 30px !important; }}

/* seals: team pills and filter chips */
{P} .team-tab.jjk-tab, {P} .f-chip {{
  border-width: 9px !important; border-image: var(--seal) 18 fill / 9px / 0 stretch !important;
  padding: 0 !important; color: #dcc38a !important; text-shadow: var(--btn-text-ink) !important; font-weight: 700 !important;
}}
{P} .team-tab.jjk-tab {{ width: 32px !important; height: 32px !important; }}
{P} .team-tab.jjk-tab::after {{ font-family: var(--jjk-font, serif) !important; font-weight: 800 !important; font-size: 14px !important; color: #e3c98e !important; text-shadow: var(--btn-text-ink) !important; }}
{P} .team-tab.jjk-tab.active, {P} .f-chip[aria-pressed="true"] {{
  border-image: var(--seal-on) 18 fill / 9px / 0 stretch !important; filter: none !important;
}}
{P} .team-tab.jjk-tab.active::after {{ color: #2a1704 !important; text-shadow: 0 1px 0 rgba(255, 245, 210, .6) !important; }}
{P} .f-chip[aria-pressed="true"] {{ color: #2a1704 !important; text-shadow: 0 1px 0 rgba(255, 245, 210, .6) !important; }}
{P} .f-chip > * {{ margin: -9px 0 !important; }}
{P} .team-tab.jjk-tab.active {{ background: none !important; }}
""")
