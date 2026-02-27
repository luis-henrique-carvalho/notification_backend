# 📚 Documentação de Aprendizado — Microserviços com NestJS & RabbitMQ

Esta pasta contém documentação focada no aprendizado dos conceitos de **microserviços com NestJS** e **RabbitMQ** aplicados neste projeto.

Cada arquivo corresponde a uma task do projeto e aprofunda os conceitos utilizados naquela etapa.

## Índice

| # | Arquivo | Tema |
|---|---------|------|
| 01 | `01-monorepo-setup.md` | Monorepo NestJS, `nest-cli.json`, path aliases |
| 02 | `02-shared-library-contracts.md` | Contratos compartilhados, MessagePattern vs EventPattern, DTOs, exceções RPC vs HTTP |
| 03 | `03-docker-rabbitmq-setup.md` | RabbitMQ como message broker, queues/exchanges/bindings, Docker Compose |
| 04 | `04-database-schema-drizzle.md` | Drizzle ORM, database-per-service, providers customizados, migrations |
| 05 | `05-nestjs-microservice-bootstrap.md` | `NestFactory.createMicroservice()`, Transport RMQ, ciclo de vida de mensagens, filas duráveis |
| 06 | `06-testing-microservices.md` | Testes unitários em microserviços, mocking de Drizzle e RabbitMQ |
| 07 | `07-gateway-hybrid-app.md` | API Gateway, hybrid app, `ClientsModule`, request-response via RMQ |
| 08 | `08-auth-jwt-microservices.md` | JWT em microserviços, Passport, guards globais, RBAC |
| 09 | `09-notification-schema-design.md` | Schema de notificações, estados, design de tabelas |
| 10 | `10-event-driven-architecture.md` | Arquitetura orientada a eventos, `@EventPattern`, idempotência |
| 11 | `11-testing-event-driven.md` | Testes de fluxos orientados a eventos, mocking de `ClientProxy.emit()` |
| 12 | `12-gateway-rest-proxy.md` | Gateway como proxy REST, propagação de contexto do usuário |
| 13 | `13-websocket-realtime-delivery.md` | WebSocket com Socket.IO, rooms, ponte RabbitMQ → WebSocket |
| 14 | `14-swagger-api-documentation.md` | OpenAPI/Swagger em microserviços, contract-first vs code-first |
| 15 | `15-integration-testing-microservices.md` | Testes de integração end-to-end, comunicação via RMQ |
| 16 | `16-desktop-client-setup.md` | Clientes desktop, tipos TypeScript do OpenAPI, type-safe API clients |
| 17 | `17-client-auth-flow.md` | Autenticação do lado do cliente, gerenciamento de sessão |
| 18 | `18-realtime-client-integration.md` | Socket.IO no cliente, reconexão, sincronização REST + WebSocket |
| 19 | `19-electron-system-tray.md` | System tray, notificações nativas, WebSocket em background |
| 20 | `20-mobile-client-setup.md` | Clientes mobile, rede instável, reuso de tipos OpenAPI |
| 21 | `21-mobile-secure-auth.md` | SecureStore/Keychain, restauração de sessão, segurança mobile |
| 22 | `22-mobile-realtime-sync.md` | Sincronização em tempo real no mobile, badge, cache local |
| 23 | `23-critical-notifications-ux.md` | UX de notificações críticas, acknowledgment, feedback háptico |
| 24 | `24-websocket-lifecycle-mobile.md` | Ciclo de vida WebSocket no mobile, reconexão, grace period |
