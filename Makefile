# Default shell to use
SHELL := /bin/bash

# Default target when make is called without arguments
.DEFAULT_GOAL := help

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

# Project variables
NODE_MODULES := node_modules
DIST_DIR := dist
DATA_DIR := data

##@ Development Commands

.PHONY: install
install: ## Install dependencies
	@echo -e "$(BLUE)Installing dependencies...$(NC)"
	pnpm install
	@echo -e "$(BLUE)Building native dependencies...$(NC)"
	pnpm rebuild

.PHONY: dev
dev: ## Start development server for MCP
	@echo -e "$(BLUE)Starting MCP development server...$(NC)"
	pnpm dev:mcp

.PHONY: dev-cli
dev-cli: ## Start CLI in development mode
	@echo -e "$(BLUE)Starting CLI in development mode...$(NC)"
	pnpm dev:cli

##@ Build Commands

.PHONY: build
build: clean-dist ## Build the project
	@echo -e "$(BLUE)Building project...$(NC)"
	pnpm build

.PHONY: clean-dist
clean-dist: ## Clean build directory
	@echo -e "$(YELLOW)Cleaning build directory...$(NC)"
	rm -rf $(DIST_DIR)

.PHONY: clean
clean: clean-dist ## Clean all generated files
	@echo -e "$(YELLOW)Cleaning all generated files...$(NC)"
	rm -rf $(NODE_MODULES)
	rm -rf $(DATA_DIR)

##@ Quality Assurance

.PHONY: lint
lint: ## Run linter, formatter, and typecheck (source only)
	@echo -e "$(BLUE)Running linter, formatter, and typecheck...$(NC)"
	pnpm format:check
	pnpm lint
	pnpm typecheck:src

.PHONY: lint-fix
lint-fix: ## Run linter with auto-fix
	@echo -e "$(BLUE)Running linter with auto-fix...$(NC)"
	pnpm lint:fix

.PHONY: format
format: ## Format code with Prettier
	@echo -e "$(BLUE)Formatting code...$(NC)"
	pnpm format

.PHONY: format-check
format-check: ## Check code formatting
	@echo -e "$(BLUE)Checking code formatting...$(NC)"
	pnpm format:check

.PHONY: typecheck
typecheck: ## Run TypeScript type checking (all files)
	@echo -e "$(BLUE)Running TypeScript type checking...$(NC)"
	pnpm typecheck

.PHONY: typecheck-src
typecheck-src: ## Run TypeScript type checking (source only)
	@echo -e "$(BLUE)Running TypeScript type checking on source files...$(NC)"
	pnpm typecheck:src

.PHONY: test
test: ## Run tests
	@echo -e "$(BLUE)Running tests...$(NC)"
	pnpm test

.PHONY: test-run
test-run: ## Run tests once
	@echo -e "$(BLUE)Running tests once...$(NC)"
	pnpm test:run

.PHONY: test-ui
test-ui: ## Run tests with UI
	@echo -e "$(BLUE)Running tests with UI...$(NC)"
	pnpm test:ui

.PHONY: test-coverage
test-coverage: ## Run tests with coverage
	@echo -e "$(BLUE)Running tests with coverage...$(NC)"
	pnpm test:coverage

.PHONY: test-unit
test-unit: ## Run unit tests only
	@echo -e "$(BLUE)Running unit tests...$(NC)"
	pnpm test:unit

.PHONY: test-integration
test-integration: ## Run integration tests (requires Docker)
	@echo -e "$(BLUE)Running integration tests...$(NC)"
	@echo -e "$(YELLOW)Note: Docker must be running for integration tests$(NC)"
	pnpm test:integration

.PHONY: check-all
check-all: lint typecheck-src test-unit ## Run all quality checks
	@echo -e "$(GREEN)All quality checks passed!$(NC)"

##@ Production Commands

.PHONY: start
start: build ## Start production MCP server
	@echo -e "$(GREEN)Starting production MCP server...$(NC)"
	pnpm start:mcp

.PHONY: start-cli
start-cli: build ## Start CLI in production mode
	@echo -e "$(GREEN)Starting CLI in production mode...$(NC)"
	pnpm start:cli

##@ Data Management

.PHONY: ingest-files
ingest-files: ## Ingest local files
	@echo -e "$(BLUE)Ingesting local files...$(NC)"
	pnpm dev:cli ingest files

.PHONY: ingest-files-incremental
ingest-files-incremental: ## Ingest local files with incremental indexing
	@echo -e "$(BLUE)Ingesting local files (incremental mode)...$(NC)"
	pnpm dev:cli ingest files --incremental

