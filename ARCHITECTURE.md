# Architecture — Distributed Wagering Processor]

Este documento detalha as decisões arquiteturais, padrões de design e trade-offs adotados na construção do processador de transações financeiras (Jungle Gaming), em resposta estrita aos requisitos do desafio técnico.

## 1. ORM e Fronteiras Transacionais (Atomicidade)

**Decisão:** Utilização do **MikroORM** em detrimento do TypeORM ou Prisma.
**Justificativa:** O desafio exige que as alterações de saldo (Wallet), a geração do extrato imutável (Ledger), a deduplicação de mensagens (Inbox) e a emissão de eventos (Outbox) ocorram de forma estritamente atômica. O MikroORM foi escolhido por implementar o padrão _Unit of Work_ (UoW) e fornecer controle preciso via `EntityManager.transactional()`. Essa escolha garante que, em caso de falha sistêmica ("crash" do processo no meio do processamento), nenhuma alteração parcial seja persistida no PostgreSQL. Adicionalmente, o uso do padrão _Data Mapper_ isolou perfeitamente as regras da entidade de domínio das amarras do banco de dados.

## 2. Precisão Financeira (`Money` Value Object)

**Decisão:** Uso da biblioteca `big.js` encapsulada em um _Value Object_ `Money` imutável, persistido como `decimal(19,2)`.
**Justificativa:** Para atender à restrição inviolável de não utilizar `number`, `float` ou `double` para manipulação de dinheiro, o sistema recebe strings decimais nas pontas da API/Fila, converte para instâncias de `big.js` no domínio e delega a matemática financeira à biblioteca. No banco de dados, o MikroORM utiliza `@Embeddable` para mapear essas propriedades para colunas numéricas de precisão exata, eliminando qualquer risco de perda por arredondamento binário.

## 3. Controle de Concorrência em Alta Volumetria

**Decisão:** _Optimistic Locking_ (`version`) combinado com _Database Constraints_ (`balance_amount >= 0`).
**Justificativa:** A unidade de concorrência definida é a carteira (`walletId`). Em um cenário de cassino, uma mesma carteira pode receber rajadas simultâneas de eventos (_hot wallet_). O uso de _Pessimistic Locking_ (bloqueio de linha no banco) criaria uma fila síncrona severa, degradando o throughput e aumentando o risco de _deadlocks_. O controle otimista permite que múltiplas instâncias processem a lógica em paralelo; contudo, no momento do _commit_, a verificação de versão garante que apenas uma transação obtenha sucesso em atualizar a carteira, abortando as demais com uma `OptimisticLockError` limpa (que é re-tentada pelo sistema). A constraint `CHECK` no PostgreSQL serve como uma garantia forte e incontestável contra saldos negativos sob qualquer circunstância.

## 4. Idempotência Persistente e Hashes Canônicos

**Decisão:** Idempotência validada no banco de dados com chave composta (`providerId` + `idempotencyKey`) e um Hash Canônico do Payload.
**Justificativa:** Caches em memória foram descartados para cumprir a regra de idempotência persistente. O sistema garante a proteção contra duplicações gerando um hash SHA-256 das chaves ordenadas do payload. Se uma transação com a mesma chave é recebida, o sistema compara os hashes: se forem iguais, trata-se de um _replay_ inofensivo e o sistema retorna a resposta original; se divergirem, o sistema levanta um `ConflictException`, barrando _payloads_ conflitantes.

## 5. Resiliência e Mensageria (Inbox & Outbox Patterns)

**Decisão:** Implementação de tabelas de `inbox_messages` e `outbox_messages` processadas por _Background Workers_.
**Justificativa:** O SQS fornece entrega _at-least-once_ (pelo menos uma vez).

- **Inbox:** Ao processar via fila, o consumidor persiste o `messageId` na tabela de Inbox na mesma transação SQL. Retentativas da fila causam falha por restrição de chave única (UNIQUE), deduplicando o efeito da mensagem sem alterar a carteira.
- **Outbox:** Para impedir que um evento seja publicado caso a transação falhe, o evento é serializado e salvo na mesma transação financeira. O worker `OutboxRelayWorker` varre a base em polling e só publica o evento no SQS externo após a garantia de commit.

