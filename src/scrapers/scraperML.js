const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Função auxiliar para garantir o formato R$ 00,00 correto no servidor Linux
const formatarPreco = (num) => num.toFixed(2).replace('.', ',');

// 🕷️ Função de Extração (Híbrida: Puppeteer + API Oficial)
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

        // 2. Navegador Invisível APENAS para contornar a Vitrine (/social/)
        if (urlFinal.includes('/social/')) {
            console.log("🤖 Abrindo Chrome Fantasma apenas para passar a vitrine...");
            browser = await puppeteer.launch({ 
                headless: true, 
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
            });
            
            const page = await browser.newPage();
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
            await browser.close(); // Já temos o link, matamos o navegador na hora!
        }

        // 3. A INTELIGÊNCIA: Extrair o ID MLB da URL final
        const matchMLB = urlFinal.match(/(MLB[-_]?\d+)/i);
        if (!matchMLB) {
            console.log("❌ Não achei o ID do produto na URL:", urlFinal);
            return null;
        }
        
        // Limpa o ID (remove hifens para bater na API certinho, ex: MLB1234567)
        const idProduto = matchMLB[1].replace(/[-_]/g, '');
        console.log(`📡 Buscando dados via API Oficial para o ID: ${idProduto}`);

        // 4. Conexão direta com a API Pública
        const apiRes = await axios.get(`https://api.mercadolibre.com/items/${idProduto}`);
        const dados = apiRes.data;

        // 5. Mapear os dados de forma limpa e direta
        const titulo = dados.title;
        const freteGratis = dados.shipping && dados.shipping.free_shipping;
        
        // Pega a imagem de maior qualidade disponível
        let urlImagem = (dados.pictures && dados.pictures.length > 0) 
            ? dados.pictures[0].secure_url 
            : dados.secure_thumbnail;

        let precoPorNum = dados.price;
        let precoDeNum = dados.original_price;
        let descCalculado = "";
        let precoDeStr = "";
        
        // Regra de cálculo de desconto
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
            link: url, // Retorna sempre o link curtinho que você colou no chat
            loja: "Mercado Livre",
            cupom: "",
            imagem: urlImagem
        };

    } catch (error) {
        console.error("Erro no fluxo da API:", error.message);
        if (browser) await browser.close();
        return null;
    }
}

module.exports = { extrairDadosMercadoLivre };