import { logger } from './logger';
import { Config, loadConfig } from './config';
import { IntentListenerService } from './services/intent-listener';
import { AcrossFillOrder } from './types';
import { IntentFillerService } from './services/intent-filler';
import { getSpokePoolAddress, checkEnoughAllowance, approveToken } from './utils';

async function main() {
  await runRelayer();
}

const runRelayer = async () => {
  logger.info('Starting Relayer...');

  const config = loadConfig();

  logger.info('Checking allowance...');
  for (const dstChain of config.dstChains) {
    const spokePoolAddress = getSpokePoolAddress(dstChain.chainId);
    for (const token of dstChain.supportTokens) {
      const isEnoughAllowance = await checkEnoughAllowance(
        token.address,
        spokePoolAddress,
        dstChain
      );

      if (!isEnoughAllowance) {
        logger.warn(
          `Not enough allowance of ${token.symbol} on ${dstChain.chainId}`
        );
        logger.info(`Approving ${token.symbol} on ${dstChain.chainId}`);
        await approveToken(token.address, spokePoolAddress, dstChain);
        logger.info(`Approved ${token.symbol} on ${dstChain.chainId}`);
      }
    }
  }

  logger.info('Completed checking allowance');

  // run across relayers
  for (const srcChain of config.srcChains) {
    const intentListenerService = new IntentListenerService(config);

    const onEvent = async (fillOrder: AcrossFillOrder, config: Config) => {
      const fillIntentService = new IntentFillerService(fillOrder, config);
      await fillIntentService.fill();
    };

    let unwatch = await intentListenerService.listen(srcChain, onEvent);

    setInterval(async () => {
      unwatch();
      unwatch = await intentListenerService.listen(srcChain, onEvent);
    }, 30 * 60 * 1000);
  }
};

main();
