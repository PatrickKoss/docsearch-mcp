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

.PHONY: dev
dev: ## Start development server for MCP
	@echo -e "$(BLUE)Starting MCP development server...$(NC)"
	pnpm dev:mcp

.PHONY: dev-ingest
dev-ingest: ## Start development ingestion
	@echo -e "$(BLUE)Starting development ingestion...$(NC)"
	pnpm dev:ingest

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

.PHONY: start-ingest
start-ingest: build ## Start production ingestion
	@echo -e "$(GREEN)Starting production ingestion...$(NC)"
	pnpm start:ingest

##@ Data Management

.PHONY: ingest-files
ingest-files: ## Ingest local files
	@echo -e "$(BLUE)Ingesting local files...$(NC)"
	pnpm dev:ingest files

.PHONY: ingest-confluence
ingest-confluence: ## Ingest Confluence pages
	@echo -e "$(BLUE)Ingesting Confluence pages...$(NC)"
	pnpm dev:ingest confluence

.PHONY: watch
watch: ## Watch for file changes and re-index
	@echo -e "$(BLUE)Watching for file changes...$(NC)"
	pnpm dev:ingest watch

.PHONY: clean-data
clean-data: ## Clean data directory
	@echo -e "$(YELLOW)Cleaning data directory...$(NC)"
	rm -rf $(DATA_DIR)

##@ Setup Commands

.PHONY: setup
setup: install ## Setup the project for development
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