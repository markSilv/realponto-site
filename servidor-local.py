#!/usr/bin/env python3
"""RealPonto: pre-visualizacao LOCAL de HTML com URLs sem extensao.

Python 3.10+; apenas biblioteca padrao. Nao executa PHP, .htaccess ou deploy.
Coloque ao lado de index.html. Inicie com: py -3 servidor-local.py --open-browser
Somente loopback (127.0.0.1), GET/HEAD, sem escrita ou listagem de diretorios.
NAO use como servidor de producao. Ctrl+C encerra o processo.
"""
from __future__ import annotations

import argparse
import functools
import html
import mimetypes
import re
import shutil
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

VERSION = '2026-10-28-local-1'
# Arquivos de desenvolvimento, credenciais e configuracao nao sao servidos.
BLOCKED_DIRS = {
    'scripts', 'node_modules', 'documentacao', 'auditoria', 'restaurar',
    'configuracao', '__pycache__', 'venv', 'env', 'tests', 'testes',
}
STATIC_TYPES = {
    '.html', '.htm', '.css', '.js', '.mjs', '.json', '.xml', '.webmanifest',
    '.png', '.jpg', '.jpeg', '.jfif', '.webp', '.gif', '.svg', '.ico', '.avif',
    '.woff', '.woff2', '.ttf', '.otf', '.eot', '.pdf', '.exe', '.msi',
    '.mp4', '.webm', '.mp3', '.wav', '.ogg',
}
MIME = {
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
    '.xml': 'application/xml', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.jfif': 'image/jpeg', '.webmanifest': 'application/manifest+json',
    '.txt': 'text/plain; charset=utf-8',
}


class PreviewServer(ThreadingHTTPServer):
    daemon_threads = True
    # No Windows, evita abrir uma segunda instancia na mesma porta.
    allow_reuse_address = sys.platform != 'win32'


class PreviewHandler(BaseHTTPRequestHandler):
    server_version = 'RealPonto-Local/1'
    sys_version = ''
    protocol_version = 'HTTP/1.0'

    def __init__(self, *args, root: Path, **kwargs):
        self.root = root.resolve()
        super().__init__(*args, **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        # Logs locais sem caracteres de controle recebidos na requisicao.
        msg = re.sub(r'[\x00-\x1f\x7f-\x9f]', '?', fmt % args)
        print(f'[{self.log_date_time_string()}] {msg}', flush=True)

    def end_headers(self) -> None:
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Robots-Tag', 'noindex, nofollow, noarchive')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()

    def _local_request(self) -> bool:
        port = self.server.server_port
        allowed = {'localhost', '127.0.0.1', f'localhost:{port}', f'127.0.0.1:{port}'}
        hosts = self.headers.get_all('Host', [])
        if len(hosts) != 1 or hosts[0].strip().lower() not in allowed:
            self._error(403, 'Acesse usando 127.0.0.1 ou localhost na porta indicada.')
            return False
        origin = self.headers.get('Origin')
        if origin:
            try:
                parsed = urlsplit(origin)
                ok = parsed.scheme == 'http' and parsed.netloc.lower() in allowed
            except ValueError:
                ok = False
            if not ok:
                self._error(403, 'Origem externa nao permitida neste servidor local.')
                return False
        return True

    def _error(self, code: int, message: str) -> None:
        body = (
            '<!doctype html><html lang="pt-BR"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Teste local RealPonto</title><body>'
            f'<h1>Teste local: {code}</h1><p>{html.escape(message)}</p>'
            '<p><a href="/">Voltar para a pagina inicial</a></p></body></html>'
        ).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _redirect(self, path: str, query: str) -> None:
        # Sempre um destino local com uma unica barra inicial; sem open redirect.
        location = '/' + quote(path.lstrip('/'), safe='/~!$&\'()+,;=@-._')
        if query:
            location += '?' + quote(query, safe='%=&;,+/?@:-._~!$()\'[]')
        self.send_response(302)
        self.send_header('Location', location)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _safe_path(self, segments: list[str]) -> Path:
        for part in segments:
            if (part.startswith('.') or part.lower() in BLOCKED_DIRS
                    or part.endswith((' ', '.'))
                    or any(c in part for c in '\\:<>"|?*')
                    or any(ord(c) < 32 or ord(c) == 127 for c in part)):
                raise ValueError('Caminho nao permitido.')
        candidate = self.root.joinpath(*segments).resolve()
        if not candidate.is_relative_to(self.root):
            raise ValueError('Caminho fora da pasta do site.')
        # Bloqueia tambem aliases/symlinks para pastas ocultas dentro da raiz.
        if any(p.startswith('.') or p.lower() in BLOCKED_DIRS
               for p in candidate.relative_to(self.root).parts):
            raise ValueError('Caminho nao permitido.')
        return candidate

    def _file(self, path: Path) -> None:
        # Revalida o caminho real: links simbolicos nao podem sair da pasta.
        try:
            path = path.resolve(strict=True)
            relative = path.relative_to(self.root)
            if any(p.startswith('.') or p.lower() in BLOCKED_DIRS for p in relative.parts):
                raise ValueError('Arquivo bloqueado.')
            if not path.is_file():
                self._error(404, 'Arquivo nao encontrado na sua pasta local.')
                return
            suffix = path.suffix.lower()
            if suffix not in STATIC_TYPES and relative.as_posix() != 'robots.txt':
                self._error(403, 'Este tipo de arquivo nao e servido pela previa local.')
                return
            with path.open('rb') as stream:
                # Nao executa nada e nao escreve no projeto.
                size = path.stat().st_size
                content_type = MIME.get(suffix) or mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(size))
                self.end_headers()
                if self.command != 'HEAD':
                    shutil.copyfileobj(stream, self.wfile, length=256 * 1024)
        except (ValueError, PermissionError):
            self._error(403, 'Nao foi permitido ler esse arquivo na previa local.')
        except FileNotFoundError:
            self._error(404, 'Arquivo nao encontrado na sua pasta local.')

    def _serve(self) -> None:
        if not self._local_request():
            return
        try:
            parsed = urlsplit(self.path)
            if parsed.scheme or parsed.netloc or parsed.fragment:
                raise ValueError('Endereco invalido.')
            decoded = unquote(parsed.path, encoding='utf-8', errors='strict')
            if not decoded.startswith('/'):
                raise ValueError('Caminho invalido.')
            segments = [part for part in decoded.split('/') if part]
            candidate = self._safe_path(segments)
        except (ValueError, UnicodeError, OSError):
            self._error(400, 'Caminho invalido para a previa local.')
            return
        path = '/' + '/'.join(segments)
        if decoded.endswith('/') and segments:
            path += '/'
        query = parsed.query

        # / e /pasta/ usam index.html sem listar o conteudo dos diretorios.
        if candidate.is_dir():
            index = candidate / 'index.html'
            if not index.is_file():
                self._error(404, 'Esta pasta nao possui index.html; listagem desativada.')
                return
            if not path.endswith('/'):
                self._redirect(path + '/', query)
                return
            self._file(index)
            return

        # Arquivos que existem continuam acessiveis; HTMLs usam URL limpa.
        if candidate.is_file():
            if candidate.suffix.lower() == '.html':
                if candidate.name.lower() == 'index.html':
                    target = '/' + '/'.join(segments[:-1])
                    if not target.endswith('/'):
                        target += '/'
                else:
                    target = path.rstrip('/')[:-5]
                self._redirect(target, query)
                return
            if path.endswith('/'):
                self._error(404, 'Arquivo nao encontrado nesse endereco.')
                return
            self._file(candidate)
            return

        # /sistema-secullum -> sistema-secullum.html, incluindo subpastas.
        if segments and not candidate.suffix:
            clean_html = candidate.with_name(candidate.name + '.html')
            if clean_html.is_file():
                if segments[-1].lower() == 'index':
                    target = '/' + '/'.join(segments[:-1])
                    self._redirect(target.rstrip('/') + '/', query)
                    return
                if path.endswith('/'):
                    self._redirect(path.rstrip('/'), query)
                    return
                self._file(clean_html)
                return
        # Nao disfarca rotas quebradas entregando a inicial em qualquer endereco.
        self._error(404, 'Nao existe um HTML correspondente a essa rota na pasta local.')

    def do_GET(self) -> None:
        try:
            self._serve()
        except (BrokenPipeError, ConnectionResetError):
            pass  # Usuario fechou a aba ou interrompeu um download.

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_POST(self) -> None:
        self._error(405, 'A previa local e somente leitura; nao recebe formularios.')

    do_PUT = do_POST
    do_DELETE = do_POST
    do_PATCH = do_POST


