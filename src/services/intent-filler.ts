import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  parseEther,
  parseGwei,
} from 'viem';
import { Config, DstChainConfig } from '../config';
import {
  CHAIN_IDs,
  GAS_USED_PER_SPOKE_POOL_FILL,
  SPOKE_POOL_ABI,
} from '../constants';
import { logger } from '../logger';
import { AcrossFillOrder } from '../types';
import { BigNumber, ethers } from 'ethers';
import { findClosestBlockByTimestamp, multiCall } from '../utils';
import * as sdk from '@across-protocol/sdk-v2';
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

        logger.debug(`Filled order on chain ${this.fillOrder.dstChainId}: ${hash}`);

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
          logger.warn(`Error: ${error}`);
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
    const gas = await this.calculateGas();

    let simulateContractParams;

    simulateContractParams = {
      account: this.dstChain.walletClient.account,
      address: this.dstChain.spokePoolAddress,
      abi: SPOKE_POOL_ABI,
      functionName: 'fillV3Relay',
      args: [this.fillOrder.order, this.fillOrder.dstChainId],
    };
    if (gas.gasPrice !== BigInt(0) && gas.maxFeePerGas == BigInt(0) && gas.maxPriorityFeePerGas == BigInt(0)) {
      simulateContractParams = {
        ...simulateContractParams,
        gasPrice: gas.gasPrice,
        gas: BigInt(GAS_USED_PER_SPOKE_POOL_FILL * 5)
      };
    } else if (gas.maxFeePerGas !== BigInt(0) && gas.maxPriorityFeePerGas !== BigInt(0)) {
      simulateContractParams = {
        ...simulateContractParams,
        maxFeePerGas: gas.maxFeePerGas,
        maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
        gas: BigInt(GAS_USED_PER_SPOKE_POOL_FILL * 2)
      };
    }

    const { request } = await this.dstChain.publicClient.simulateContract(simulateContractParams);

    if (this.simulateMode) {
      logger.info(`Simulated fillV3Relay transaction`);
    } else {
      logger.debug(`Simulated fillV3Relay transaction`);
    }

    return request;
  }

  private async calculateRelayerFee() {
    const closestBlock = await findClosestBlockByTimestamp(
      this.fillOrder.quoteTimestamp
    );
    const [currentUt, nextUt, rawL1TokenConfig] = await multiCall(
      this.fillOrder.order.inputAmount,
      closestBlock
    );

    const parsedL1TokenConfig =
      sdk.contracts.acrossConfigStore.Client.parseL1TokenConfig(
        String(rawL1TokenConfig.result)
      );
    const routeRateModelKey = `${this.fillOrder.order.originChainId}-${this.fillOrder.dstChainId}`;
    logger.debug(`Route rate model key: ${routeRateModelKey}`);
    const rateModel =
      parsedL1TokenConfig.routeRateModel?.[routeRateModelKey] ||
      parsedL1TokenConfig.rateModel;
    const lpFeePct = sdk.lpFeeCalculator.calculateRealizedLpFeePct(
      rateModel,
      BigNumber.from(currentUt.result),
      BigNumber.from(nextUt.result)
    );

    const inputAmout = BigNumber.from(this.fillOrder.order.inputAmount);
    const outputAmount = BigNumber.from(this.fillOrder.order.outputAmount);

    const lpFeeTotal = inputAmout
      .mul(lpFeePct)
      .div(ethers.constants.WeiPerEther);
    const relayerFeeTotal = inputAmout.sub(outputAmount).sub(lpFeeTotal);
    return parseInt(relayerFeeTotal.toString());
  }

  private async calculateGas() {
    return {
      gasPrice: BigInt(0),
      maxFeePerGas: BigInt(0),
      maxPriorityFeePerGas: BigInt(0)
    };
  }
}
