# OpenRPC Diff & Merge CLI

A command-line tool for comparing and merging OpenRPC JSON specifications.

## GitHub Actions Integration

This tool is used with the `openrpc-updater.yml` workflow that automatically:
- Fetches the latest OpenRPC spec from the ethereum/execution-apis repository
- Compares it with our local version
- Creates a PR with the changes if differences are found

## Install

```shell script
npm install
```

## Usage

```shell script
node cli.js [options]

Options:
  -g, --merge               merge original -> modified (writes a new dated file)
```

### Examples

Full diff report:

```shell script
node cli.js
```

Merge changes:

```shell script
node cli.js --merge
```