def main() -> int:
    parser = argparse.ArgumentParser(description='Teste local RealPonto com URLs sem .html.')
    parser.add_argument('--port', type=int, default=8080, help='Porta local; padrao: 8080.')
    parser.add_argument('--open-browser', action='store_true', help='Abrir a pagina inicial no navegador.')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Use uma porta entre 1024 e 65535.')
    root = Path(__file__).resolve().parent
    if not (root / 'index.html').is_file():
        print('ERRO: coloque servidor-local.py ao lado do index.html do site.', flush=True)
        return 1
    handler = functools.partial(PreviewHandler, root=root)
    try:
        server = PreviewServer(('127.0.0.1', args.port), handler)
    except OSError as exc:
        print(f'Nao foi possivel abrir a porta {args.port}: {exc}', flush=True)
        print('Feche a outra previa local ou execute: py -3 servidor-local.py --port 8081 --open-browser', flush=True)
        return 1
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'\nRealPonto | Teste local | {VERSION}\nPasta: {root}\nAbra: {url}\n', flush=True)
    print('Deixe esta janela aberta. Salve no editor e atualize o navegador com F5.', flush=True)
    print('Ctrl+C encerra. Nao altera o .htaccess, nao usa FTP e nao publica no GitHub.', flush=True)
    print('Somente seu computador. Nao executa PHP ou regras do Apache.\n', flush=True)
    timer = None
    if args.open_browser:
        def open_browser() -> None:
            try:
                webbrowser.open(url)
            except Exception:
                print('Abra manualmente o endereco mostrado acima.', flush=True)
        timer = threading.Timer(0.5, open_browser)
        timer.daemon = True
        timer.start()
    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        print('\nTeste local encerrado.', flush=True)
    finally:
        if timer:
            timer.cancel()
        server.server_close()
    return 0


if __name__ == '__main__':
    if sys.version_info < (3, 10):
        print('Use Python 3.10 ou superior.')
        sys.exit(1)
    sys.exit(main())
