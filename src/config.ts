import {
  Address,
  createPublicClient,
  createWalletClient,
  http,
  PublicClient,
  WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import CONFIG from '../config.json';

import * as dotenv from 'dotenv';
import { ACROSS_CHAIN_IDS, CHAIN_IDs, SPOKE_POOL_ADDRESSES } from './constants';
import { logger } from './logger';

dotenv.config();

export type Token = {
  address: Address;
  symbol: string;
  minAmount: number;
  maxAmount: number;
};

export type SrcChainConfig = {
  chainId: CHAIN_IDs;
  spokePoolAddress: Address;
  publicClient: PublicClient;
  pollingInterval: number;
  blockRange: number;
  confirmation: {
    [key: string]: number | undefined;
  };
};

export type DstChainConfig = {
  chainId: CHAIN_IDs;
  spokePoolAddress: Address;
  publicClient: PublicClient;
  walletClient: WalletClient;
  supportTokens: Token[];
};

export type Config = {
  simulate: boolean;
  relayerAddress: Address;
  srcChains: SrcChainConfig[];
  dstChains: DstChainConfig[];
};

export const account = privateKeyToAccount(
  process.env.PRIVATE_KEY as `0x${string}`
);

export function loadConfig(): Config {
  const srcChains = CONFIG.srcChains.map((chain) => {
    const chainId = chain.chainId;

    if (!ACROSS_CHAIN_IDS.includes(chainId)) {
      logger.error(`Chain id ${chainId} is not supported`);
      process.exit(1);
    }

    const publicClient = createPublicClient({
      transport: http(process.env[`RPC_PROVIDER_${chainId}`]),
    });

    return {
      chainId: chainId,
      spokePoolAddress: SPOKE_POOL_ADDRESSES[chainId],
      publicClient: publicClient,
      pollingInterval: chain.pollingInterval,
      confirmation: chain.confirmation,
      blockRange: chain.blockRange,
    };
  }) as SrcChainConfig[];

  const dstChains = CONFIG.dstChains.map((chain) => {
    const chainId = chain.chainId;

    if (!ACROSS_CHAIN_IDS.includes(chainId)) {
      logger.error(`Chain id ${chainId} is not supported`);
      process.exit(1);
    }

    const publicClient = createPublicClient({
      transport: http(process.env[`RPC_PROVIDER_${chainId}`]),
    });

    const walletClient = createWalletClient({
      account,
      transport: http(process.env[`RPC_PROVIDER_${chainId}`]),
    });

    return {
      chainId: chainId,
      spokePoolAddress: SPOKE_POOL_ADDRESSES[chainId],
      publicClient: publicClient,
      walletClient: walletClient,
      supportTokens: chain.supportTokens as Token[],
    };
  });

  const config = {
    simulate: CONFIG.simulate,
    relayerAddress: account.address,
    srcChains,
    dstChains,
  };

  logger.info(`Config: ${JSON.stringify(config, null, 2)}`);

  return config;
}
