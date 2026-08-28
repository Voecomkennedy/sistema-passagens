# Sistema de Emissão de Passagens (Voecomkennedy)

## Visão Geral do Projeto
- **Nome**: Sistema de Emissão de Passagens
- **Objetivo**: Gerenciar a operação de uma agência de viagens — vendas de passagens aéreas, pacotes turísticos, cotações, cadastro de pessoas (clientes, passageiros e fornecedores) e alertas de check-in.
- **Tipo**: Aplicação web estática, autenticada e sincronizada com **Supabase**, com cache operacional no LocalStorage.

## Funcionalidades Implementadas
- ✅ **Dashboard** (`/` ou `/index.html`): estatísticas do mês (vendas, faturamento, lucro, margem), alertas de check-in com contagem regressiva em tempo real e vendas recentes.
- ✅ **Vendas** (`/vendas.html`): cadastro, edição, arquivamento, busca ampliada, integridade financeira, histórico e autocomplete de aeroportos (IATA).
- ✅ **Balanço** (`/balanco.html`): relatório confiável por data da venda, com cobertura, conciliação mensal, filtros e exportação CSV.
- ✅ **Revisão de legado** (`/revisao-vendas.html`): classificação assistida das vendas antigas, um registro por vez.
- ✅ **Pacotes** (`/pacotes.html`): consulta do cadastro legado; novas vendas de pacote são registradas em Vendas.
- ✅ **Cotações** (`/cotacoes.html`): criação de cotações, status, geração de texto para envio e conversão de cotação em venda.
- ✅ **Pessoas** (`/pessoas.html`): cadastro unificado de clientes, passageiros e fornecedores.
- ✅ **Clientes** (`/clientes.html`): rota legada redirecionada para Pessoas.
- ✅ **Check-in** (`/checkin.html`): acompanhamento de check-ins por proximidade da data de embarque.
- ✅ **Backup** (`/backup.html`): exportação e importação de todos os dados em JSON.

## URLs / Rotas Funcionais
| Caminho | Descrição |
|---|---|
| `/` ou `/index.html` | Dashboard |
| `/vendas.html` | Gestão de vendas |
| `/balanco.html` | Balanço comercial confiável |
| `/revisao-vendas.html` | Revisão assistida de vendas antigas |
| `/pacotes.html` | Pacotes turísticos |
| `/cotacoes.html` | Cotações |
| `/pessoas.html` | Pessoas (clientes/passageiros/fornecedores) |
| `/clientes.html` | Clientes |
| `/checkin.html` | Check-ins |
| `/backup.html` | Backup / Restauração |
| `/css/style.css` | Estilos |
| `/js/storage.js` | Camada de dados (LocalStorage) |
| `/js/utils.js` | Funções utilitárias |
| `/js/aeroportos.js` / `/js/aeroportos-data.js` | Base de aeroportos IATA + busca |

## Arquitetura de Dados
- **Modelos de dados** (chaves no LocalStorage):
  - `emissao_vendas` — vendas de passagens
  - `emissao_pessoas` — clientes, passageiros e fornecedores (campo `tipo`)
  - `emissao_pacotes` — pacotes turísticos
  - `emissao_cotacoes` — cotações
- **Serviço de armazenamento**: cache local gerenciado por `StorageManager`, sincronizado com a conta autenticada no Supabase por `CloudSync`.
- **Fluxo de dados**: a aplicação autentica, baixa a base da conta e só então libera as telas; mudanças locais críticas são sincronizadas com controle de versão.

## Guia do Usuário
1. Acesse o **Dashboard** para ver o resumo do mês e os alertas de check-in.
2. Use **Pessoas/Clientes** para cadastrar clientes e fornecedores.
3. Em **Vendas**, registre as passagens vendidas (com origem/destino via autocomplete de aeroportos).
4. Use **Revisão de legado** para classificar registros antigos antes do fechamento.
5. Em **Balanço**, confira cobertura, valores e divergências do período.
6. Em **Cotações**, crie orçamentos e converta em venda quando fechados.
7. Em **Check-in**, acompanhe os embarques próximos.
8. Em **Backup**, exporte/importe uma cópia completa em JSON.

## Implantação
- **Plataforma**: GitHub Pages.
- **Stack**: HTML + Bootstrap 5 + JavaScript + Supabase.
- **Dev local**: `python3 -m http.server 8765 --bind 127.0.0.1`.
- **Última atualização**: 2026-08-28

## Próximos Passos Recomendados
- Concluir a revisão das vendas antigas para elevar a cobertura do balanço a 100%.
- Evoluir de documento JSON sincronizado para registros individuais no banco quando houver necessidade de uso simultâneo por mais usuários.
