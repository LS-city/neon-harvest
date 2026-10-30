"""Builds index.html for GitHub Pages from the NEON HARVEST game page."""
import sys, re
src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()
def R(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:80]); s = s.replace(a, b)
# account wording + sign out for the standalone site
R('el("span",{text:"Signed in with your claude.ai account"})', 'el("span",{text:window.NH_ACCOUNT_LABEL||"Signed in"})')
R('el("p",{class:"sub",text:"Press Enter to play. To switch accounts, sign out of claude.ai and sign in with the other account."})',
  '(window.claude&&window.claude.signOut?el("button",{class:"btn",type:"button",text:"Sign out",onclick:()=>window.claude.signOut()}):el("p",{class:"sub",text:"Press Enter to play."}))')
R('/^(\\/|https:|blob:)/', '/^(\\/|https:|blob:|data:image\\/)/')
R('Invite friends from the Share menu.', 'Share the game link with friends.')
s = s.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
i = s.index('<div id="game">'); head, body = s[:i], s[i:]
FB = "https://www.gstatic.com/firebasejs/10.12.2/"
page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="NEON HARVEST: a social 2D cyberpunk world. Collect PC parts, build rigs, work shifts, duel, and fight in The Void.">
<style>:root{{color-scheme:dark;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}*,*::before,*::after{{box-sizing:border-box}}body{{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}}img{{max-width:100%}}[hidden]{{display:none!important}}html,body{{height:100%}}</style>
{head.strip()}
<script src="{FB}firebase-app-compat.js"></script>
<script src="{FB}firebase-auth-compat.js"></script>
<script src="{FB}firebase-firestore-compat.js"></script>
<script src="{FB}firebase-database-compat.js"></script>
<script src="firebase-config.js"></script>
<script src="nh-firebase.js"></script>
</head>
<body>
{body.strip()}
</body>
</html>
'''
open(out, "w", encoding="utf-8").write(page)
print("built", out, len(page), "bytes")
