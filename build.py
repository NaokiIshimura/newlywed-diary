#!/usr/bin/env python3
"""言語ごとのゲームのページを書き出す（nacn.app の多言語のしくみ。claude-skills の localize-static-app スキル）。

src/game.html（ゲームのページの枠）に、i18n/<言語>.json と data/profiles/jp/<言語>.json の文を差し込み、
/ja/・/en/・/zh-tw/・/ko/・/es/ に書き出す。各ページは最初からその言語で書き出すので、検索エンジンと SNS の OGP も言語ごとになる。
文章のページ（遊び方・プライバシーポリシー）は、src/page.html（枠）に src/pages/<言語>/<ページ>.html（本文）を差し込んで
/<言語>/<ページ>.html に書き出す。ルート（/）には言語を選ぶページ（src/root.html）、ほかに 404.html・sitemap.xml を書き出す。
Cloudflare Pages ではビルドしないので、src・i18n を変えたら `python3 build.py` を実行して、書き出したファイルもコミットする。
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'src'
SITE = 'https://newlywed-diary.nacn.app/'
PROFILE = 'jp'
# css・js・og.png を変えたら新しくする（古いキャッシュを使わせないため）
ASSET_VER = '20261024b'
# hreflang・sitemap.xml の順
LANGS = ['ja', 'en', 'zh-tw', 'ko', 'es']
# 言語を選ぶページと言語の切り替えリンクは、話者が多い順に並べる（英語・中国語・スペイン語・日本語・韓国語）
SPEAKER_ORDER = ['en', 'zh-tw', 'es', 'ja', 'ko']
# ブラウザの言語がこれで始まっていたら、その言語のページへ移動・案内する。「!」付きは除外
# （スペイン語版は中南米向け。EU 向けに見えないよう、スペインのブラウザ es-ES は自動では移動させない）
BROWSER_MATCH = {
    'ja': ['ja'],
    'en': ['en'],
    'zh-tw': ['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo'],
    'ko': ['ko'],
    'es': ['es', '!es-es'],
}
# 文章のページ。名前と説明は言語データの pages.<ページ>、本文は src/pages/<言語>/<ページ>.html
TEXT_PAGES = ['howto', 'privacy']
# 国プロファイルの文が入っているキーの先頭（js/i18n.js の PROFILE_ROOTS と同じ）
PROFILE_ROOTS = {'events', 'workStyles', 'ranks', 'titles', 'achievements'}


def load_locales():
    locales = {}
    for code in LANGS:
        ui = json.loads((ROOT / 'i18n' / f'{code}.json').read_text(encoding='utf-8'))
        texts = json.loads((ROOT / 'data' / 'profiles' / PROFILE / f'{code}.json').read_text(encoding='utf-8'))
        locales[code] = {'ui': ui, 'texts': texts}
    return locales


def lookup(obj, path):
    for part in path.split('.'):
        obj = obj[part]
    return obj


def t(loc, key, params=None):
    """js/i18n.js の t() と同じ文の引き方。ページに最初から書いておく文だけなので、書式（{name:money} など）は使わない"""
    root = loc['texts'] if key.split('.')[0] in PROFILE_ROOTS else loc['ui']
    text = lookup(root, key)

    def sub(m):
        if m.group(2):
            sys.exit(f'{key}: 書き出しでは書式 {m.group(0)} を使えない')
        return str((params or {})[m.group(1)])
    return re.sub(r'\{(\w+)(?::(\w+))?\}', sub, text)


def prerender(page, loc):
    """data-i18n="キー" の要素に、その言語の文を入れておく（画面のスクリプトも同じ文を入れ直す）"""
    def fill(m):
        tag, attrs = m.group(1), m.group(2)
        key = re.search(r'data-i18n="([^"]+)"', attrs).group(1)
        params = re.search(r"data-i18n-params='([^']+)'", attrs)
        text = t(loc, key, json.loads(params.group(1)) if params else None)
        attr = re.search(r'data-i18n-attr="([^"]+)"', attrs)
        if attr:
            return f'<{tag}{attrs} {attr.group(1)}="{html.escape(text, quote=True)}">'
        # 文の中の <br> はそのまま使う
        return f'<{tag}{attrs}>{text}</{tag}>'
    # 中身が空の要素（<x data-i18n="..."></x>）と、属性に入れる要素（<img data-i18n="..." data-i18n-attr="alt">）
    page = re.sub(r'<(\w+)((?:\s[^>]*?)?\sdata-i18n="[^"]+"[^>]*?)></\1>', fill, page)
    return re.sub(r'<(img)((?:\s[^>]*?)?\sdata-i18n="[^"]+"[^>]*?)>', fill, page)


def render(template, ctx, raw_keys):
    """{{a.b}} を差し込む。raw_keys 以外はエスケープする"""
    def sub(m):
        key = m.group(1)
        value = lookup(ctx, key)
        return str(value) if key in raw_keys else html.escape(str(value), quote=True)
    out = re.sub(r'\{\{([\w.-]+)\}\}', sub, template)
    left = re.findall(r'\{\{[\w.-]+\}\}', out)
    if left:
        sys.exit(f'埋めていない項目: {sorted(set(left))}')
    return out


def page_url(code, page='index'):
    """正規URL。Cloudflare Pages は .html を外した URL で配信する"""
    return f'{SITE}{code}/' + ('' if page == 'index' else page)


def rel_href(page):
    """同じ言語のフォルダの中のページへの相対リンク"""
    return './' if page == 'index' else f'{page}.html'


def plain(text):
    """<br> を外して1行にする。英語などは空白でつなぎ、日本語・中国語の句読点のあとは詰める"""
    text = re.sub(r'\s*<br\s*/?>\s*', ' ', text)
    return re.sub(r'([、，。])\s', r'\1', text)


def page_title(loc):
    ui = loc['ui']
    return ui['meta']['gameName'] + ui['site']['titleSep'] + plain(ui['title']['lead'])


def x_default(page):
    """どの言語にも当てはまらない人向け（x-default）。ゲームは言語を選ぶページ、文章のページは英語版"""
    return SITE if page == 'index' else page_url('en', page)


def hreflang_links(locales, page='index'):
    out = [f'  <link rel="alternate" hreflang="{locales[c]["ui"]["site"]["hreflang"]}" href="{page_url(c, page)}">' for c in LANGS]
    out.append(f'  <link rel="alternate" hreflang="x-default" href="{x_default(page)}">')
    return '\n'.join(out)


def lang_nav(locales, code, page='index'):
    """同じページのほかの言語へのリンク"""
    links = []
    for c in SPEAKER_ORDER:
        s = locales[c]['ui']['site']
        cur = ' aria-current="true"' if c == code else ''
        links.append(f'<a href="../{c}/{"" if page == "index" else page + ".html"}" hreflang="{s["hreflang"]}" lang="{s["htmlLang"]}" data-code="{c}"{cur}>{html.escape(s["langName"])}</a>')
    return '      <nav class="lang-switch langs">' + ''.join(links) + '</nav>'


def site_nav(loc, code, page):
    """画面下のサイト内メニュー（ゲームと文章のページで同じもの）。運営者情報とお問い合わせは nacn.app の共通のページ。
    ul の data-consent-menu に、Cookie の同意のバナーのスクリプトが「Cookie の設定」を足す"""
    nav = loc['ui']['nav']
    items = [] if page == 'index' else [(rel_href('index'), nav['play'], False)]
    items += [(rel_href('howto'), nav['howto'], page == 'howto'),
              (f'https://nacn.app/{code}/about.html', nav['about'], False),
              (rel_href('privacy'), nav['privacy'], page == 'privacy'),
              (f'https://nacn.app/{code}/', nav['portal'], False)]
    lis = ''.join(f'\n          <li><a href="{href}"{" aria-current=\"page\"" if cur else ""}>{html.escape(label)}</a></li>' for href, label, cur in items)
    return f'      <nav class="site-nav" aria-label="{html.escape(nav["label"])}">\n        <ul data-consent-menu>{lis}\n        </ul>\n      </nav>'


def suggest_banner(locales, code, page='index'):
    data = []
    for c in LANGS:
        s = locales[c]['ui']['site']
        data.append({'match': BROWSER_MATCH[c], 'text': s['suggest']['text'], 'link': s['suggest']['link'],
                     'href': f'../{c}/{"" if page == "index" else page + ".html"}', 'lang': s['htmlLang'], 'code': c, 'current': c == code})
    out = (SRC / 'parts' / 'suggest.html').read_text(encoding='utf-8').replace(
        '/*@SUGGEST@*/[]', json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
    return out.replace('{{closeLabel}}', html.escape(locales[code]['ui']['site']['suggest']['close']))


def ogp(loc, code):
    ui = loc['ui']
    e = lambda v: html.escape(v, quote=True)
    return (f'  <meta property="og:type" content="website">\n'
            f'  <meta property="og:site_name" content="{e(ui["meta"]["gameName"])}">\n'
            f'  <meta property="og:locale" content="{ui["site"]["ogLocale"]}">\n'
            f'  <meta property="og:title" content="{e(page_title(loc))}">\n'
            f'  <meta property="og:description" content="{e(ui["meta"]["description"])}">\n'
            f'  <meta property="og:url" content="{page_url(code)}">\n'
            f'  <meta property="og:image" content="{page_url(code)}og.png?v={ASSET_VER}">\n'
            f'  <meta property="og:image:width" content="1200">\n'
            f'  <meta property="og:image:height" content="630">\n'
            f'  <meta name="twitter:card" content="summary_large_image">')


def jsonld(loc, code):
    ui = loc['ui']
    data = {
        '@context': 'https://schema.org', '@type': 'WebApplication', 'name': ui['meta']['gameName'], 'url': page_url(code),
        'description': ui['meta']['description'], 'image': f'{page_url(code)}og.png', 'applicationCategory': 'GameApplication',
        'operatingSystem': 'Web', 'inLanguage': ui['site']['htmlLang'], 'isAccessibleForFree': True,
        'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'JPY'}, 'author': {'@type': 'Person', 'name': 'nacn'},
    }
    text = json.dumps(data, ensure_ascii=False, indent=2).replace('</', '<\\/')
    return f'  <script type="application/ld+json">\n{text}\n  </script>'


def build_game(locales, code):
    loc = locales[code]
    ctx = {**loc['ui'], 'code': code, 'v': ASSET_VER, 'pageTitle': page_title(loc), 'canonical': page_url(code),
           'hreflang': hreflang_links(locales), 'ogp': ogp(loc, code), 'jsonld': jsonld(loc, code),
           'langNav': lang_nav(locales, code), 'siteNav': site_nav(loc, code, 'index'), 'suggestBanner': suggest_banner(locales, code)}
    page = render((SRC / 'game.html').read_text(encoding='utf-8'), ctx, {'hreflang', 'ogp', 'jsonld', 'langNav', 'siteNav', 'suggestBanner'})
    return prerender(page, loc)


def build_text_page(locales, code, page):
    """文章のページ（遊び方・プライバシーポリシー）"""
    loc = locales[code]
    info = loc['ui']['pages'][page]
    ctx = {**loc['ui'], 'code': code, 'v': ASSET_VER, 'page': info, 'canonical': page_url(code, page),
           'fullTitle': info['title'] + loc['ui']['site']['titleSep'] + loc['ui']['meta']['gameName'],
           'hreflang': hreflang_links(locales, page), 'langNav': lang_nav(locales, code, page),
           'siteNav': site_nav(loc, code, page), 'suggestBanner': suggest_banner(locales, code, page),
           'body': (SRC / 'pages' / code / f'{page}.html').read_text(encoding='utf-8').rstrip('\n')}
    return render((SRC / 'page.html').read_text(encoding='utf-8'), ctx, {'hreflang', 'langNav', 'siteNav', 'suggestBanner', 'body'})


def build_root(locales):
    """ルート（/）の言語を選ぶページ。前に選んだ言語かブラウザの言語へ自動で移動する"""
    e = lambda v: html.escape(str(v), quote=True)
    cards = []
    for c in SPEAKER_ORDER:
        ui = locales[c]['ui']
        cards.append(
            f'    <section class="lang-card" lang="{ui["site"]["htmlLang"]}" data-code="{c}">\n'
            f'      <h2>{e(ui["meta"]["gameName"])}<small>{e(ui["site"]["langName"])}</small></h2>\n'
            f'      <p>{e(ui["meta"]["description"])}</p>\n'
            f'      <a class="button primary" href="{c}/" hreflang="{ui["site"]["hreflang"]}">{e(ui["title"]["start"])}</a>\n'
            f'    </section>')
    out = render((SRC / 'root.html').read_text(encoding='utf-8'),
                 {'hreflang': hreflang_links(locales), 'cards': '\n'.join(cards), 'v': ASSET_VER}, {'hreflang', 'cards'})
    return out.replace('/*@MATCH@*/{}', json.dumps(BROWSER_MATCH))


def build_404(locales):
    """見つからないページ。どの深さの URL でも表示されるので、リンクはルートからのパスにする"""
    rows = [f'    <p lang="{locales[c]["ui"]["site"]["htmlLang"]}"><a href="/{c}/">{html.escape(locales[c]["ui"]["meta"]["gameName"])}'
            f'（{html.escape(locales[c]["ui"]["site"]["langName"])}）</a></p>' for c in SPEAKER_ORDER]
    return render((SRC / '404.html').read_text(encoding='utf-8'), {'rows': '\n'.join(rows), 'v': ASSET_VER}, {'rows'})


def build_sitemap(locales):
    def alts(page):
        links = ''.join(f'\n    <xhtml:link rel="alternate" hreflang="{locales[c]["ui"]["site"]["hreflang"]}" href="{page_url(c, page)}"/>' for c in LANGS)
        return links + f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{x_default(page)}"/>'
    rows = [f'  <url>\n    <loc>{SITE}</loc>{alts("index")}\n  </url>']
    for page in ['index'] + TEXT_PAGES:
        rows += [f'  <url>\n    <loc>{page_url(c, page)}</loc>{alts(page)}\n  </url>' for c in LANGS]
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<!-- build.py が書き出す -->\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
            + '\n'.join(rows) + '\n</urlset>\n')


# ---- Cookie の同意（nacn.app 共通。claude-skills の consent-mode スキルの build_consent.py） ----

CONSENT_MARKER = '<!-- Google Analytics -->'


def with_consent(rel, text, locales):
    """Cookie の同意の初期値を GA のタグの前に入れ、言語のページには同意のバナーも入れる"""
    if not rel.endswith('.html'):
        return text
    if CONSENT_MARKER not in text:
        sys.exit(f'{rel}: 「{CONSENT_MARKER}」が見つからないので、同意の初期値を入れられません')
    head = (SRC / 'parts' / 'consent-head.html').read_text(encoding='utf-8').rstrip('\n')
    text = text.replace(CONSENT_MARKER, head + '\n' + CONSENT_MARKER, 1)
    code = rel.split('/')[0]
    if code not in locales:
        # ルートの言語を選ぶページと 404 は、初期値だけ（同意が要る人は、言語のページでバナーを見る）
        return text
    c = locales[code]['ui']['site']['consent']
    values = {**c, 'policyHref': f'/{code}/privacy.html'}
    banner = (SRC / 'parts' / 'consent.html').read_text(encoding='utf-8').rstrip('\n')
    for key, value in values.items():
        banner = banner.replace('{{' + key + '}}', html.escape(value, quote=True))
    if '</body>' in text:
        return text.replace('</body>', banner + '\n</body>', 1)
    return text.rstrip('\n') + '\n' + banner + '\n'


def main():
    locales = load_locales()
    files = {'index.html': build_root(locales), '404.html': build_404(locales), 'sitemap.xml': build_sitemap(locales)}
    for code in LANGS:
        files[f'{code}/index.html'] = build_game(locales, code)
        for page in TEXT_PAGES:
            files[f'{code}/{page}.html'] = build_text_page(locales, code, page)
    for rel, text in files.items():
        path = ROOT / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(with_consent(rel, text, locales), encoding='utf-8')
    print(f'{len(files)} ファイルを書き出しました')


if __name__ == '__main__':
    main()
