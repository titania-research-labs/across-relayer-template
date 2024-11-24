import {
  Address,
  formatEther,
  Log,
  parseEther,
  parseUnits,
  zeroAddress,
} from 'viem';
import { SrcChainConfig, Config } from '../config';
import { SPOKE_POOL_ABI, WETH_ADDRESSES } from '../constants';
import { logger } from '../logger';
import { AcrossDepositEventLog, AcrossFillOrder } from '../types';

export class IntentListenerService {
  constructor(readonly config: Config) {}

  async listen(
    chain: SrcChainConfig,
    onEvent: (
      fillOrder: AcrossFillOrder,
      config: Config
    ) => void | Promise<void>
  ) {
    const unwatch = chain.publicClient.watchContractEvent({
      address: chain.spokePoolAddress,
      abi: SPOKE_POOL_ABI,
      pollingInterval: chain.webSocket ? undefined : chain.pollingInterval,
      eventName: 'V3FundsDeposited',
      onLogs: async (logs) => {
        logger.debug(`Found ${logs.length} V3FundsDeposited events`);
        const fillOrders = await this.filter(
          logs as AcrossDepositEventLog[],
          chain
        );

        logger.debug(
          `Found ${fillOrders.length} fill orders: ${JSON.stringify(
            fillOrders,
            (_, v) => (typeof v === 'bigint' ? v.toString() : v),
            2
          )}`
        );

        const promises: any[] = [];
        fillOrders.forEach((fillOrder) => {
          promises.push(this.executeEvent(chain, fillOrder, onEvent));
        });

        await Promise.all(promises);
      },
    });
    logger.info(
      `Listening for V3FundsDeposited events on chain id ${chain.chainId}`
    );

    return unwatch;
  }

  private async filter(
    logs: AcrossDepositEventLog[],
    srcChain: SrcChainConfig
  ): Promise<AcrossFillOrder[]> {
    const filteredOrders: AcrossFillOrder[] = [];

    for (const log of logs) {
      const {
        destinationChainId,
        inputToken,
        outputToken,
        outputAmount,
        exclusiveRelayer,
      } = log.args;

      // filter by block number
      if (!log.blockNumber || !log.blockHash) {
        logger.debug(`Skipping order with no block number or block hash`);
        continue;
      }

      // filter by exclusive relayer
      if (
        exclusiveRelayer !== this.config.relayerAddress &&
        exclusiveRelayer !== zeroAddress
      ) {
        logger.debug(
          `Skipping order with exclusive relayer ${exclusiveRelayer}`
        );
        continue;
      }

      // filter by dst chain id
      const dstChainId = Number(destinationChainId);
      const dstChain = this.config.dstChains.find(
        (chain) => chain.chainId === dstChainId
      );
      if (!dstChain) {
        logger.debug(`Destination chain ${dstChainId} is not supported`);
        continue;
      }

      // filter by token and amount
      const availableToken = dstChain.supportTokens.find((token) => {
        const isOutputTokenMatch = token.address === outputToken;
        const isWethMatch =
          token.symbol === 'WETH' &&
          inputToken === WETH_ADDRESSES[srcChain.chainId];

        return (isOutputTokenMatch || isWethMatch) && token;
      });

      if (!availableToken) {
        logger.debug(`No available token on chain ${dstChainId}`);
        continue;
      }

      const isAmountInRange =
        parseUnits(
          availableToken.minAmount.toString(),
          availableToken.decimals
        ) <= outputAmount &&
        outputAmount <=
          parseUnits(
            availableToken.maxAmount.toString(),
            availableToken.decimals
          );
      const parsedOutputAmount = formatEther(outputAmount);

      if (!isAmountInRange) {
        logger.debug(
          `Amount ${parsedOutputAmount} is not in the range (${availableToken.minAmount} - ${availableToken.maxAmount}) for ${availableToken.symbol} on chain ${dstChainId}`
        );
        continue;
      }

      filteredOrders.push({
        order: {
          depositor: log.args.depositor,
          recipient: log.args.recipient,
          exclusiveRelayer: log.args.exclusiveRelayer,
          inputToken: log.args.inputToken,
          outputToken: availableToken.address,
          inputAmount: log.args.inputAmount,
          outputAmount: outputAmount,
          originChainId: BigInt(srcChain.chainId),
          depositId: BigInt(log.args.depositId),
          fillDeadline: BigInt(log.args.fillDeadline),
          exclusivityDeadline: BigInt(log.args.exclusivityDeadline),
          message: log.args.message as `0x${string}`,
        },
        dstChainId: BigInt(dstChainId),
        blockNumber: BigInt(log.blockNumber),
        blockHash: log.blockHash,
        quoteTimestamp: log.args.quoteTimestamp,
      });
    }

    return filteredOrders;
  }

  private async executeEvent(
    srcChain: SrcChainConfig,
    fillOrder: AcrossFillOrder,
    onEvent: (
      fillOrder: AcrossFillOrder,
      config: Config
    ) => void | Promise<void>
  ) {
    // filter by confirmation block
    const confirmationBlockThresholds = srcChain.confirmation;

    // Find the highest threshold that the amount exceeds
    const thresholdAmount = Object.keys(confirmationBlockThresholds)
      .map(Number)
      .sort((a, b) => a - b)
      .reverse()
      .find(
        (threshold) =>
          fillOrder.order.inputAmount >= parseEther(threshold.toString())
      );

    if (!thresholdAmount) {
      logger.debug(`No confirmation block threshold found`);
      return;
    }

    const confirmationBlock = confirmationBlockThresholds[thresholdAmount];

    if (confirmationBlock && confirmationBlock > 0) {
      const thresholdBlockNumber =
        Number(confirmationBlock) + Number(fillOrder.blockNumber);
      const currentBlockNumber = await srcChain.publicClient.getBlockNumber();
      if (currentBlockNumber < thresholdBlockNumber) {
        logger.debug(
          `Not enough confirmations: { currentBlockNumber: ${currentBlockNumber}, thresholdBlockNumber: ${thresholdBlockNumber} }`
        );

        const unwatch = srcChain.publicClient.watchBlocks({
          pollingInterval: 200,
          onBlock: async (block) => {
            if (block.number >= thresholdBlockNumber) {
              const fetchedBlock = await srcChain.publicClient.getBlock({
                blockNumber: fillOrder.blockNumber,
              });
              if (fetchedBlock.hash === fillOrder.blockHash) {
                logger.debug(`Confimation reached: ${thresholdBlockNumber}`);
                unwatch();
                await onEvent(fillOrder, this.config);
              } else {
                logger.debug(
                  `Different block hash: { fetchedBlockHash: ${fetchedBlock.hash}, fillOrderBlockHash: ${fillOrder.blockHash} }`
                );
                unwatch();
              }
            }
          },
          onError: (error) => {
            logger.warn(`Error watching blocks: ${error}`);
            unwatch();
            return;
          },
        });
      }
    } else {
      await onEvent(fillOrder, this.config);
    }
  }
}
