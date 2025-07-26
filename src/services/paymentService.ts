import { MercadoPagoConfig, Payment } from 'mercadopago';
import { User } from 'discord.js';
import { prisma } from './prisma';
import logger from './logger.service';

interface PushinPayResponse {
  id: string | number;
  qr_code_image_base64?: string;
  qr_code_text: string;
}

// Função para MercadoPago
export async function createMpPayment(ticketId: string, user: User, guildId: string) {
    const guildConfig = await prisma.guildConfig.findUnique({ where: { guildId } });
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

    if (!accessToken || !guildConfig?.deployPrice) {
        throw new Error('Credenciais do MercadoPago ou preço não configurados no servidor.');
    }

    const mpClient = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(mpClient);
    const notificationUrl = `${process.env.PUBLIC_URL}/webhook/mercadopago`;

    const result = await payment.create({
        body: {
            transaction_amount: guildConfig.deployPrice,
            description: `Deploy de Aplicação - Ticket ${ticketId}`,
            external_reference: ticketId,
            payment_method_id: 'pix',
            notification_url: notificationUrl,
            payer: { email: `${user.id}@bot-payer.com`, first_name: user.username },
        }
    });

    const userRecord = await prisma.user.findUnique({ where: { discordId: user.id } });
    await prisma.payment.create({
        data: {
            provider: 'mercadopago',
            providerId: result.id!.toString(),
            amount: guildConfig.deployPrice,
            deployTicketId: ticketId,
            userId: userRecord!.id,
        }
    });

    return {
        providerId: result.id,
        qrCodeImageUrl: `data:image/png;base64,${result.point_of_interaction?.transaction_data?.qr_code_base64}`,
        qrCode: result.point_of_interaction?.transaction_data?.qr_code,
        paymentLink: result.point_of_interaction?.transaction_data?.ticket_url,
    };
}

// Função para PushinPay
export async function createPpPayment(ticketId: string, user: User, guildId: string) {
  const guildConfig = await prisma.guildConfig.findUnique({ where: { guildId } });
  const apiKey = process.env.PUSHINPAY_API_KEY;

  if (!apiKey || !guildConfig?.deployPrice) {
    throw new Error('Credenciais do PushinPay ou preço não configurados no servidor.');
  }

  try {
    const response = await fetch('https://api.pushinpay.com.br/api/pix/cashIn', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        value: Math.round(guildConfig.deployPrice * 100),
        reference_id: ticketId,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('Erro na resposta do PushinPay:', errorBody);
      throw new Error(`Erro na requisição PushinPay: ${response.status} ${response.statusText}`);
    }

    const paymentData = (await response.json()) as PushinPayResponse;

    const userRecord = await prisma.user.findUnique({ where: { discordId: user.id } });
    if (!userRecord) throw new Error('Usuário não encontrado no banco de dados.');

    await prisma.payment.create({
      data: {
        provider: 'pushinpay',
        providerId: paymentData.id.toString(),
        amount: guildConfig.deployPrice,
        deployTicketId: ticketId,
        userId: userRecord.id,
      }
    });

    return {
      providerId: paymentData.id,
      qrCodeImageUrl: paymentData.qr_code_image_base64 ||
        `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(paymentData.qr_code_text)}`,
      qrCode: paymentData.qr_code_text,
      paymentLink: `https://pushin.pay/pay/${paymentData.id}`,
    };
  } catch (error: any) {
    logger.error('Erro na criação do Pix com PushinPay:', error?.message || error);
    throw new Error('Erro ao criar Pix com PushinPay');
  }
}