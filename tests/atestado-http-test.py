"""Integração local isolada; biblioteca padrão, sem e-mails ou dados reais."""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
import http.cookiejar
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import struct
import subprocess
import tempfile
import time
import unittest
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener
import uuid
import zlib

ROOT = Path(__file__).resolve().parents[1]
PHP = 'php'


@contextmanager
def database(path):
    db = sqlite3.connect(path)
    try:
        with db:
            yield db
    finally:
        db.close()


def png() -> bytes:
    def chunk(name, data):
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\0' + b'\xff\x00\x00\xff' * 2) * 2)) + chunk(b'IEND', b'')


def multipart(fields: dict, files: list[tuple] | None = None):
    boundary = 'RealpontoTest' + uuid.uuid4().hex
    parts = []
    for name, value in fields.items():
        parts += [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'.encode(), str(value).encode('utf-8'), b'\r\n']
    for name, filename, content_type, data in files or []:
        parts += [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {content_type}\r\n\r\n'.encode(), data, b'\r\n']
    return b''.join(parts) + f'--{boundary}--\r\n'.encode(), f'multipart/form-data; boundary={boundary}'


class AtHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='realponto-atestado-http-')
        cls.private = Path(cls.temp.name)
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.config = cls.private / 'config.php'
        # Dados fictícios; configuração só existe na pasta temporária privada.
        cls.config.write_text("<?php return " + "['storage'=>" + repr((cls.private / 'dados').as_posix()) + ", 'origin'=>" + repr(cls.base) + ", 'environment'=>'local', 'mail_transport'=>'arquivo', 'secret'=>'" + uuid.uuid4().hex + uuid.uuid4().hex + "', 'from'=>'site@example.invalid', 'recipients'=>['equipe@example.invalid'], 'retention_days'=>30];", encoding='utf-8')
        env = os.environ.copy()
        for key in list(env):
            if key.startswith('RP_ATESTADO_'):
                env.pop(key)
        env['RP_ATESTADO_CONFIG'] = str(cls.config)
        cls.log = open(cls.private / 'php.log', 'w', encoding='utf-8')
        cls.process = subprocess.Popen([PHP, '-S', f'127.0.0.1:{port}', '-t', str(ROOT), str(ROOT / 'tests/atestado-router.php')], cwd=ROOT, env=env, stdout=cls.log, stderr=cls.log)
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.2):
                    break
            except OSError:
                if cls.process.poll() is not None:
                    cls.log.flush()
                    raise RuntimeError((cls.private / 'php.log').read_text(encoding='utf-8'))
                time.sleep(.05)
        else:
            raise RuntimeError('PHP local indisponível.')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=10)
        cls.log.close()
        cls.temp.cleanup()

    def request(self, path, data=None, headers=None, method=None):
        req = Request(self.base + path, data=data, headers=headers or {}, method=method)
        try:
            response = self.client.open(req, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            body = response.read()
            return response.status, response.headers, body

    def setUp(self):
        self.client = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        db_path = self.private / 'dados/solicitacoes.sqlite'
        if db_path.exists():
            with database(db_path) as db:
                db.execute('DELETE FROM limites')
        status, self.context_headers, body = self.request('/api/atestado-tecnico.php')
        self.assertEqual(status, 200, body)
        self.context = json.loads(body)
        self.started = time.monotonic()

    def fields(self, items=None):
        return dict(self.context, razao_social='Empresa Teste Ltda', cnpj='11.222.333/0001-81', responsavel='Teste Responsavel', email='cliente@example.invalid', telefone='(11) 98765-4321', aceite='1', website='', equipamentos=json.dumps(items or [dict(id=0, fabricante='control-id', modelo='iDClass', numero_serie='ABC-123')]))

    def post(self, fields=None, files=None, origin=None, wait=True):
        if wait:
            time.sleep(max(0, 2.1 - (time.monotonic() - self.started)))
        data, content_type = multipart(fields if fields is not None else self.fields(), files)
        status, headers, body = self.request('/api/atestado-tecnico.php', data, {'Content-Type': content_type, 'Origin': origin or self.base})
        return status, headers, json.loads(body)

    def test_control_id_persistencia_aceite_idempotencia_emails(self):
        status, headers, result = self.post()
        self.assertEqual(status, 201, result)
        self.assertRegex(result['protocolo'], r'^RP-AT-\d{8}-[A-F0-9]{12}$')
        self.assertIn('no-store', headers['Cache-Control'])
        self.assertEqual(result['status'], 'recebida')
        with database(self.private / 'dados/solicitacoes.sqlite') as db:
            row = db.execute('SELECT id, status FROM solicitacoes WHERE protocolo = ?', (result['protocolo'],)).fetchone()
            self.assertEqual(row[1], 'recebida')
            aceite = db.execute('SELECT declaracao_versao, confirmado_em, retencao_dias FROM aceites WHERE solicitacao_id = ?', (row[0],)).fetchone()
            self.assertEqual(aceite, ('2026-11-13.1', result['recebida_em'], 30))
            self.assertEqual(db.execute('SELECT COUNT(*) FROM notificacoes WHERE solicitacao_id = ? AND enviada_em IS NOT NULL', (row[0],)).fetchone()[0], 2)
        repeat_status, _, repeat = self.post()
        self.assertEqual(repeat_status, 200)
        self.assertEqual(repeat['protocolo'], result['protocolo'])
        messages = list((self.private / 'dados/emails').glob(row[0] + '-*.eml'))
        self.assertEqual(len(messages), 2)
        plain_bodies = [base64.b64decode(m.read_bytes().split(b'\r\n\r\n', 1)[1]).decode('utf-8') for m in messages]
        self.assertTrue(any(result['protocolo'] in m and 'CNPJ: 11222333000181' in m for m in plain_bodies))

    def test_henry(self):
        fields = self.fields([dict(id=0, fabricante='henry', modelo='Prisma SF ADV', numero_serie='HENRY-001')])
        self.assertEqual(self.post(fields)[0], 201)

    def test_configuracao_ausente_falha_segura(self):
        original = self.config.read_bytes()
        try:
            self.config.write_text('<?php return [];', encoding='utf-8')
            status, _, body = self.request('/api/atestado-tecnico.php')
            self.assertEqual(status, 503)
            self.assertIn('temporariamente indisponível', json.loads(body)['mensagem'])
            self.assertNotIn(str(self.private).encode(), body)
            self.assertNotIn(b'protocolo', body)
        finally:
            self.config.write_bytes(original)

    def test_metodo_invalido(self):
        status, headers, _ = self.request('/api/atestado-tecnico.php', method='PUT')
        self.assertEqual(status, 405)
        self.assertEqual(headers['Allow'], 'GET, POST')

    def test_misto_varios_e_cnpj_alfanumerico(self):
        fields = self.fields([dict(id=i, fabricante='henry' if i % 2 else 'control-id', modelo='Modelo', numero_serie=f'TEST-{i}') for i in range(20)])
        fields['cnpj'] = '12.ABC.345/01DE-35'
        status, _, result = self.post(fields)
        self.assertEqual(status, 201, result)
        with database(self.private / 'dados/solicitacoes.sqlite') as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM equipamentos WHERE solicitacao_id = (SELECT id FROM solicitacoes WHERE protocolo = ?)', (result['protocolo'],)).fetchone()[0], 20)

    def test_campos_invalidos_e_sem_aceite(self):
        for key, value in [('cnpj','11.222.333/0001-80'), ('razao_social',''), ('email','invalido'), ('aceite','0'), ('telefone','123'), ('responsavel','<script>')]:
            with self.subTest(campo=key):
                fields = self.fields(); fields[key] = value
                status, _, result = self.post(fields)
                self.assertEqual(status, 422, result)
                self.assertIn(key, result['campos'])

    def test_duplicados_e_limites_equipamentos(self):
        fields = self.fields([dict(id=i, fabricante='henry', modelo='Prisma', numero_serie=serie) for i, serie in enumerate(['Ab-123', 'ab 123'])])
        status, _, result = self.post(fields)
        self.assertEqual(status, 422)
        self.assertIn('numero_serie_1', result['campos'])
        fields = self.fields(); fields['equipamentos'] = '[]'
        self.assertEqual(self.post(fields)[0], 422)

    def test_csrf_origem_e_sessao(self):
        fields = self.fields(); fields['csrf'] = 'incorreto'
        self.assertEqual(self.post(fields)[0], 403)
        self.assertEqual(self.post(origin='https://outro.example.invalid')[0], 403)
        fields = self.fields(); fields['envio'] = 'nao-existe'
        self.assertEqual(self.post(fields)[0], 403)

    def test_antispam_e_limite(self):
        self.assertEqual(self.post(wait=False)[0], 422)
        fields = self.fields(); fields['website'] = 'https://spam.example.invalid'
        self.assertEqual(self.post(fields)[0], 422)
        for _ in range(13):
            self.assertEqual(self.post(fields)[0], 422)
        status, headers, _ = self.post(fields)
        self.assertEqual(status, 429)
        self.assertEqual(headers['Retry-After'], '3600')

    def test_foto_segura_e_sem_acesso_publico(self):
        original = png() + b'<?php echo "marker-removido"; ?>'
        status, _, result = self.post(files=[('foto_0','etiqueta.png','image/png',original)])
        self.assertEqual(status, 201, result)
        with database(self.private / 'dados/solicitacoes.sqlite') as db:
            foto = db.execute('SELECT foto FROM equipamentos WHERE solicitacao_id = (SELECT id FROM solicitacoes WHERE protocolo = ?)', (result['protocolo'],)).fetchone()[0]
        stored = (self.private / 'dados/fotos' / foto).read_bytes()
        self.assertNotIn(b'<?php', stored)
        self.assertTrue(stored.startswith(b'\x89PNG'))
        for path in ['/fotos/' + foto, '/atestado/' + foto, '/atestado/bootstrap.php', '/atestado/schema.sql', '/documentacao/atestado-config.example.php', '/tests/atestado-router.php', '/solicitacoes/' + result['protocolo']]:
            with self.subTest(path=path): self.assertEqual(self.request(path)[0], 404)

    def test_anexo_falso_extensao_e_tamanho(self):
        for name, mime, content in [('etiqueta.png','image/png',b'<?php echo 1; ?>'), ('etiqueta.php','image/png',png()), ('etiqueta.svg','image/svg+xml',b'<svg></svg>'), ('etiqueta.jpg','image/jpeg',b'x' * (5 * 1024 * 1024 + 1))]:
            with self.subTest(name=name, size=len(content)):
                status, _, result = self.post(files=[('foto_0', name, mime, content)])
                self.assertEqual(status, 422, result)

    def test_regressao_paginas_estaticas_e_links(self):
        pages = list(ROOT.glob('*.html')) + list((ROOT / 'paginas-relogios').glob('*.html'))
        self.assertGreater(len(pages), 20)
        for page in pages:
            route = '/' + page.relative_to(ROOT).with_suffix('').as_posix()
            status, _, data = self.request(route)
            self.assertEqual(status, 200, route)
            self.assertIn(b'<html', data.lower())
        for path in ['/js/atestado-tecnico.js', '/js/atestado-validacao.js', '/css/atestado-tecnico.css', '/img/rpBranco.png']:
            self.assertEqual(self.request(path)[0], 200, path)
        form = (ROOT / 'solicitar-atestado-tecnico.html').read_text(encoding='utf-8')
        self.assertIn('name="aceite" type="checkbox" value="1" required', form)
        self.assertNotIn('checked', form)
        self.assertNotIn('js/contatos.js', form)
        self.assertNotIn('googletagmanager', form)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', default='php')
    args, extra = parser.parse_known_args()
    PHP = args.php
    unittest.main(argv=['atestado-http-test.py', *extra], verbosity=2)
