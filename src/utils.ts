import { Address, createPublicClient, erc20Abi, http } from 'viem';
import { ACROSS_CONFIG_STORE_ABI, ACROSS_CONFIG_STORE_ADDRESS, HUB_POOL_ABI, HUB_POOL_ADDRESS, SPOKE_POOL_ADDRESSES, WETH_ADDRESSES } from './constants';
import { DstChainConfig } from './config';
import { logger } from './logger';
import { mainnet } from 'viem/chains'

export const getSpokePoolAddress = (chainId: number) => {
  return SPOKE_POOL_ADDRESSES[chainId as keyof typeof SPOKE_POOL_ADDRESSES];
};

export const getPublicClient = (chainId: number) => {
  return createPublicClient({
    cacheTime: 10000,
    transport: http(process.env[`RPC_PROVIDER_${chainId}`]),
  });
};

export const checkEnoughAllowance = async (
  tokenAddress: Address,
  spenderAddress: Address,
  dstChain: DstChainConfig
) => {
  const allowance = await dstChain.publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [dstChain.walletClient.account!.address, spenderAddress],
  });

  return allowance > 0;
};
