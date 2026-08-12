require('dotenv').config();

const { Telegraf } = require('telegraf');

// 📦 Importando os nossos módulos personalizados
const { montarLayout } = require('./src/layouts/layoutML');
const { extrairDadosMercadoLivre } = require('./src/scrapers/scraperML');

const token = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(token);

const estadosBot = new Map();

bot.start((ctx) => ctx.reply('Fala, Vitilho! Seu assistente de ofertas tá online. 🚀 Manda o link!'));

bot.on('text', async (ctx) => {
    const texto = ctx.message.text;
    const chatId = ctx.chat.id;

    // 🔄 PASSO B: VERIFICA SE ESTÁ ESPERANDO CUPOM
    if (estadosBot.has(chatId)) {
        const dadosTemporarios = estadosBot.get(chatId);

        if (texto.toLowerCase() === 'nao' || texto.toLowerCase() === 'não') {
            if (dadosTemporarios.imagem) await ctx.replyWithPhoto(dadosTemporarios.imagem);
            await ctx.reply(montarLayout(dadosTemporarios));
            estadosBot.delete(chatId);
            return;
        }

        if (texto.includes('|')) {
            const partes = texto.split('|');
            dadosTemporarios.cupom = partes[0].trim();
            const novoPreco = partes[1].trim();
            dadosTemporarios.precoPor = novoPreco;

            const numPor = parseFloat(novoPreco.replace('.', '').replace(',', '.'));
            if (dadosTemporarios.numDeOriginal > numPor) {
                dadosTemporarios.descCalculado = `-${Math.round(((dadosTemporarios.numDeOriginal - numPor) / dadosTemporarios.numDeOriginal) * 100)}%`;
            }

            if (dadosTemporarios.imagem) await ctx.replyWithPhoto(dadosTemporarios.imagem);
            await ctx.reply(montarLayout(dadosTemporarios));
            estadosBot.delete(chatId); 
            return;
        } else {
            return ctx.reply('⚠️ *Formato inválido!*\n\nDigite no formato: NOME | VALOR (ex: GANHEI10 | 69,90)\nOu digite *NÃO* para postar sem cupom.');
        }
    }

    // 🔄 PASSO A: IDENTIFICA O LINK E CHAMA O SCRAPER
    if (texto.includes('mercadolivre.com.br') || texto.includes('meli.la')) {
        const msgAguarde = await ctx.reply('🔎 Minerando os dados no Mercado Livre...\n*(Isso pode levar alguns segundos, estou burlando a segurança)*');
        
        const dadosReais = await extrairDadosMercadoLivre(texto);

        // Se deu erro de renderização, o bot te manda o print na hora!
        if (dadosReais && dadosReais.erroDebug) {
            await ctx.reply('❌ Fiquei preso nesta tela lá no servidor da nuvem (veja o print):');
            await ctx.replyWithPhoto({ source: dadosReais.imagemPrint });
        } 
        // Se deu tudo certo, segue o fluxo normal
        else if (dadosReais) {
            estadosBot.set(chatId, dadosReais);
            ctx.reply(`✅ *Dados Encontrados!*\nProduto: ${dadosReais.produto}\nPreço Atual: R$ ${dadosReais.precoPor}\n\n👉 *Tem algum cupom para esse produto?*\n\nSe sim, responda com o nome e o preço final separados por uma barra em pé. Exemplo:\n*FERPANDINHA10 | 69,30*\n\nSe não, digite apenas *NÃO*.`);
        } else {
            ctx.reply('❌ Deu erro ao tentar ler a página.');
        }
    } else {
        ctx.reply('🤔 Por enquanto só leio links do Mercado Livre.');
    }
});

bot.launch({ 
    dropPendingUpdates: true, 
    handlerTimeout: 900000 
});
console.log('🤖 Bot rodando com arquitetura modular!');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// 🌐 SERVIDOR WEB FANTASMA (Para o Render manter o bot online)
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.write('Bot da Central do Vitilho operante!');
    res.end();
}).listen(PORT, () => console.log(`Servidor web rodando na porta ${PORT}`));