import { logger } from './logger';
import { Config, loadConfig } from './config';
import { IntentListenerService } from './services/intent-listener';
import { AcrossFillOrder } from './types';
import { IntentFillerService } from './services/intent-filler';
import { getSpokePoolAddress, checkEnoughAllowance } from './utils';

async function main() {
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
        logger.error(
          `Not enough allowance of ${token.symbol} on ${dstChain.chainId}`
        );
        process.exit(1);
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

    intentListenerService.listen(srcChain, onEvent);
  }
}

main();
