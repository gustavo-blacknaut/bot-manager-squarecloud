import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ButtonInteraction
} from 'discord.js';
import { SquareCloudAPI, Application } from '@squarecloud/api';
import { prisma } from '../../services/prisma';
import { decrypt } from '../../services/encryption.service';
import logger, { auditLog } from '../../services/logger.service';

async function handleAppAction(interaction: ButtonInteraction, api: SquareCloudAPI) {
    await interaction.deferUpdate();
    const customId = interaction.customId;
    const [action, type, appId] = customId.split('_') as [string, string, string];

    try {
        const app = await api.apps.get(appId);
        if (!app) throw new Error('Aplicação não encontrada.');

        let feedback = '';
        const fullAction = `${action}_${type}`;

        switch (fullAction) {
            case 'app_start':
                await app.start();
                feedback = `✅ Iniciando a aplicação **${app.tag}**.`;
                break;
            case 'app_stop':
                await app.stop();
                feedback = `🛑 Parando a aplicação **${app.tag}**.`;
                break;
            case 'app_restart':
                await app.restart();
                feedback = `🔄 Reiniciando a aplicação **${app.tag}**.`;
                break;
            case 'app_logs':
                const logs = await app.getLogs();
                feedback = `**Logs de ${app.tag}:**\n\`\`\`\n${logs.slice(-1900)}\n\`\`\``;
                break;
            case 'app_delete':
                await app.delete();
                feedback = `🗑️ Aplicação **${app.tag}** deletada.`;
                break;
            default:
                return;
        }

        await interaction.followUp({ content: feedback, ephemeral: true });
        await auditLog('INFO', `Ação '${fullAction}' executada na app ${appId}`, { appId }, interaction.user.id);
    } catch (apiError) {
        logger.error('Erro ao executar ação na aplicação', { appId, action, apiError });
        await interaction.followUp({ content: `❌ Falha ao executar a ação na aplicação.`, ephemeral: true });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Lista e gerencia suas aplicações na Square Cloud.'),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        let api: SquareCloudAPI;

        try {
            const userRecord = await prisma.user.findUnique({
                where: { discordId: interaction.user.id },
                include: { squareCloudKey: true }
            });

            if (!userRecord?.squareCloudKey) {
                return await interaction.editReply({
                    content: '❌ Você precisa configurar sua chave da Square Cloud primeiro. Use o comando `/key`.'
                });
            }

            const decryptedKey = decrypt(
                userRecord.squareCloudKey.encryptedKey,
                userRecord.squareCloudKey.iv
            );

            api = new SquareCloudAPI(decryptedKey);
        } catch (error) {
            logger.error('Falha ao obter e decriptografar chave do usuário', {
                userId: interaction.user.id,
                error
            });
            throw error;
        }

        try {
            const apps: Application[] = await api.apps.list();

            if (apps.length === 0) {
                return await interaction.editReply({
                    content: 'Você não possui nenhuma aplicação na Square Cloud.'
                });
            }

            const generateEmbed = (app: Application, index: number, total: number) =>
                new EmbedBuilder()
                    .setColor(app.isRunning() ? '#23a55a' : '#f23f43')
                    .setTitle(`Status: ${app.tag}`)
                    .setURL(`https://squarecloud.app/dashboard/app/${app.id}`)
                    .addFields(
                        { name: 'ID', value: `\`${app.id}\``, inline: true },
                        { name: 'Status', value: app.isRunning() ? 'Online' : 'Offline', inline: true },
                        { name: 'RAM', value: `${app.ram}MB`, inline: true },
                        { name: 'Linguagem', value: app.lang, inline: true },
                        { name: 'Cluster', value: app.cluster, inline: true }
                    )
                    .setFooter({ text: `Aplicação ${index + 1} de ${total}` });

            const generateButtons = (app: Application) =>
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`app_start_${app.id}`)
                        .setLabel('Start')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(app.isRunning()),
                    new ButtonBuilder()
                        .setCustomId(`app_stop_${app.id}`)
                        .setLabel('Stop')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(!app.isRunning()),
                    new ButtonBuilder()
                        .setCustomId(`app_restart_${app.id}`)
                        .setLabel('Restart')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`app_logs_${app.id}`)
                        .setLabel('Logs')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`app_delete_${app.id}`)
                        .setLabel('Delete')
                        .setStyle(ButtonStyle.Danger)
                );

            const message = await interaction.editReply({
                embeds: [generateEmbed(apps[0], 0, apps.length)],
                components: [generateButtons(apps[0])]
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000
            });

            collector.on('collect', async (i: ButtonInteraction) => {
                if (i.user.id !== interaction.user.id) {
                    return await i.reply({
                        content: 'Estes botões não são para você.',
                        ephemeral: true
                    });
                }

                await handleAppAction(i, api);

                const updatedApps = await api.apps.list();
                const currentAppId = i.customId.split('_')[2];
                const currentApp = updatedApps.find((a: Application) => a.id === currentAppId);

                if (i.customId.startsWith('app_delete') || !currentApp) {
                    collector.stop();
                    return;
                }

                const appIndex = updatedApps.findIndex((a: Application) => a.id === currentApp.id);

                await i.message.edit({
                    embeds: [generateEmbed(currentApp, appIndex, updatedApps.length)],
                    components: [generateButtons(currentApp)]
                });
            });

            collector.on('end', () => {
                interaction
                    .editReply({
                        content: 'Sessão de gerenciamento encerrada.',
                        components: []
                    })
                    .catch((e: unknown) => {
                        const error = e as Error;
                        logger.warn('Não foi possível editar a mensagem de status após o fim do coletor.', {
                            error
                        });
                    });

            });
        } catch (error) {
            logger.error('Falha ao listar aplicações do usuário', {
                userId: interaction.user.id,
                error
            });
            throw error;
        }
    }
};
