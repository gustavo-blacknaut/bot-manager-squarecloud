# 🤖 Bot Gerenciador de Deploy para Square Cloud

Um bot de **Discord** de nível profissional, projetado para ser uma plataforma completa de **gerenciamento e venda de deploys de aplicações na Square Cloud**. Construído com foco em **robustez, segurança e escalabilidade**.

## ✨ Funcionalidades Principais

* ✅ **Sistema de Deploy via Ticket**
  O comando `/deploy` cria um canal privado onde o usuário pode enviar um arquivo `.zip`, garantindo um fluxo organizado e individual.

* 💳 **Pagamento Multi-Provedor**
  Integração nativa com **MercadoPago** e **PushinPay**. O bot gera um **QR Code PIX** automaticamente no ticket após o upload do arquivo.

* 🚀 **Deploy Automático**
  Assim que o pagamento é confirmado via webhook, o bot automaticamente utiliza a chave de API do usuário para fazer o **deploy na conta Square Cloud**.

* 🔐 **Gerenciamento de Chaves Seguro**
  O comando `/key` permite que usuários salvem suas **chaves da Square Cloud**, criptografadas no banco de dados para máxima segurança.

* 🧩 **Gerenciamento Completo de Aplicações**
  O comando `/status` lista todas as aplicações do usuário com botões de controle:

  * Start
  * Stop
  * Restart
  * Logs
  * Delete

* ⚙️ **Configuração por Servidor**
  Administradores podem usar o comando `/config` para definir:

  * Preço do deploy
  * Categoria de tickets

* 🧾 **Sistema de Logs Abrangente**
  Todas as ações importantes são registradas em arquivos e no banco de dados com **Winston** e sistema de auditoria.

* 🧱 **Arquitetura Resiliente**
  Manipuladores globais para `uncaughtException` e `unhandledRejection`, garantindo que o bot **nunca caia por erro inesperado**.

## ⚙️ Setup e Instalação

### 1. Pré-requisitos

* Node.js **v18+**
* Conta na **Square Cloud**
* Conta no **MercadoPago** e/ou **PushinPay** (18+)
* Cluster gratuito no **MongoDB Atlas**

### 2. Instalação do Projeto

```bash
git clone https://github.com/gustavo-blacknaut/bot-manager-squarecloud.git
cd bot-manager-squarecloud
npm install
```

### 3. Configuração do Ambiente

* Crie um arquivo `.env` na raiz do projeto.
* Copie as variáveis do `.env.example` (se existir) e preencha com os seus dados.

#### 🔐 Gerar ENCRYPTION\_KEY

```bash
node
require('crypto').randomBytes(32).toString('hex')
```

Copie o resultado (64 caracteres) e use como valor de `ENCRYPTION_KEY`.

#### 📦 Preparar Prisma

```bash
npx prisma generate
```

Esse comando gera o cliente do Prisma para o seu banco de dados.

## 🚀 Executando o Bot

### Registrar Comandos Slash (necessário na primeira vez ou ao editar comandos)

```bash
npm run deploy-commands
```

### Iniciar em Modo de Desenvolvimento

```bash
npm run dev
```

### Iniciar em Modo de Produção

```bash
npm run build
npm run start
```

## ☁️ Deploy na Square Cloud

1. Faça o upload do projeto completo para um repositório no GitHub.
2. No painel da Square Cloud:

   * Clique em **"New Application"**
   * Escolha **"From GitHub"**
3. A Square detectará automaticamente o `squarecloud.config`.

### ⚠️ **IMPORTANTE**:

Após o deploy inicial:

1. Vá até a aba **Settings** da sua aplicação.
2. Insira todas as variáveis do seu `.env` em **Environment Variables**.
3. **Reinicie a aplicação** para que as variáveis entrem em vigor.

## 🛠️ Tecnologias Usadas

* [Discord.js](https://discord.js.org/)
* [TypeScript](https://www.typescriptlang.org/)
* [Prisma ORM](https://www.prisma.io/)
* [Square Cloud API](https://docs.squarecloud.app/)
* [Winston Logger](https://github.com/winstonjs/winston)
* [MercadoPago](https://www.mercadopago.com.br/) & [PushinPay](https://app.pushinpay.com/) (PIX)


## 📄 Licença

Este projeto está licenciado sob a licença **MIT**.

