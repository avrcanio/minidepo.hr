#!/bin/sh
set -eu

DB_NAME="${DB_NAME:-minidepo}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_HOST="${DB_HOST:-postgis}"
DB_PORT="${DB_PORT:-5432}"

export PGPASSWORD="$DB_PASSWORD"

if ! psql -h "$DB_HOST" -U "$DB_USER" -p "$DB_PORT" -d postgres -Atqc "SELECT 1" >/dev/null 2>&1; then
  echo "Database connection failed for bootstrap."
  exit 1
fi

if ! psql -h "$DB_HOST" -U "$DB_USER" -p "$DB_PORT" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  psql -h "$DB_HOST" -U "$DB_USER" -p "$DB_PORT" -d postgres -c "CREATE DATABASE \"$DB_NAME\""
fi

psql -h "$DB_HOST" -U "$DB_USER" -p "$DB_PORT" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis"

