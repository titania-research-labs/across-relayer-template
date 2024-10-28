import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
} from 'viem';
import { Config, DstChainConfig } from '../config';
import { CHAIN_IDs, SPOKE_POOL_ABI } from '../constants';
import { logger } from '../logger';
import { AcrossFillOrder } from '../types';

export class IntentFillerService {
  private readonly dstChain: DstChainConfig;
  private readonly simulateMode: boolean;

  constructor(
    readonly fillOrder: AcrossFillOrder,
    config: Config
  ) {
    this.simulateMode = config.simulate;

    const dstChain = config.dstChains.find(
      (chain) => BigInt(chain.chainId) === fillOrder.dstChainId
    );
    if (!dstChain) {
      logger.error(
        `Destination chain not found for chainId: ${fillOrder.dstChainId}`
      );
      process.exit(1);
    }
    this.dstChain = dstChain;
  }

  async fill() {
    try {
      const request = await this.simulate();
      if (this.simulateMode) {
        return;
      } else {
        logger.debug(`Filling order on chain ${this.fillOrder.dstChainId}`);

        const hash = await this.dstChain.walletClient.writeContract(request);

        const transaction =
          await this.dstChain.publicClient.waitForTransactionReceipt({ hash });
        if (transaction.status !== 'success') {
          logger.warn(`Transaction failed: ${hash}`);
          return;
        } else {
          logger.info(`Transaction successful: ${hash}`);
        }
      }
    } catch (error) {
      if (error instanceof BaseError) {
        const revertError = error.walk(
          (err) => err instanceof ContractFunctionRevertedError
        );

        const executionError = error.walk(
          (err) => err instanceof ContractFunctionExecutionError
        );

        if (revertError instanceof ContractFunctionRevertedError) {
          const errorName = revertError.data?.errorName ?? '';
          logger.warn(`Failed to fill order: ${errorName}`);
        } else if (executionError instanceof ContractFunctionExecutionError) {
          const errorName = executionError.name;
          logger.warn(`Failed to fill order: ${errorName}`);
        } else {
          logger.warn(`Failed to fill order: ${error}`);
        }
      } else {
        logger.warn(`Failed to fill order: ${error}`);
      }
      return;
    }
  }

  private async simulate() {
    const { request } = await this.dstChain.publicClient.simulateContract({
      account: this.dstChain.walletClient.account,
      address: this.dstChain.spokePoolAddress,
      abi: SPOKE_POOL_ABI,
      functionName: 'fillV3Relay',
      args: [this.fillOrder.order, this.fillOrder.dstChainId],
    });

    if (this.simulateMode) {
      logger.info(`Simulated fillV3Relay transaction`);
    } else {
      logger.debug(`Simulated fillV3Relay transaction`);
    }

    return request;
  }
}
