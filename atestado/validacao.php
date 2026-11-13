<?php
declare(strict_types=1);

namespace Realponto\Atestado;

const DECLARACAO_VERSAO = '2026-11-13.1';
const PRIVACIDADE_VERSAO = '2026-11-13.1';
const MAX_EQUIPAMENTOS = 20;
const MAX_FOTO = 5 * 1024 * 1024;
const MAX_FOTOS_TOTAL = 20 * 1024 * 1024;
const DECLARACAO = <<<'TEXTO'
Declaro que todas as informações fornecidas neste formulário foram devidamente conferidas e correspondem aos dados verdadeiros e atualizados da empresa e dos equipamentos relacionados.

A empresa solicitante assume a responsabilidade pela veracidade, exatidão e integridade das informações prestadas.

Estou ciente de que erros, omissões ou informações divergentes poderão ocasionar atrasos, necessidade de correção ou impossibilidade de conclusão da solicitação.

Reconheço que o Atestado Técnico e Termo de Responsabilidade é emitido e assinado pelo fabricante do equipamento, cabendo ao Grupo Realponto atuar na intermediação administrativa da solicitação.

Estou ciente de que cabe à empresa empregadora possuir e manter o documento para apresentação à fiscalização trabalhista, conforme a legislação aplicável.

Autorizo o tratamento dos dados informados para o atendimento desta solicitação, incluindo o encaminhamento das informações necessárias à fabricante Control iD e/ou Henry, conforme descrito no Aviso de Privacidade do Grupo Realponto.
TEXTO;

final class ErroPublico extends \RuntimeException
{
    public function __construct(public readonly int $status, string $message, public readonly array $campos = [])
    {
        parent::__construct($message);
    }
}

function cnpjValido(string $valor): bool
{
    $cnpj = strtoupper(preg_replace('/[.\/\-\s]/', '', $valor) ?? '');
    if (!preg_match('/^[A-Z0-9]{12}[0-9]{2}$/D', $cnpj) || preg_match('/^(\d)\1{13}$/D', $cnpj)) {
        return false;
    }
    $base = substr($cnpj, 0, 12);
    foreach ([[5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]] as $pesos) {
        $soma = 0;
        foreach ($pesos as $i => $peso) {
            $soma += (ord($base[$i]) - 48) * $peso;
        }
        $resto = $soma % 11;
        $base .= (string) ($resto < 2 ? 0 : 11 - $resto);
    }
    return hash_equals($base, $cnpj);
}

function texto(mixed $valor, int $min, int $max): ?string
{
    if (!is_string($valor) || !preg_match('//u', $valor)) {
        return null;
    }
    $valor = trim($valor);
    $tamanho = preg_match_all('/./us', $valor);
    if ($tamanho < $min || $tamanho > $max || preg_match('/[\x00-\x1F\x7F<>]/u', $valor)) {
        return null;
    }
    return $valor;
}

function validar(array $post): array
{
    $erros = [];
    $dados = [];
    foreach (['razao_social' => [2,180,'Informe a razão social.'], 'responsavel' => [2,120,'Informe o nome do responsável.']] as $campo => [$min,$max,$mensagem]) {
        $dados[$campo] = texto($post[$campo] ?? null, $min, $max);
        if ($dados[$campo] === null) {
            $erros[$campo] = $mensagem;
        }
    }
    $cnpj = is_string($post['cnpj'] ?? null) ? $post['cnpj'] : '';
    if (!cnpjValido($cnpj)) {
        $erros['cnpj'] = 'Informe um CNPJ válido, incluindo os dígitos verificadores.';
    }
    $dados['cnpj'] = strtoupper(preg_replace('/[.\/\-\s]/', '', $cnpj) ?? '');
    $dados['email'] = texto($post['email'] ?? null, 3, 254);
    if (!$dados['email'] || !filter_var($dados['email'], FILTER_VALIDATE_EMAIL)) {
        $erros['email'] = 'Informe um e-mail válido.';
    }
    $telefone = is_string($post['telefone'] ?? null) ? $post['telefone'] : '';
    $dados['telefone'] = preg_replace('/[\s()+\-]/', '', $telefone);
    if (!preg_match('/^[1-9][0-9](?:[2-5][0-9]{7}|9[0-9]{8})$/D', $dados['telefone'])) {
        $erros['telefone'] = 'Informe um telefone com DDD e 10 ou 11 dígitos.';
    }
    if (($post['aceite'] ?? null) !== '1') {
        $erros['aceite'] = 'Confirme a declaração de responsabilidade para enviar.';
    }
    if (($post['declaracao_versao'] ?? null) !== DECLARACAO_VERSAO) {
        $erros['aceite'] = 'A declaração foi atualizada. Recarregue a página e confira o texto.';
    }
    try {
        $equipamentos = json_decode(is_string($post['equipamentos'] ?? null) ? $post['equipamentos'] : '', true, 8, JSON_THROW_ON_ERROR);
    } catch (\JsonException) {
        $equipamentos = null;
    }
    if (!is_array($equipamentos) || !array_is_list($equipamentos) || count($equipamentos) < 1 || count($equipamentos) > MAX_EQUIPAMENTOS) {
        $erros['equipamentos'] = 'Cadastre de 1 a 20 equipamentos.';
        $equipamentos = [];
    }
    $series = [];
    $ids = [];
    $dados['equipamentos'] = [];
    foreach ($equipamentos as $i => $equipamento) {
        if (!is_array($equipamento) || !is_int($equipamento['id'] ?? null) || $equipamento['id'] < 0 || $equipamento['id'] > 10000 || isset($ids[$equipamento['id']])) {
            $erros['equipamentos'] = 'Revise os equipamentos cadastrados.';
            continue;
        }
        $id = $equipamento['id'];
        $ids[$id] = true;
        $fabricante = $equipamento['fabricante'] ?? '';
        if (!in_array($fabricante, ['control-id', 'henry'], true)) {
            $erros["fabricante_$id"] = 'Selecione Control iD ou Henry.';
        }
        $modelo = texto($equipamento['modelo'] ?? null, 1, 100);
        if ($modelo === null) {
            $erros["modelo_$id"] = 'Informe o modelo do relógio.';
        }
        $serie = texto($equipamento['numero_serie'] ?? null, 1, 80);
        $normalizada = strtoupper(preg_replace('/[^a-z0-9]/i', '', $serie ?? '') ?? '');
        if ($serie === null || !preg_match('/^[a-z0-9 ._\/-]+$/iD', $serie) || $normalizada === '') {
            $erros["numero_serie_$id"] = 'Informe o número de série usando letras, números, espaços, ponto, traço ou barra.';
        } elseif (isset($series[$normalizada])) {
            $erros["numero_serie_$id"] = 'Este número de série já foi informado nesta solicitação.';
        }
        $series[$normalizada] = true;
        $dados['equipamentos'][] = ['id' => $id, 'fabricante' => $fabricante, 'modelo' => $modelo, 'numero_serie' => $serie, 'serie_normalizada' => $normalizada];
    }
    if ($erros) {
        throw new ErroPublico(422, 'Confira os campos indicados antes de enviar.', $erros);
    }
    return $dados;
}
