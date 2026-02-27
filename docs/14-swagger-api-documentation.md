# Documentação Swagger/OpenAPI (Gateway)

A documentação OpenAPI (Swagger) é uma parte crítica ao desenvolver APIs modernas e, especialmente, em arquiteturas de microsserviços. Neste projeto, configuramos o Swagger no **API Gateway**.

## 1. Importância de Documentação OpenAPI em Microsserviços

Em uma arquitetura de microsserviços, múltiplos serviços podem expor endpoints variados e ter contratos de dados diferentes (DTOs).
Ter uma documentação unificada e padrão como a OpenAPI (Swagger) proporciona:
- **Descoberta de Serviços:** Novos desenvolvedores ou times podem facilmente compreender quais operações estão disponíveis e como usá-las, o que acelera o onboarding.
- **Teste Simplificado:** A interface gráfica gerada (`/api/docs`) permite que você teste as integrações diretamente pelo navegador sem configurar o Postman ou scripts adicionais.
- **Maior Confiabilidade e Redução de Incertezas:** O comportamento esperado de cada requisição e formato exato das respostas são definidos através das anotações.

## 2. Swagger Centralizado no Gateway

No padrão API Gateway, o **Gateway** é a porta de entrada para que clientes externos (web, mobile, serviços de terceiros) acessem recursos internos.
Portanto, a documentação OpenAPI deve estar idealmente centralizada no Gateway.
O Gateway concentra as rotas expostas para o mundo externo (`/auth`, `/users`, `/notifications`). Assim, o cliente externo enxerga apenas um único "ponto final" unificado, com uma única interface do Swagger.
Os microsserviços internos (`user-service`, `notification-service`) que se comunicam através do RabbitMQ (via TCP/Eventos) não precisam expor instâncias isoladas do Swagger, pois estão ocultos e encapsulados pela rede privada.

A implementação feita utilizou os seguintes conceitos:
- **`DocumentBuilder`** gerando as definições básicas da API (nome, descrição, versão e Bearer Auth).
- **`@ApiTags`** e **`@ApiOperation`** inserindo descrições nas controladoras e rotas no Gateway.
- **`@ApiResponse`** detalhando as respostas esperadas (ex: 200, 201, 400).

## 3. Geração Automática de Tipos (Tipagem para Clientes / Frontend)

O fato de possuir a especificação da API nos formatos Swagger UI (HTML) e OpenAPI JSON (`/api/docs-json`) possibilita o uso de ferramentas para a geração de código.
Frameworks modernos no Frontend e clients Mobile (Angular, React, Vue, Swift, Kotlin, Flutter) podem usar a biblioteca genérica ou ferramentas como o `openapi-generator-cli` para gerar automaticamente **Modelos** e **Serviços Cliente**.
Isso elimina o código boilerplate ("repetitivo") ao mesmo tempo que assegura o correto envio e recebimento dos campos com suas devidas tipagens, reduzindo a chance de erros de serialização. DTOs importados da biblioteca `@app/shared` marcados com `@ApiProperty()` definem a estrutura exata do dado exposto no cliente.

## 4. Abordagem "Contract-First" vs "Code-First"

O ecossistema OpenAPI oferece duas abordagens de design dominantes no desenvolvimento de APIs:

### Code-First
Foi a abordagem adotada ao adicionarmos decoradores (`@ApiProperty`, `@ApiOperation`) diretamente nas nossas classes TypeScript (Ex: Controller, DTOs).
- **Vantagem:** O código fonte é a única fonte de verdade. Sempre que o código é atualizado, a documentação acompanha em tempo real sem a necessidade de manter dois arquivos separados e dessincronizados. Rápido e prático para o desenvolvedor da API.
- **Desvantagem:** O contrato pode apenas ser avaliado pelos times clientes depois que o backend iniciar ou estiver parcialmente concluído.

### Contract-First
Consiste na criação de um arquivo `openapi.yaml` independente que todos concordam e formalizam antes da programação da API começar.
- **Vantagem:** Facilita o design "API-first", permitindo que os desenvolvedores front-end e back-end trabalhem em paralelo utilizando ferramentas de "Mock" baseadas no arquivo YAML. O foco no cliente garante uma API muito melhor projetada.
- **Desvantagem:** Exige ferramentas adicionais para garantir que o código realmente respeita a especificação em YAML.

Neste sistema, nós usamos **Code-First** pelas facilidades do NestJS. O pacote `@nestjs/swagger` extrai as marcações do TypeScript ou via plugin do compilar no momento do build e emite o JSON dinamicamente.
