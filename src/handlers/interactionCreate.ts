import { Events, Interaction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CustomClient } from '../index';
import logger, { auditLog } from '../services/logger.service';
import { createMpPayment, createPpPayment } from '../services/paymentService';

const GENERIC_ERROR_MESSAGE = '❌ Ocorreu um erro inesperado. A equipe de desenvolvimento já foi notificada.';

function buildPaymentResponse(paymentResult: any) {
    const embed = new EmbedBuilder()
        .setColor('#00b0f4')
        .setTitle('Finalize seu Pagamento')
        .setDescription('Escaneie o QR Code com o app do seu banco ou use o Pix Copia e Cola para pagar.')
        .setImage(paymentResult.qrCodeImageUrl)
        .addFields({ name: 'Pix Copia e Cola', value: `\`\`\`${paymentResult.qrCode}\`\`\`` })
        .setFooter({ text: `ID da Transação: ${paymentResult.providerId}` });

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setLabel('Abrir Link de Pagamento')
                .setURL(paymentResult.paymentLink)
                .setStyle(ButtonStyle.Link)
                .setEmoji('🔗')
        );

    return { embeds: [embed], components: [row], ephemeral: true };
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction, client: CustomClient) {
        const logMeta = {
            user: { id: interaction.user.id, tag: interaction.user.tag },
            guild: { id: interaction.guild?.id },
        };

        try {
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) {
                    logger.warn(`Comando não encontrado: ${interaction.commandName}`, logMeta);
                    return interaction.reply({ content: 'Comando não encontrado.', ephemeral: true });
                }
                logger.info(`Executando comando: /${interaction.commandName}`, logMeta);
                await command.execute(interaction);
            } else if (interaction.isButton()) {
                const [action, provider, ticketId] = interaction.customId.split('_');
                const buttonLogMeta = { ...logMeta, customId: interaction.customId };

                logger.info(`Botão pressionado`, buttonLogMeta);

                if (action === 'pay') {
                    await interaction.deferReply({ ephemeral: true });
                    try {
                        let paymentResult;

                        switch (provider) {
                            case 'mp':
                                paymentResult = await createMpPayment(ticketId, interaction.user, interaction.guildId!);
                                break;
                            case 'pp':
                                paymentResult = await createPpPayment(ticketId, interaction.user, interaction.guildId!);
                                break;
                            default:
                                // Ignora outros botões que não são de pagamento
                                return;
                        }

                        const responsePayload = buildPaymentResponse(paymentResult);
                        await interaction.editReply(responsePayload);
                        await auditLog('INFO', `Pagamento ${provider.toUpperCase()} gerado para o ticket ${ticketId}`, buttonLogMeta, interaction.user.id);
                    } catch (paymentError: any) {
                        logger.error('Falha ao gerar pagamento', { ...buttonLogMeta, error: paymentError });
                        await interaction.editReply({ content: '❌ Não foi possível gerar seu link de pagamento.' });
                    }
                }
            }
        } catch (error) {
            logger.error('Erro não tratado no nível da interação!', { ...logMeta, customId: (interaction as any).customId, commandName: (interaction as any).commandName, error });
            if (interaction.isRepliable()) {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: GENERIC_ERROR_MESSAGE, ephemeral: true });
                } else {
                    await interaction.reply({ content: GENERIC_ERROR_MESSAGE, ephemeral: true });
                }
            }
        }
    },
};
