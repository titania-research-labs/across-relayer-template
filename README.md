# Simple Across Relayer

## Overview

Simple Across Relayer is a minimal bot for relaying tokens across multiple blockchains in Across. For more detailed customization, use the bot provided by [Across](https://github.com/across-protocol/relayer).

## Setup

### 1. Installation

Run the following command to install dependencies:

```sh
$ pnpm install
```

### 2. Copy and Configure Environment Variables

Copy the `.env.example` file to create a `.env` file and set the necessary environment variables.

```sh
$ cp .env.example .env
```

In the `.env` file, set the RPC provider URLs and the private key for each blockchain.

### 3. Configure `config.json`

Copy the `sample.config.json` file to create a `config.json` file

```sh
$ cp sample.config.json config.json
```

The `config.json` file contains settings for source chains and destination chains. Below are detailed explanations of each configuration item.

#### `simulate`

- **Type**: `boolean`
- **Description**: Specifies whether to enable simulation mode. If `true`, actual transactions will not be sent.

#### `srcChains`

- **Type**: `Array`
- **Description**: Settings for source chains. Each chain configuration includes the following items:
  - `chainId`: Specifies the chain ID.
  - `pollingInterval`: Specifies the interval (in milliseconds) for polling the blockchain state.
  - `webSocket`: Specifies whether to use websocket to get on-chain events.
  - `confirmation`: Specifies the number of blocks required for transaction confirmation. The key is the transaction amount, and the value is the number of blocks required for confirmation.

```json
"srcChains": [
  {
    "chainId": 1,
    "pollingInterval": 1000,
    "webSocket": true,
    "confirmation": {
      "100": 1,
      "1000": 2
    }
  },
  ...
]
```

#### `dstChains`

- **Type**: `Array`
- **Description**: Settings for destination chains. Each chain configuration includes the following items:
  - `chainId`: Specifies the chain ID.
  - `supportTokens`: Specifies the list of supported tokens. Each token configuration includes the following items:
    - `address`: Specifies the contract address of the token.
    - `symbol`: Specifies the symbol of the token.
    - `decimals`: Specifies the decimals of the token.
    - `minAmount`: Specifies the minimum amount of the token to be sent.
    - `maxAmount`: Specifies the maximum amount of the token to be sent.

```json
"dstChains": [
  {
    "chainId": 8453,
    "supportTokens": [
      {
        "address": "0x4200000000000000000000000000000000000006",
        "symbol": "WETH",
        "decimals": 18,
        "minAmount": 0.0001,
        "maxAmount": 1
      }
    ]
  },
  ...
]
```

## Command Descriptions

### `build`

Compiles TypeScript files and outputs them to the `dist` directory.

```sh
$ pnpm run build
```

### `start`

Builds the project and starts the relayer.

```sh
$ pnpm run start
```

### `dev`

Watches TypeScript files in the `src` directory and automatically restarts on changes.

```sh
$ pnpm run dev
```

### `format`

Formats the code using Prettier.

```sh
$ pnpm run format
```

### `lint`

Lints the code using ESLint.

```sh
$ pnpm run lint
```

### `lint:fix`

Automatically fixes linting issues using ESLint.

```sh
$ pnpm run lint:fix
```
