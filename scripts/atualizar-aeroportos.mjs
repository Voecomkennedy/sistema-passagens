import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const URL_AEROPORTOS = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const URL_PAISES = 'https://davidmegginson.github.io/ourairports-data/countries.csv';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseCsv(texto) {
    const linhas = [];
    let linha = [];
    let campo = '';
    let entreAspas = false;

    for (let i = 0; i < texto.length; i++) {
        const caractere = texto[i];
        if (entreAspas) {
            if (caractere === '"' && texto[i + 1] === '"') {
                campo += '"';
                i++;
            } else if (caractere === '"') {
                entreAspas = false;
            } else {
                campo += caractere;
            }
        } else if (caractere === '"') {
            entreAspas = true;
        } else if (caractere === ',') {
            linha.push(campo);
            campo = '';
        } else if (caractere === '\n') {
            linha.push(campo.replace(/\r$/, ''));
            linhas.push(linha);
            linha = [];
            campo = '';
        } else {
            campo += caractere;
        }
    }

    if (campo || linha.length) {
        linha.push(campo.replace(/\r$/, ''));
        linhas.push(linha);
    }

    const cabecalho = linhas.shift().map(valor => valor.replace(/^\uFEFF/, ''));
    return linhas
        .filter(valores => valores.some(Boolean))
        .map(valores => Object.fromEntries(cabecalho.map((chave, i) => [chave, valores[i] || ''])));
}

async function baixarCsv(url) {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${resposta.status}`);
    return parseCsv(await resposta.text());
}

const [aeroportosFonte, paisesFonte] = await Promise.all([
    baixarCsv(URL_AEROPORTOS),
    baixarCsv(URL_PAISES)
]);

const nomesPaisesFonte = new Map(paisesFonte.map(pais => [pais.code, pais.name]));
const nomesPaisesPt = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
const prioridadeTipo = new Map([
    ['large_airport', 0],
    ['medium_airport', 1],
    ['small_airport', 2],
    ['seaplane_base', 3],
    ['heliport', 4]
]);

const candidatos = aeroportosFonte
    .filter(aeroporto =>
        aeroporto.scheduled_service === 'yes' &&
        aeroporto.type !== 'closed' &&
        /^[A-Z]{3}$/.test(aeroporto.iata_code || '')
    )
    .sort((a, b) =>
        (prioridadeTipo.get(a.type) ?? 9) - (prioridadeTipo.get(b.type) ?? 9)
    );

const porCodigo = new Map();
for (const aeroporto of candidatos) {
    if (porCodigo.has(aeroporto.iata_code)) continue;

    let pais = aeroporto.iso_country;
    try {
        pais = nomesPaisesPt.of(aeroporto.iso_country) || pais;
    } catch {
        pais = nomesPaisesFonte.get(aeroporto.iso_country) || pais;
    }

    porCodigo.set(aeroporto.iata_code, {
        codigo: aeroporto.iata_code,
        nome: aeroporto.municipality || aeroporto.name,
        aeroporto: aeroporto.name,
        pais
    });
}

const comparador = new Intl.Collator('pt-BR', { sensitivity: 'base' });
const aeroportos = [...porCodigo.values()].sort((a, b) => {
    const prioridadeBrasilA = a.pais === 'Brasil' ? 0 : 1;
    const prioridadeBrasilB = b.pais === 'Brasil' ? 0 : 1;
    return prioridadeBrasilA - prioridadeBrasilB ||
        comparador.compare(a.pais, b.pais) ||
        comparador.compare(a.nome, b.nome) ||
        comparador.compare(a.codigo, b.codigo);
});

const dataGeracao = new Date().toISOString().slice(0, 10);
const conteudo = `// Base de aeroportos comerciais com código IATA.
// Fonte pública: OurAirports (${URL_AEROPORTOS})
// Gerado em: ${dataGeracao}. Filtro: em operação, serviço regular e código IATA de 3 letras.
// A base oficial completa da IATA é licenciada; valide casos críticos com a companhia aérea.
const AEROPORTOS_IATA = [
${aeroportos.map(aeroporto => `    ${JSON.stringify(aeroporto)}`).join(',\n')}
];

function normalizarTextoAeroporto(valor) {
    return (valor || '')
        .toString()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .trim()
        .toUpperCase();
}

if (typeof window !== 'undefined') {
    window.AEROPORTOS_IATA = AEROPORTOS_IATA;
    window.normalizarTextoAeroporto = normalizarTextoAeroporto;
}
`;

await writeFile(path.join(raiz, 'js', 'aeroportos-data.js'), conteudo, 'utf8');
console.log(`Base atualizada: ${aeroportos.length} aeroportos com código IATA.`);
