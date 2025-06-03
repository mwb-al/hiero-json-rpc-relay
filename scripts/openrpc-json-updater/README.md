# OpenRPC Diff & Merge CLI

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
