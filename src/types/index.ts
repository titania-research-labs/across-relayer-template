import { Address, Log } from 'viem';

export type AcrossDepositEvent = {
  destinationChainId: bigint;
  depositId: number;
  depositor: Address;
  inputToken: Address;
  outputToken: Address;
  inputAmount: bigint;
  outputAmount: bigint;
  quoteTimestamp: number;
  fillDeadline: number;
  exclusivityDeadline: number;
  recipient: Address;
  exclusiveRelayer: Address;
  message: string;
};

export type AcrossDepositEventLog = Log & { args: AcrossDepositEvent };

export type AcrossFillOrder = {
  order: {
    depositor: Address;
    recipient: Address;
    exclusiveRelayer: Address;
    inputToken: Address;
    outputToken: Address;
    inputAmount: bigint;
    outputAmount: bigint;
    originChainId: bigint;
    depositId: bigint;
    fillDeadline: bigint;
    exclusivityDeadline: bigint;
    message: `0x${string}`;
  };
  dstChainId: bigint;
  blockNumber: bigint;
  blockHash: `0x${string}`;
  quoteTimestamp: number;
};
