# Integration Tests

This directory contains integration tests for the docsearch-mcp database adapters using real database instances.

## PostgreSQL Integration Tests

The PostgreSQL integration tests use [Testcontainers](https://testcontainers.com/) to spin up a real PostgreSQL instance with the pgvector extension in a Docker container.

### Prerequisites

- Docker must be running
- Node.js with the testcontainers package installed

### Running Integration Tests

```bash
# Run all integration tests
pnpm test:integration

# Run only PostgreSQL tests
pnpm test:integration postgresql

# Run with verbose output
pnpm test:integration --reporter=verbose
```

### Test Coverage

The integration tests cover:

1. **PostgreSQL-specific tests** (`postgresql.test.ts`):
   - Database connection and schema creation
   - Document CRUD operations
   - Chunk insertion and retrieval
   - Vector embedding storage and search
   - Full-text search functionality
   - Metadata operations
   - Cleanup operations

2. **Adapter comparison tests** (`adapter-comparison.test.ts`):
   - Cross-database consistency testing
   - Identical operations on SQLite vs PostgreSQL
   - Search result comparison
   - Edge case handling

### Notes

- Integration tests have longer timeouts (2 minutes) to allow for container startup
- Tests run sequentially to avoid resource conflicts
- PostgreSQL container uses the `pgvector/pgvector:pg16` image
- Temporary SQLite databases are created in the system temp directory
- All containers and temporary files are cleaned up after tests complete

### Troubleshooting

If integration tests fail:

1. Ensure Docker is running and accessible
2. Check that port 5432 is not already in use
3. Verify network connectivity for pulling the PostgreSQL image
4. Check Docker logs if container startup fails