## 6. Resolução de Entregas Fora de Ordem

**Decisão:** Criação do status `PENDING_REFERENCE` e reprocessamento assíncrono via cron worker.
**Justificativa:** Reversões (`REFUND` ou `ROLLBACK`) podem ser entregues antes de suas dependências (`BET` ou `WIN`). O domínio identifica a falta da referência, persiste a transação em estado `PENDING_REFERENCE` e o `PendingReferenceWorker` atua de forma assíncrona, re-tentando processar a operação até que a transação originadora chegue, garantindo a eventual consistência sem sobrecarregar a fila principal.

## 7. Modelagem Transacional e Auditoria de Falhas

**Decisão:** Uso do enum estruturado `FailureCode` e persistência de transações falhas (`REJECTED`).
**Justificativa:** Ao invés de abortar o processamento (rollback) de uma transação que fere uma regra de negócio (ex: saldo insuficiente), a aplicação transiciona o estado da entidade para `REJECTED`. A entidade é persistida com um código de erro padronizado (ex: `INSUFFICIENT_FUNDS`), garantindo que a tentativa falha fique no histórico de auditoria e emitindo o evento para o downstream.

## 8. Estratégia de Testes (Isolamento Real)

**Decisão:** Pirâmide de testes segmentada utilizando Bun Test e Testcontainers (PostgreSQL + LocalStack).
**Justificativa:** Para atender à exigência de não utilizar mocks para o banco ou para a fila, os testes foram divididos: testes de unidade rápidos em memória (validando regras matemáticas do `Money` e transições de estado) e testes de integração pesados subindo infraestrutura real efêmera via Docker. Isso garantiu a comprovação empírica de que os bloqueios de concorrência (`Promise.all`) e a atomicidade do _Unit of Work_ funcionam em um motor de banco de dados genuíno.

## 9. Trade-offs Assumidos

1. **Comportamento sob Estresse Massivo (Hot Wallet):** Como demonstrado no teste de carga com o k6, o uso rigoroso do _Optimistic Locking_ prioriza a segurança financeira em detrimento da disponibilidade em cenários irreais de contenção. Sob um ataque de dezenas de transações simultâneas em uma **única** carteira, o limite de retries (`MAX_CONCURRENCY_RETRIES`) é esgotado, resultando em rejeições por infraestrutura (HTTP 500). Isso previne com 100% de eficácia o _lost update_, mas em uma infraestrutura com gargalos reais de Hot Wallet, a arquitetura precisaria evoluir para filas particionadas (Sticky Routing) ou _Event Sourcing_.
2. **Polling vs CDC no Outbox:** Os workers atuais utilizam polling temporizado (`@Cron`) no PostgreSQL. Esta solução é robusta para o escopo e garante os requisitos atômicos, mas em uma infraestrutura de escala extrema (milhares de RPS), geraria alto I/O de leitura. Uma evolução natural da arquitetura seria implementar _Change Data Capture_ (CDC) utilizando ferramentas como o Debezium (Kafka Connect).

## 10. Autenticação e Segurança (Decisão de Design)

**Decisão:** Não implementação de uma solução de autenticação própria ou integração com IdP para esta avaliação, utilizando um _No-Op Guard_.
**Justificativa:** Conforme permitido pelo desafio, o foco foi direcionado 100% à correção financeira e resiliência de concorrência. O ponto de extensão foi deixado explícito no código através do `ProviderAuthGuard`.
**Desenho Futuro:** Em um ambiente produtivo real, a integração seria feita utilizando um _Identity Provider_ externo (como Keycloak ou Zitadel) via protocolo OIDC/OAuth2. O `ProviderAuthGuard` interceptaria a requisição, validaria o token JWT injetado no header `Authorization` (via JWKS) e extrairia as _claims_ para validar se o `providerId` que está assinando o token tem permissão para assinar transações em nome do `playerId` e da carteira alvo.
