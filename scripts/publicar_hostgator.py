#!/usr/bin/env python3
"""Publica só o site estático por FTPS explícito, sem remoções remotas.

Python 3.10+; biblioteca padrão. Primeiro use DEPLOY_MODE=verificar.
Não publica .htaccess, prévia-cliente, backups, credenciais ou o repositório.
O manifesto é auxiliar; arquivos não gerenciados permanecem na hospedagem.
"""
from __future__ import annotations

import ftplib
import hashlib
import io
import json
import os
import posixpath
import re
import ssl
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

STATE_NAME = '.realponto-site-deploy-v1.json'
STATE_LIMIT = 4 * 1024 * 1024
SITE_ID = 'realponto-site'
PAGES = {
    '404.html', 'index.html', 'assistencia-tecnica.html', 'identidade-visual.html',
    'iponto-demo.html', 'locacao-de-equipamentos.html', 'modulos.html',
    'real-power.html', 'relogio-de-ponto.html', 'seguranca-eletronica.html',
    'sistema-rhid.html', 'sistema-secullum.html', 'sistemas-em-nuvem.html',
    'suporte-tecnico.html', 'robots.txt', 'sitemap.xml',
}
TREE_TYPES = {
    'css': {'.css', '.woff', '.woff2', '.ttf', '.otf', '.eot'},
    'js': {'.js', '.mjs'},
    'img': {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg', '.ico'},
    'fonts': {'.woff', '.woff2', '.ttf', '.otf', '.eot'},
    'downloads': {'.exe', '.msi', '.pdf'},
    'paginas-relogios': {'.html'},
}
REQUIRED = ('index.html', 'css/style.css', 'js/script.js')


class DeployError(RuntimeError):
    """Erro controlado, sem exibir credenciais."""


@dataclass(frozen=True)
class Asset:
    relative: str
    source: Path
    size: int
    digest: str


class StrictFTP_TLS(ftplib.FTP_TLS):
    """Protege também o canal de dados e reutiliza a sessão TLS do controle."""
    def ntransfercmd(self, cmd: str, rest: str | None = None):
        connection, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            try:
                connection = self.context.wrap_socket(
                    connection, server_hostname=self.host, session=self.sock.session
                )
            except Exception:
                connection.close()
                raise
        return connection, size


def permitted(relative: str) -> bool:
    path = PurePosixPath(relative)
    if path.is_absolute() or any(part.startswith('.') for part in path.parts):
        return False
    if any(ord(char) < 32 or ord(char) == 127 for char in relative):
        return False
    if '\\' in relative:
        return False
    if len(path.parts) == 1:
        return relative in PAGES
    return path.parts[0] in TREE_TYPES and path.suffix.lower() in TREE_TYPES[path.parts[0]]


def collect(root: Path) -> list[Asset]:
    root = root.resolve(strict=True)
    for required in REQUIRED:
        path = root / required
        if not path.is_file() or path.is_symlink():
            raise DeployError(f'Falta {required}. Confira SITE_LOCAL_DIR e a versão do repositório.')
    selected: list[Asset] = []
    for current_dir, dirnames, filenames in os.walk(root, followlinks=False):
        directory = Path(current_dir)
        # Na raiz só percorre as pastas públicas explicitamente permitidas.
        dirnames[:] = sorted(
            name for name in dirnames
            if not name.startswith('.')
            and not (directory / name).is_symlink()
            and (directory != root or name in TREE_TYPES)
        )
        for name in sorted(filenames):
            file = directory / name
            relative = file.relative_to(root).as_posix()
            if not permitted(relative):
                continue
            if file.is_symlink() or not file.is_file():
                raise DeployError(f'Arquivo não regular: {relative}.')
            if not file.resolve().is_relative_to(root):
                raise DeployError(f'Arquivo fora da raiz: {relative}.')
            with file.open('rb') as handle:
                prefix = handle.read(180)
                if prefix.startswith(b'version https://git-lfs.github.com/spec/v1'):
                    raise DeployError(f'{relative} é um ponteiro Git LFS, não o arquivo. Pare e ajuste o checkout.')
                handle.seek(0)
                digest = hashlib.sha256()
                for part in iter(lambda: handle.read(1024 * 1024), b''):
                    digest.update(part)
            selected.append(Asset(relative, file, file.stat().st_size, digest.hexdigest()))
    # Recursos antes dos HTMLs; página inicial por último. Não é troca atômica do site inteiro.
    selected.sort(key=lambda asset: (
        2 if asset.relative == 'index.html' else 1 if asset.relative.endswith('.html') else 0,
        asset.relative,
    ))
    return selected


def env_required(name: str) -> str:
    value = os.environ.get(name, '')
    if not value or not value.strip():
        raise DeployError(f'Configure {name} no GitHub antes de continuar.')
    return value


def connection_config() -> tuple[str, int, str, str, str]:
    host = env_required('HOSTGATOR_FTP_HOST').strip()
    user = env_required('HOSTGATOR_FTP_USER')
    password = env_required('HOSTGATOR_FTP_PASSWORD')
    remote = env_required('HOSTGATOR_FTP_DIR').strip()
    if '://' in host or '/' in host or any(c.isspace() for c in host):
        raise DeployError('HOSTGATOR_FTP_HOST deve conter apenas nome do servidor ou IP, sem protocolo ou caminho.')
    if any(c in user + password for c in '\r\n'):
        raise DeployError('Uma credencial contém quebra de linha. Corrija o Secret.')
    if any(ord(c) < 32 for c in remote) or '\\' in remote or '..' in PurePosixPath(remote).parts:
        raise DeployError('HOSTGATOR_FTP_DIR inválido.')
    # Uma conta FTP restrita já enxerga public_html como /. Não usar caminho Linux aqui.
    if remote.startswith(('/home/', '/home1/')):
        raise DeployError('Use o caminho exibido pelo cliente FTP, não /home1/usuario/.')
    try:
        port = int(os.environ.get('HOSTGATOR_FTP_PORT', '21'))
    except ValueError as exc:
        raise DeployError('Porta FTP inválida.') from exc
    if not 1 <= port <= 65535:
        raise DeployError('Porta FTP fora do intervalo válido.')
    return host, port, user, password, remote


def fetch_limited(ftp: StrictFTP_TLS, name: str, limit: int) -> bytes:
    output = bytearray()
    def receive(block: bytes) -> None:
        output.extend(block)
        if len(output) > limit:
            raise DeployError(f'{name}: resposta maior do que o limite de segurança.')
    ftp.retrbinary('RETR ' + name, receive)
    return bytes(output)


def verify_destination(ftp: StrictFTP_TLS) -> None:
    try:
        data = fetch_limited(ftp, 'index.html', 2 * 1024 * 1024)
    except ftplib.error_perm as exc:
        raise DeployError('Não encontrei index.html no destino FTP. Confirme a pasta; nenhum arquivo foi enviado.') from exc
    title = re.search(br'<title\b[^>]*>(.*?)</title\s*>', data, re.I | re.S)
    if not title or b'realponto' not in title.group(1).lower():
        raise DeployError('O index.html remoto não foi reconhecido como RealPonto. Confira o destino antes de publicar.')


def read_state(ftp: StrictFTP_TLS) -> dict[str, dict[str, Any]]:
    try:
        raw = fetch_limited(ftp, STATE_NAME, STATE_LIMIT)
    except ftplib.error_perm as exc:
        if str(exc).startswith('550'):
            print('Sem histórico de publicação: serão enviados todos os arquivos permitidos.')
            return {}
        raise
    try:
        state = json.loads(raw)
        if not isinstance(state, dict) or state.get('site') != SITE_ID or state.get('schema') != 1:
            raise ValueError('Formato incompatível')
        items = state['files']
        if not isinstance(items, dict):
            raise ValueError('Lista inválida')
        result = {}
        for key, value in items.items():
            if (isinstance(key, str) and permitted(key) and isinstance(value, dict)
                    and isinstance(value.get('size'), int) and value['size'] >= 0
                    and isinstance(value.get('sha256'), str)
                    and re.fullmatch(r'[a-f0-9]{64}', value['sha256'])):
                result[key] = value
        return result
    except (ValueError, TypeError, KeyError):
        print('Histórico inválido: será ignorado, sem excluir arquivos do servidor.')
        return {}


def needs_upload(ftp: StrictFTP_TLS, asset: Asset, previous: dict[str, Any], force: bool) -> bool:
    if force or previous.get('sha256') != asset.digest or previous.get('size') != asset.size:
        return True
    try:
        ftp.voidcmd('TYPE I')
        return ftp.size(asset.relative) != asset.size
    except ftplib.error_perm:
        return True


def ensure_parent(ftp: StrictFTP_TLS, relative: str, made: set[str]) -> None:
    parent = posixpath.dirname(relative)
    if not parent:
        return
    current = ''
    for part in parent.split('/'):
        current = posixpath.join(current, part)
        if current in made:
            continue
        try:
            ftp.mkd(current)
        except ftplib.error_perm:
            # Pode existir; confirme por CWD, sem supor que qualquer erro é benigno.
            old = ftp.pwd()
            try:
                ftp.cwd(current)
            finally:
                ftp.cwd(old)
        made.add(current)


def upload_atomic(ftp: StrictFTP_TLS, name: str, data, size: int, token: str) -> None:
    parent, leaf = posixpath.split(name)
    temporary = posixpath.join(parent, '.' + leaf + '.rp-' + token + '.part')
    ftp.storbinary('STOR ' + temporary, data, blocksize=256 * 1024)
    ftp.voidcmd('TYPE I')
    if ftp.size(temporary) != size:
        raise DeployError(f'Tamanho divergente ao enviar {name}. O arquivo definitivo não foi trocado.')
    # Não remove o arquivo anterior. Se o servidor não permitir substituir por rename,
    # interrompe e preserva o anterior (e o temporário, para diagnóstico).
    ftp.rename(temporary, name)


def deploy(ftp: StrictFTP_TLS, assets: list[Asset], publish: bool, force: bool) -> tuple[int, int]:
    verify_destination(ftp)
    previous = read_state(ftp)
    pending = [asset for asset in assets if needs_upload(ftp, asset, previous.get(asset.relative, {}), force)]
    removed = set(previous) - {asset.relative for asset in assets}
    total = sum(asset.size for asset in pending)
    print(f'Permitidos: {len(assets)}; pendentes: {len(pending)}; volume: {total / (1024 ** 2):.2f} MiB.')
    if removed:
        print(f'{len(removed)} arquivo(s) antes gerenciado(s) não estão mais no repositório: serão PRESERVADOS no servidor.')
    for asset in pending:
        print(('ENVIAR ' if publish else 'PREVER ') + asset.relative)
    if not publish:
        print('VERIFICAÇÃO concluída: nenhum arquivo ou diretório remoto foi criado, alterado ou apagado.')
        return len(pending), 0
    made: set[str] = set()
    token = uuid.uuid4().hex[:16]
    for asset in pending:
        ensure_parent(ftp, asset.relative, made)
        with asset.source.open('rb') as handle:
            upload_atomic(ftp, asset.relative, handle, asset.size, token)
    # Escreve o histórico só depois de todos os recursos terem sido enviados.
    # Sem dados de usuário/senha. Não usa o histórico para remover nada.
    state = {
        'schema': 1, 'site': SITE_ID,
        'commit': os.environ.get('DEPLOY_COMMIT', ''),
        'updatedAt': datetime.now(timezone.utc).isoformat(),
        'files': {asset.relative: {'sha256': asset.digest, 'size': asset.size} for asset in assets},
    }
    body = (json.dumps(state, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    upload_atomic(ftp, STATE_NAME, io.BytesIO(body), len(body), token)
    print(f'PUBLICAÇÃO concluída: {len(pending)} arquivo(s) enviados. Nenhum arquivo remoto foi excluído.')
    return len(pending), len(pending)


def main() -> int:
    mode = os.environ.get('DEPLOY_MODE', 'verificar')
    if mode not in {'verificar', 'publicar', 'local'}:
        raise DeployError('DEPLOY_MODE inválido.')
    root = Path(os.environ.get('SITE_LOCAL_DIR', '.'))
    assets = collect(root)
    print(f'{len(assets)} arquivos públicos selecionados. .htaccess e aplicações separadas não participam do envio.')
    if mode == 'local':
        print('Conferência local concluída, sem conexão com servidor.')
        return 0
    host, port, user, password, remote = connection_config()
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    ftp = StrictFTP_TLS(context=context, timeout=60)
    try:
        ftp.connect(host, port)
        # AUTH TLS acontece ANTES do envio da senha. Nenhum fallback para FTP simples.
        ftp.auth()
        ftp.login(user, password)
        ftp.prot_p()
        ftp.set_pasv(True)
        ftp.cwd(remote)
        print('Conexão FTPS com certificado validado. Diretório remoto:', ftp.pwd())
        deploy(ftp, assets, mode == 'publicar', os.environ.get('FORCE_UPLOAD', '').lower() == 'true')
        return 0
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


if __name__ == '__main__':
    try:
        sys.exit(main())
    except ssl.SSLCertVerificationError:
        print('ERRO: certificado FTPS não validado. Use o nome oficial que consta no certificado e confirme o servidor com a HostGator. Não desative TLS nem a verificação.', file=sys.stderr)
        sys.exit(1)
    except ftplib.error_perm as error:
        code = str(error)[:3]
        print(f'ERRO FTP {code}: confira usuário/senha, destino e permissões no cPanel. Nenhuma limpeza remota será executada.', file=sys.stderr)
        sys.exit(1)
    except (DeployError, OSError, ssl.SSLError, ftplib.Error) as error:
        # Não imprime o objeto com credenciais ou detalhes brutos do servidor.
        message = str(error) if isinstance(error, DeployError) else f'{type(error).__name__}: conexão ou operação interrompida; confira o FTPS e a rede.'
        print('ERRO: ' + message, file=sys.stderr)
        sys.exit(1)
