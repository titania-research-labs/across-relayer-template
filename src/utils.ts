import { Address, createPublicClient, erc20Abi, http, parseEther } from 'viem';
import {
  ACROSS_CONFIG_STORE_ABI,
  ACROSS_CONFIG_STORE_ADDRESS,
  HUB_POOL_ABI,
  HUB_POOL_ADDRESS,
  SPOKE_POOL_ADDRESSES,
  WETH_ADDRESSES,
} from './constants';
import { DstChainConfig } from './config';
import { mainnet } from 'viem/chains';

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

export const approveToken = async (
  tokenAddress: Address,
  spenderAddress: Address,
  dstChain: DstChainConfig
) => {
  const { request } = await dstChain.publicClient.simulateContract({
    account: dstChain.walletClient.account,
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spenderAddress, parseEther('100000')],
  });

  await dstChain.walletClient.writeContract(request);
};

export const findClosestBlockByTimestamp = async (
  targetTimestamp: number
): Promise<number> => {
  const client = createPublicClient({
    chain: mainnet,
    cacheTime: 10000,
    transport: http(process.env[`RPC_PROVIDER_1`]),
  });

  const latestBlock = await client.getBlock({ blockTag: 'latest' });

  const timestampDiff = Number(latestBlock.timestamp) - targetTimestamp;

  const blockNumberDiff = Math.floor(timestampDiff / 12);

  return Number(latestBlock.number) - blockNumberDiff;
};

export const multiCall = async (inputAmount: bigint, blockNumber: number) => {
  const hubPoolContract = {
    address: HUB_POOL_ADDRESS,
    abi: HUB_POOL_ABI,
  } as const;

  const acrossConfigStoreContract = {
    address: ACROSS_CONFIG_STORE_ADDRESS,
    abi: ACROSS_CONFIG_STORE_ABI,
  } as const;

  const client = createPublicClient({
    chain: mainnet,
    cacheTime: 10000,
    transport: http(process.env[`RPC_PROVIDER_1`]),
  });

  const WETH_ADDRESS = WETH_ADDRESSES[1];

  const results = await client.multicall({
    contracts: [
      {
        ...hubPoolContract,
        functionName: 'liquidityUtilizationCurrent',
        args: [WETH_ADDRESS],
      },
      {
        ...hubPoolContract,
        functionName: 'liquidityUtilizationPostRelay',
        args: [WETH_ADDRESS, inputAmount],
      },
      {
        ...acrossConfigStoreContract,
        functionName: 'l1TokenConfig',
        args: [WETH_ADDRESS],
      },
    ],
    blockNumber: BigInt(blockNumber),
  });

  return results;
};
