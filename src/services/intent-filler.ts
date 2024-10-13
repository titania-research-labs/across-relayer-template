import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  parseEther,
  parseGwei,
} from 'viem';
import { Config, DstChainConfig } from '../config';
import { CHAIN_IDs, GAS_USED_PER_SPOKE_POOL_FILL, SPOKE_POOL_ABI } from '../constants';
import { logger } from '../logger';
import { AcrossFillOrder } from '../types';
import { relayFeeCalculator } from "@across-protocol/sdk-v2"
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
    const gas = await this.calculateGas();
    logger.debug(`Calculated gas: ${gas}`);

    const { request } = await this.dstChain.publicClient.simulateContract({
      account: this.dstChain.walletClient.account,
      address: this.dstChain.spokePoolAddress,
      abi: SPOKE_POOL_ABI,
      functionName: 'fillV3Relay',
      args: [this.fillOrder.order, this.fillOrder.dstChainId],
      gasPrice: gas,
    });

    if (this.simulateMode) {
      logger.info(`Simulated fillV3Relay transaction`);
    } else {
      logger.debug(`Simulated fillV3Relay transaction`);
    }

    return request;
  }

  private async calculateRelayerFee() {
    const closestBlock = await findClosestBlockByTimestamp(this.fillOrder.quoteTimestamp);
    const [currentUt, nextUt, rawL1TokenConfig] = await multiCall(this.fillOrder.order.inputAmount, closestBlock);

    const parsedL1TokenConfig =
      sdk.contracts.acrossConfigStore.Client.parseL1TokenConfig(
        String(rawL1TokenConfig.result)
      );
    const rateModel =
      parsedL1TokenConfig.rateModel;
    const lpFeePct = sdk.lpFeeCalculator.calculateRealizedLpFeePct(
      rateModel,
      BigNumber.from(currentUt.result),
      BigNumber.from(nextUt.result)
    );

    const inputAmout = BigNumber.from(this.fillOrder.order.inputAmount)
    const outputAmount = BigNumber.from(this.fillOrder.order.outputAmount)

    const lpFeeTotal = inputAmout.mul(lpFeePct).div(ethers.constants.WeiPerEther);
    const relayerFeeTotal = inputAmout.sub(outputAmount).sub(lpFeeTotal)
    return parseInt(relayerFeeTotal.toString())
  }

  private async calculateGas() {
    let gas = parseGwei('0.01');

    if (this.fillOrder.order.originChainId == BigInt(CHAIN_IDs.MAINNET)) {
      return gas;
    }


    const relayerFee = await this.calculateRelayerFee();

    if (relayerFee < 0) {
      return gas
    }

    if (this.fillOrder.order.outputAmount < parseEther('0.1')) {
      gas = BigInt(
        Math.ceil(Number((relayerFee * 0.7) / GAS_USED_PER_SPOKE_POOL_FILL))
      );
    } else if (
      this.fillOrder.order.outputAmount > parseEther('0.1') &&
      this.fillOrder.order.outputAmount < parseEther('0.4')
    ) {
      gas = BigInt(
        Math.ceil(Number((relayerFee * 0.35) / GAS_USED_PER_SPOKE_POOL_FILL))
      );
    } else if (
      this.fillOrder.order.outputAmount > parseEther('0.4') &&
      this.fillOrder.order.outputAmount < parseEther('1')
    ) {
      gas = BigInt(
        Math.ceil(Number((relayerFee * 0.3) / GAS_USED_PER_SPOKE_POOL_FILL))
      );
    } else if (
      this.fillOrder.order.outputAmount > parseEther('1') &&
      this.fillOrder.order.outputAmount < parseEther('2')
    ) {
      gas = BigInt(
        Math.ceil(Number((relayerFee * 0.07) / GAS_USED_PER_SPOKE_POOL_FILL))
      );
    } else if (
      this.fillOrder.order.outputAmount > parseEther('2') &&
      this.fillOrder.order.outputAmount < parseEther('3')
    ) {
      gas = BigInt(
        Math.ceil(Number((relayerFee * 0.035) / GAS_USED_PER_SPOKE_POOL_FILL))
      );
    }

    if (Number(this.fillOrder.dstChainId) == (CHAIN_IDs.BLAST)) {
      gas = BigInt(Math.ceil(Number(gas) / 100))
    }

    return gas;
  }
}
