import { Events, Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { SquareCloudAPI } from '@squarecloud/api';
import { prisma } from '../services/prisma';
import { decrypt } from '../services/encryption.service';
import logger from '../services/logger.service';
import AdmZip from 'adm-zip';

module.exports = {
    name: Events.MessageCreate,
    async execute(message: Message) {
        if (message.author.bot) return;

        const ticket = await prisma.deployTicket.findFirst({
            where: {
                channelId: message.channel.id,
                status: 'PENDING_UPLOAD',
            },
            include: {
                user: {
                    include: {
                        squareCloudKey: true,
                    },
                },
            },
        });

        if (!ticket) return;

        const attachment = message.attachments.first();
        if (!attachment || !attachment.name.endsWith('.zip')) return;

        await message.channel.send('✅ Arquivo `.zip` recebido! Validando e processando o upload...');

        try {
            if (!ticket.user.squareCloudKey) throw new Error('Chave da Square Cloud não encontrada para o usuário.');

            const response = await fetch(attachment.url);
            if (!response.ok) throw new Error(`Falha ao baixar o arquivo: ${response.status} ${response.statusText}`);

            const fileBuffer = Buffer.from(await response.arrayBuffer());

            try {
                const zip = new AdmZip(fileBuffer);
                const zipEntries = zip.getEntries();
                const hasConfigFile = zipEntries.some(entry => entry.entryName === 'squarecloud.config');

                if (!hasConfigFile) {
                    await message.channel.send('❌ **Erro de Validação:** O arquivo `.zip` enviado não contém um `squarecloud.config` na raiz. Por favor, corrija e envie novamente.');
                    return; 
                }
            } catch (zipError) {
                logger.error('Erro ao ler o arquivo .zip', { zipError, ticketId: ticket.id });
                await message.channel.send('❌ **Erro de Validação:** O arquivo enviado parece estar corrompido ou não é um `.zip` válido.');
                return; 
            }

            const decryptedKey = decrypt(ticket.user.squareCloudKey.encryptedKey, ticket.user.squareCloudKey.iv);
            const api = new SquareCloudAPI(decryptedKey);
            
            const uploadedFile = await api.files.create(fileBuffer);

            await prisma.deployTicket.update({
                where: { id: ticket.id },
                data: {
                    status: 'PENDING_PAYMENT',
                    uploadedFileId: uploadedFile.id,
                },
            });

            const embed = new EmbedBuilder()
                .setTitle('Upload Concluído! Efetue o Pagamento')
                .setDescription('Seu arquivo foi validado e enviado com sucesso. Escolha um método de pagamento para iniciar o deploy.')
                .setColor('#23a55a');

            const paymentButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`pay_mp_${ticket.id}`)
                    .setLabel('MercadoPago')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('💳'),
                new ButtonBuilder()
                    .setCustomId(`pay_pp_${ticket.id}`)
                    .setLabel('PushinPay')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('💸')
            );

            await message.channel.send({ embeds: [embed], components: [paymentButtons] });
        } catch (error) {
            const err = error as Error;
            logger.error('Erro no processo de upload para Square Cloud', { error: err.message, ticketId: ticket.id });
            await message.channel.send('❌ Ocorreu um erro durante o processo de upload. Verifique se sua chave `/key` é válida e tente novamente.');
        }
    },
};
