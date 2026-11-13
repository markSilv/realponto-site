(function (root) {
  'use strict';

  function normalizarCnpj(valor) {
    return String(valor).toUpperCase().replace(/[.\/\-\s]/g, '');
  }

  function cnpjValido(valor) {
    const cnpj = normalizarCnpj(valor);
    if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
    let base = cnpj.slice(0, 12);
    [[5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]].forEach(function (pesos) {
      const soma = pesos.reduce((total, peso, i) => total + (base.charCodeAt(i) - 48) * peso, 0);
      const resto = soma % 11;
      base += resto < 2 ? '0' : String(11 - resto);
    });
    return base === cnpj;
  }

  function mascaraCnpj(valor) {
    const v = String(valor).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
    return v.slice(0, 2) + (v.length > 2 ? '.' + v.slice(2, 5) : '') +
      (v.length > 5 ? '.' + v.slice(5, 8) : '') + (v.length > 8 ? '/' + v.slice(8, 12) : '') +
      (v.length > 12 ? '-' + v.slice(12) : '');
  }

  function mascaraTelefone(valor) {
    const v = String(valor).replace(/\D/g, '').slice(0, 11);
    if (!v) return '';
    if (v.length <= 2) return '(' + v;
    const corte = v.length > 10 ? 7 : 6;
    return '(' + v.slice(0, 2) + ') ' + v.slice(2, corte) + (v.length > corte ? '-' + v.slice(corte) : '');
  }

  function telefoneValido(valor) {
    return /^[1-9][0-9](?:[2-5][0-9]{7}|9[0-9]{8})$/.test(String(valor).replace(/[\s()+\-]/g, ''));
  }

  function normalizarSerie(valor) {
    return String(valor).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  const api = { cnpjValido, normalizarCnpj, mascaraCnpj, mascaraTelefone, telefoneValido, normalizarSerie };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RealPontoAtestado = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
