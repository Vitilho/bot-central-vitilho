const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const formatarPreco = (num) => {
    if (num === null || num === undefined) return "0,00";
    return num.toFixed(2).replace('.', ',');
};

// 🕷️ Função de Extração (Puppeteer Híbrido: Bypass + Leitura de API)
async function extrairDadosMercadoLivre(url) {
    let browser;
    try {
        let urlFinal = url;
        const headersAxios = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' };

        // 1. Desencurtador rápido (meli.la)
        if (url.includes('meli.la')) {
            try {
                const res = await axios.get(url, { headers: headersAxios });
                urlFinal = res.request.res.responseUrl || url;
            } catch (err) {
                if (err.request && err.request.res && err.request.res.responseUrl) urlFinal = err.request.res.responseUrl;
            }
        }

        console.log("🤖 Abrindo Chrome Fantasma...");
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
        });
        const page = await browser.newPage();
        
        // 2. Bypass da Vitrine (/social/)
        if (urlFinal.includes('/social/')) {
            console.log("🎯 Vitrine detectada! Procurando o botão 'Ir para produto'...");
            await page.goto(urlFinal, { waitUntil: 'networkidle2', timeout: 30000 });
            
            const linkProduto = await page.evaluate(() => {
                const botoes = Array.from(document.querySelectorAll('a'));
                const botaoAlvo = botoes.find(b => b.innerText.toLowerCase().includes('ir para produto') || b.innerText.toLowerCase().includes('comprar agora'));
                if (botaoAlvo) return botaoAlvo.href;
                
                const btnPrimario = document.querySelector('a.andes-button--primary');
                return btnPrimario ? btnPrimario.href : null;
            });

            if (linkProduto) {
                urlFinal = linkProduto;
            }
        }

        // 3. A INTELIGÊNCIA: Extrair o ID MLB da URL final
        const matchMLB = urlFinal.match(/(MLB[-_]?\d+)/i);
        if (!matchMLB) {
            console.log("❌ Não achei o ID do produto na URL:", urlFinal);
            await browser.close();
            return null;
        }
        
        const idProduto = matchMLB[1].replace(/[-_]/g, '');
        console.log(`📡 Buscando dados via API Oficial (pelo Chrome) para o ID: ${idProduto}`);

        // 4. Conexão com a API usando o Navegador Invisível (O Pulo do Gato)
        await page.goto(`https://api.mercadolibre.com/items/${idProduto}`, { waitUntil: 'domcontentloaded' });
        
        // Pega o texto puro renderizado na tela (o JSON da API)
        const jsonText = await page.evaluate(() => document.body.textContent);
        await browser.close(); // Missão cumprida, fechamos o navegador na hora!

        const dados = JSON.parse(jsonText);

        // 🚨 TRAVA DE SEGURANÇA: Se não vier o preço, mostra o que o ML respondeu!
        if (!dados.price) {
            console.log("⚠️ A API falhou ou não retornou preço. Resposta do ML:");
            console.log(jsonText.substring(0, 300)); // Imprime os primeiros 300 caracteres
            return null;
        }

        // 5. Mapear os dados de forma limpa e direta
        const titulo = dados.title;
        const freteGratis = dados.shipping && dados.shipping.free_shipping;
        
        let urlImagem = (dados.pictures && dados.pictures.length > 0) 
            ? dados.pictures[0].secure_url 
            : dados.secure_thumbnail;

        let precoPorNum = dados.price;
        let precoDeNum = dados.original_price;
        let descCalculado = "";
        let precoDeStr = "";
        
        if (precoDeNum && precoDeNum > precoPorNum) {
            precoDeStr = formatarPreco(precoDeNum);
            descCalculado = `-${Math.round(((precoDeNum - precoPorNum) / precoDeNum) * 100)}%`;
        } else {
            precoDeNum = 0;
        }

        const precoPorStr = formatarPreco(precoPorNum);

        return {
            produto: titulo,
            precoDe: precoDeStr,
            precoPor: precoPorStr,
            numDeOriginal: precoDeNum,
            descCalculado: descCalculado,
            freteGratis: freteGratis,
            link: url, 
            loja: "Mercado Livre",
            cupom: "",
            imagem: urlImagem
        };

    } catch (error) {
        console.error("Erro no fluxo do Puppeteer/API:", error.message);
        if (browser) await browser.close();
        return null;
    }
}

module.exports = { extrairDadosMercadoLivre };