#!/usr/bin/env python3
"""Cookie の同意のしくみ（nacn.app 共通）を全ページに入れる・入れ直す。

このサイトはビルドしないので、tools/consent/ の部品を各 HTML に直接書き込む。
- 同意の初期値（consent-head.html）を「<!-- Google Analytics -->」の直前に
- 同意のバナー（consent.html）を </body> の直前（なければ最後）に。文言は strings.json のそのページの言語
- ゲーム本体（index.html）はページの中で言語を切り替えるので、全言語の文言を data-strings に持たせる
書き込んだところは <!-- consent:start --> 〜 <!-- consent:end --> で囲むので、部品を直したら実行し直せば入れ替わる。
部品の元の版は claude-skills の consent-mode スキル（assets/）。直すときはそちらを先に直して写す。
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARTS = ROOT / 'tools' / 'consent'
MARKER = '<!-- Google Analytics -->'
START, END = '<!-- consent:start -->', '<!-- consent:end -->'
FOLDERS = {'': 'ja'}
# <html lang> の値（小文字）→ strings.json の言語
LANG_KEYS = {'ja': 'ja', 'en': 'en', 'zh-hant-tw': 'zh-tw', 'ko': 'ko', 'es': 'es'}


def fill(template, values):
    for key, value in values.items():
        template = template.replace('{{' + key + '}}', html.escape(value, quote=True))
    return template


def main():
    strings = json.loads((PARTS / 'strings.json').read_text(encoding='utf-8'))
    head = (PARTS / 'consent-head.html').read_text(encoding='utf-8').rstrip('\n')
    bar = (PARTS / 'consent.html').read_text(encoding='utf-8').rstrip('\n')
    count = 0
    for folder, code in FOLDERS.items():
        for path in sorted((ROOT / folder).glob('*.html')):
            text = path.read_text(encoding='utf-8')
            text = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\n', '', text, flags=re.S)
            if MARKER not in text:
                raise SystemExit(f'{path.relative_to(ROOT)}: 「{MARKER}」が見つからない')
            text = text.replace(MARKER, f'{START}\n{head}\n{END}\n{MARKER}', 1)
            banner = fill(bar, strings[code])
            if folder == '' and path.name == 'index.html':
                data = {k: strings[v] for k, v in LANG_KEYS.items()}
                banner = banner.replace('id="nacnConsent"', 'id="nacnConsent" data-strings="' + html.escape(json.dumps(data, ensure_ascii=False), quote=True) + '"', 1)
            block = f'{START}\n{banner}\n{END}\n'
            text = text.replace('</body>', block + '</body>', 1) if '</body>' in text else text.rstrip('\n') + '\n' + block
            path.write_text(text, encoding='utf-8')
            count += 1
    print(f'{count} ページに同意のしくみを書き込みました')


if __name__ == '__main__':
    main()
