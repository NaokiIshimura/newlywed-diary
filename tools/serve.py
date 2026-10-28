#!/usr/bin/env python3
"""ローカルで遊ぶための静的サーバー。Cloudflare Pages と同じく、.html を外した URL（/ja/howto）でも配信する。

使い方: python3 tools/serve.py [ポート（既定 8000）]
"""
import http.server
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        local = super().translate_path(path)
        if not os.path.exists(local) and os.path.exists(local + '.html'):
            return local + '.html'
        return local


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'http://localhost:{port}/')
    http.server.ThreadingHTTPServer(('', port), Handler).serve_forever()
