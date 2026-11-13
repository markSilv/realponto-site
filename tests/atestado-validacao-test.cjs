'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const v = require('../js/atestado-validacao.js');

['11.222.333/0001-81', '11222333000181', '12.ABC.345/01DE-35', '12.abc.345/01de-35'].forEach(cnpj => assert.equal(v.cnpjValido(cnpj), true, cnpj));
['', '11.222.333/0001-80', '00000000000000', '11111111111111', '12.ABC.345/01DE-36', '12.ABC.345/01DE-AA', '<11222333000181>', '11222333000181extra'].forEach(cnpj => assert.equal(v.cnpjValido(cnpj), false, cnpj));
assert.equal(v.mascaraCnpj('12abc34501de35'), '12.ABC.345/01DE-35');
assert.equal(v.mascaraCnpj('11222333000181'), '11.222.333/0001-81');
assert.equal(v.mascaraTelefone('11987654321'), '(11) 98765-4321');
assert.equal(v.mascaraTelefone('1141262929'), '(11) 4126-2929');
assert.equal(v.telefoneValido('(11) 98765-4321'), true);
assert.equal(v.telefoneValido('(11) 4126-2929'), true);
['(00) 99999-9999', '(11) 1111-1111', 'abc11987654321', '1198765432'].forEach(tel => assert.equal(v.telefoneValido(tel), false));
assert.equal(v.normalizarSerie('AB - 123/45'), v.normalizarSerie('ab12345'));

// Verifica também o caminho carregado por <script>, sem CommonJS.
const contexto = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/atestado-validacao.js'), 'utf8'), contexto);
assert.equal(contexto.RealPontoAtestado.cnpjValido('12.ABC.345/01DE-35'), true);
new vm.Script(fs.readFileSync(path.join(__dirname, '../js/atestado-tecnico.js'), 'utf8'));
console.log('OK: CNPJ numérico/alfanumérico, dígitos, máscaras, telefone, séries e scripts.');
