/**
 * Camada de persistência SQLite (WAL mode) com migrações versionadas e saves atômicos.
 */
export * from './sqliteClient.js';
export * from './migrations/index.js';
export * from './saveRepository.js';
export * from './historyRepository.js';
