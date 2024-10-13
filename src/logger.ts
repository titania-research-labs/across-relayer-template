import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, label, prettyPrint, colorize } = format;

const baseFormats = [timestamp(), prettyPrint(), colorize()];

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

export const logger = createLogger({
  level: 'debug',
  format: combine(label({ label: 'relayer' }), ...baseFormats),
  transports: [
    new transports.File({ filename: 'error.log', level: 'error' }),
    new transports.File({ filename: 'combined.log' }),
  ],
});

logger.add(
  new transports.Console({
    format: combine(
      label({ label: 'relayer' }),
      label({ label: 'across' }),
      ...baseFormats,
      myFormat
    ),
  })
);
