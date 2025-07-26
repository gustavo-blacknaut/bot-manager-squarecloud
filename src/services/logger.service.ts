import winston from 'winston';
import { prisma } from './prisma';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} ${level}: ${stack || message}`;
});

const logger = winston.createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: combine(
            colorize(),
            logFormat
        ),
    }));
}

export async function auditLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: object, userId?: string) {
    try {
        const user = userId ? await prisma.user.findUnique({ where: { discordId: userId } }) : null;
        await prisma.log.create({
            data: {
                level,
                message,
                meta: meta || {},
                userId: user?.id,
            },
        });
    } catch (dbError) {
        logger.error('Falha ao gravar log de auditoria no banco de dados.', { error: dbError });
    }
}

export default logger;