.PHONY: ingest-confluence
ingest-confluence: ## Ingest Confluence pages
	@echo -e "$(BLUE)Ingesting Confluence pages...$(NC)"
	pnpm dev:cli ingest confluence

.PHONY: ingest-all
ingest-all: ## Ingest all sources (files and confluence)
	@echo -e "$(BLUE)Ingesting all sources...$(NC)"
	pnpm dev:cli ingest all

.PHONY: ingest-all-incremental
ingest-all-incremental: ## Ingest all sources with incremental indexing
	@echo -e "$(BLUE)Ingesting all sources (incremental mode)...$(NC)"
	pnpm dev:cli ingest all --incremental

.PHONY: watch
watch: ## Watch for file changes and re-index
	@echo -e "$(BLUE)Watching for file changes...$(NC)"
	pnpm dev:cli ingest all --watch

.PHONY: watch-incremental
watch-incremental: ## Watch for file changes with incremental re-indexing
	@echo -e "$(BLUE)Watching for file changes (incremental mode)...$(NC)"
	pnpm dev:cli ingest all --watch --incremental

.PHONY: search
search: ## Search documents (usage: make search QUERY="your search query")
	@echo -e "$(BLUE)Searching documents...$(NC)"
	@if [ -z "$(QUERY)" ]; then \
		echo -e "$(RED)Error: Please provide a query. Usage: make search QUERY=\"your search query\"$(NC)"; \
		exit 1; \
	fi
	pnpm dev:cli search "$(QUERY)"

.PHONY: search-json
search-json: ## Search documents with JSON output (usage: make search-json QUERY="your search query")
	@echo -e "$(BLUE)Searching documents (JSON output)...$(NC)"
	@if [ -z "$(QUERY)" ]; then \
		echo -e "$(RED)Error: Please provide a query. Usage: make search-json QUERY=\"your search query\"$(NC)"; \
		exit 1; \
	fi
	pnpm dev:cli search "$(QUERY)" --output json

.PHONY: clean-data
clean-data: ## Clean data directory
	@echo -e "$(YELLOW)Cleaning data directory...$(NC)"
	rm -rf $(DATA_DIR)

##@ Incremental Indexing (Performance Optimized)

.PHONY: incremental-files
incremental-files: ingest-files-incremental ## Alias for incremental file indexing

.PHONY: incremental-all
incremental-all: ingest-all-incremental ## Alias for incremental indexing of all sources

.PHONY: incremental-watch
incremental-watch: watch-incremental ## Alias for incremental file watching

.PHONY: incremental-benchmark
incremental-benchmark: ## Compare full vs incremental indexing performance
	@echo -e "$(BLUE)Running indexing performance benchmark...$(NC)"
	@echo -e "$(YELLOW)Testing full indexing...$(NC)"
	@time $(MAKE) ingest-files > /dev/null 2>&1 || true
	@echo -e "$(YELLOW)Testing incremental indexing...$(NC)"
	@time $(MAKE) ingest-files-incremental > /dev/null 2>&1 || true
	@echo -e "$(GREEN)Benchmark complete! Incremental should be faster on subsequent runs.$(NC)"

##@ Setup Commands

.PHONY: check-system
check-system: ## Check system dependencies
	@echo -e "$(BLUE)Checking system dependencies...$(NC)"
	@which node > /dev/null || (echo -e "$(RED)Error: Node.js not found$(NC)" && exit 1)
	@which pnpm > /dev/null || (echo -e "$(RED)Error: pnpm not found$(NC)" && exit 1)
	@echo -e "$(GREEN)System dependencies OK$(NC)"

.PHONY: rebuild-native
rebuild-native: check-system ## Rebuild native dependencies (like better-sqlite3)
	@echo -e "$(BLUE)Rebuilding native dependencies...$(NC)"
	@echo -e "$(YELLOW)This may take a few minutes...$(NC)"
	pnpm rebuild
	@echo -e "$(GREEN)Native dependencies rebuilt successfully$(NC)"

.PHONY: setup
setup: install rebuild-native ## Setup the project for development
	@echo -e "$(BLUE)Setting up project...$(NC)"
	@if [ ! -f .env ]; then \
		echo -e "$(YELLOW)Creating .env file from template...$(NC)"; \
		cp .env.example .env; \
		echo -e "$(YELLOW)Please update .env with your configuration$(NC)"; \
	fi
	@echo -e "$(GREEN)Project setup complete!$(NC)"

##@ Help

.PHONY: help
help: ## Display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)