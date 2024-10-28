import { Address, createPublicClient, erc20Abi, http } from 'viem';
import { SPOKE_POOL_ADDRESSES } from './constants';
import { DstChainConfig } from './config';

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
