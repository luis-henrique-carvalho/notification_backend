# Design de Schema para Sistema de Notificações

Ao desenhar o banco de dados para um sistema de notificações, um dos erros mais comuns é tentar armazenar todo o conteúdo da notificação e o seu estado de leitura na mesma tabela. Para o nosso `notification-service`, utilizamos um design normalizado de duas tabelas: `notifications` e `notification_recipients`.

Este documento detalha esta estrutura, a máquina de estados de uma notificação e as vantagens de separar os dados.

---

## Estrutura do Schema

### 1. Tabela `notifications`
Armazena a **intenção** da notificação, ou seja, o seu conteúdo principal e metadados gerais.
* **Colunas:** `id`, `title`, `body`, `priority`, `senderId`, `broadcast`, `createdAt`.
* **Propósito:** Evitar duplicação de dados. Se uma única notificação precisa ser enviada para 10.000 usuários (um _broadcast_), armazenamos a string com o título e o corpo da mensagem apenas 1 vez nesta tabela.

### 2. Tabela `notification_recipients`
Armazena o **estado de entrega e leitura** de uma notificação para **um usuário específico**.
* **Colunas:** `id`, `notificationId` (FK), `userId`, `status`, `readAt`, `acknowledgedAt`, `deliveredAt`.
* **Propósito:** Rastrear de forma individual quando cada usuário recebeu, leu ou confirmou ciência.

---

## Por que separar em duas tabelas?

1. **Eficiência de Armazenamento:** Num cenário de envio em massa (ex: aviso de manutenção no sistema), se tivéssemos uma única tabela precisaríamos duplicar centenas de vezes o mesmo `title` e `body`. Separando, armazenamos 1 registro em `notifications` e múltiplos em `notification_recipients`, que são registros muito mais leves.
2. **Consultas Rápidas:** A consulta de "quais notificações o usuário X não leu?" foca inteiramente na tabela `notification_recipients`.
3. **Escalabilidade:** Facilita o particionamento de tabelas no PostgreSQL (ex: particionar a tabela de recipientes por faixa de data).

---

## Máquina de Estados de uma Notificação

Cada registro em `notification_recipients` tem seu próprio status independente, refletindo o fluxo de vida da notificação:

1. **`created`:** A notificação foi gerada no sistema e associada ao usuário, mas ainda não chegou ao dispositivo dele.
2. **`delivered`:** O sistema do usuário (seja o frontend Web, Desktop ou Mobile) confirmou o recebimento em tempo real (ex: pelo WebSocket).
3. **`read`:** O usuário visualizou a notificação (ex: abriu o drop-down de notificações da UI).
4. **`acknowledged`:** *(Específico para prioridade Crítica)* O usuário não apenas leu, mas clicou explicitamente em um botão "Estou Ciente / Acknowledge" de um alerta bloqueante.

---

## Considerações de Performance (Índices)

Um sistema de notificações gera um alto volume de inserts e consultas. Algumas melhores práticas que implementamos no schema do Drizzle:

* **Índices Estratégicos:** Criamos um índice na coluna `userId` do `notification_recipients`. A operação mais comum do serviço é consultar o histórico do usuário (`WHERE user_id = ?`).
* **Foreign Keys com Cascade:** A chave estrangeira para `notifications.id` tem um `ON DELETE CASCADE`. Caso uma notificação seja excluída pela administração, todos os recibos atrelados são apagados juntos de forma eficiente pelo banco.
* **Índice Único (Unique Index):** Criamos uma chave única no par `(notificationId, userId)` para impedir que o mesmo usuário receba a mesma notificação duplicada na tabela de recipientes.
