# Jungle Gaming — Distributed Wagering Processor

Este repositório contém a solução do desafio técnico para o processador de transações financeiras distribuídas da Jungle Gaming. O sistema foi projetado para processar alto volume de apostas mantendo consistência absoluta, atomicidade de operações e resiliência contra falhas em um ecossistema distribuído.

## 🛠 Stack Tecnológica

- **Runtime:** [Bun](https://bun.sh) 1.x
- **Linguagem:** TypeScript (Strict Mode)
- **Framework:** NestJS
- **Banco de Dados:** PostgreSQL 16
- **ORM:** MikroORM (Padrão Unit of Work + Data Mapper)
- **Mensageria:** AWS SQS (emulado via LocalStack)
- **Orquestração:** Docker Compose
- **Testes de Carga:** Grafana K6

## ⚙️ Pré-requisitos

- [Bun](https://bun.sh) 1.x instalado nativamente.
- Docker e Docker Compose em execução.
- [Grafana k6](https://k6.io/docs/get-started/installation/) instalado na máquina host (para rodar os testes de carga opcionais).

## 🚀 Setup do Projeto

1. Instale as dependências:

   ```bash
   bun install
   ```

2. Configure o ambiente:

```bash
cp .env.example .env

```

3. Suba a infraestrutura local (PostgreSQL + LocalStack):

```bash
bun run docker:up

```

4. Execute as migrações do banco de dados:

```bash
bun run migration:up

```

5. Inicie a aplicação (Modo Dev):

```bash
bun run start:dev

```

## 🧪 Estratégia de Testes

Os testes não utilizam mocks para o banco ou para a mensageria, atendendo aos requisitos estritos de validação arquitetural. Os testes de integração e concorrência sobem infraestrutura real usando Testcontainers.

Para evitar sobrecarga e lentidão no feedback loop durante o desenvolvimento, os scripts de teste foram segmentados:

```bash
# Roda apenas os testes de unidade em memória (Lógica de Domínio e Value Objects)
bun run test

# Roda os testes de integração (Requer Docker ativo para o Testcontainers)
bun run test:integration

# Roda a suíte extrema de Race Conditions (Promise.all massivo no Postgres real)
bun run test:concurrency

# Executa a bateria de testes completa (Unidade + Integração + Concorrência)
bun run test:all

```

## 📊 Teste de Carga e Concorrência (K6)

Conforme os diferenciais propostos no desafio, a aplicação foi submetida a um teste de carga rigoroso focado no isolamento transacional e no comportamento da _Hot Wallet_ sob estresse extremo.

- **Ambiente:** Executado localmente. Máquina host: AMD Ryzen 5 5600X, 32GB RAM, WSL2 (Ubuntu). Injetor K6, aplicação Bun e contêineres Docker compartilhando os mesmos recursos.
- **Metodologia:** Script K6 (`bun run test:load`) simulando 50 Virtual Users (Provedores) disparando transações simultâneas sem pausas na **exata mesma** `walletId` durante 1 minuto e 20 segundos.

- **Throughput:** ~92.82 RPS concentrados em uma única linha do banco de dados.

- **Latência Registrada:**
- Média: 382.11ms

- p(90): 635.65ms

- p(95): 673.24ms

- **Taxa de Erro (HTTP 500):** 44.35% (2060 falhas em 4644 requisições).

### Diagnóstico Arquitetural: O Esgotamento do Lock Otimista

A alta taxa de rejeição por infraestrutura e a latência na casa dos 600ms não são falhas acidentais, mas sim uma consequência da escolha arquitetural estrita pelo **Optimistic Locking** (`version`).

Neste cenário de bombardeio intenso e contínuo sobre a **mesma carteira**, a contenção gerou conflitos severos de versão no Postgres. O sistema realizou as retentativas programadas no _Unit of Work_ (`MAX_CONCURRENCY_RETRIES = 5`), mas, devido ao esgotamento dessas tentativas por conta da altíssima concorrência paralela, o framework devolveu o erro 500 para evitar atualizações perdidas (_lost updates_). A latência elevada reflete o custo computacional desses múltiplos _rollbacks_ e retries sucessivos.

**Conclusão:** O sistema preferiu falhar de forma segura a corromper dados. As invariantes financeiras de não-negatividade e soma dupla do ledger foram mantidas 100% intactas. Em um cenário real de cassino, onde o tráfego é diluído em milhares de usuários distintos, o lock otimista opera de forma brilhante e rápida.
