CREATE TABLE IF NOT EXISTS solicitacoes (
    id TEXT PRIMARY KEY,
    protocolo TEXT NOT NULL UNIQUE,
    idempotencia TEXT NOT NULL UNIQUE,
    sessao_hash TEXT NOT NULL,
    razao_social TEXT NOT NULL,
    cnpj TEXT NOT NULL,
    responsavel TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'recebida' CHECK (status = 'recebida'),
    recebida_em TEXT NOT NULL,
    excluir_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS equipamentos (
    id INTEGER PRIMARY KEY,
    solicitacao_id TEXT NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
    fabricante TEXT NOT NULL CHECK (fabricante IN ('control-id', 'henry')),
    modelo TEXT NOT NULL,
    numero_serie TEXT NOT NULL,
    serie_normalizada TEXT NOT NULL,
    foto TEXT,
    UNIQUE (solicitacao_id, serie_normalizada)
);
CREATE TABLE IF NOT EXISTS aceites (
    solicitacao_id TEXT PRIMARY KEY REFERENCES solicitacoes(id) ON DELETE CASCADE,
    confirmado_em TEXT NOT NULL,
    declaracao_versao TEXT NOT NULL,
    declaracao_texto TEXT NOT NULL,
    privacidade_versao TEXT NOT NULL,
    retencao_dias INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notificacoes (
    id INTEGER PRIMARY KEY,
    solicitacao_id TEXT NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
    destinatario TEXT NOT NULL,
    assunto TEXT NOT NULL,
    corpo TEXT NOT NULL,
    tentativas INTEGER NOT NULL DEFAULT 0,
    proxima_tentativa INTEGER NOT NULL DEFAULT 0,
    enviada_em TEXT,
    UNIQUE (solicitacao_id, destinatario, assunto)
);
CREATE INDEX IF NOT EXISTS notificacoes_pendentes ON notificacoes(enviada_em, proxima_tentativa);
CREATE TABLE IF NOT EXISTS limites (
    chave TEXT PRIMARY KEY,
    inicio INTEGER NOT NULL,
    quantidade INTEGER NOT NULL
);
PRAGMA user_version = 1;
