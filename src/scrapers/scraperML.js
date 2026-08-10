const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Função segura para formatar preço
const formatarPreco = (num) => {
    if (num === null || num === undefined) return "0,00";
    return num.toFixed(2).replace('.', ',');
};

// 🕷️ Função de Extração (Vitrine no Puppeteer + API via Proxy Residencial)
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

        // 2. Bypass da Vitrine (/social/) usando o Puppeteer (Ele passa liso por aqui)
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
            await browser.close(); 
        }

        // 3. Extrair o ID MLB da URL final
        const matchMLB = urlFinal.match(/(MLB[-_]?\d+)/i);
        if (!matchMLB) {
            console.log("❌ Não achei o ID do produto na URL:", urlFinal);
            return null;
        }
        
        const idProduto = matchMLB[1].replace(/[-_]/g, '');
        console.log(`📡 Buscando dados via API Oficial para o ID: ${idProduto}`);

        // 4. A MÁGICA: Bater na API do Mercado Livre usando o Proxy Residencial
        const urlApiML = `https://api.mercadolibre.com/items/${idProduto}`;
        const apiKey = process.env.SCRAPERAPI_KEY;

        let dadosDaApi;
        
        if (apiKey) {
            console.log("🛡️ Roteando requisição através do Proxy Residencial (com disfarce)...");
            // Adicionamos o keep_headers=true para forçar o proxy a usar o nosso User-Agent
            const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(urlApiML)}&keep_headers=true`;
            
            // Passamos o headersAxios para o Axios enviar ao Proxy
            const apiRes = await axios.get(proxyUrl, { headers: headersAxios });
            dadosDaApi = apiRes.data; 
        } else {
            console.log("⚠️ Proxy não configurado! Tentando acesso direto (pode gerar erro 403)...");
            const apiRes = await axios.get(urlApiML, { headers: headersAxios });
            dadosDaApi = apiRes.data;
        }

        // 🚨 TRAVA DE SEGURANÇA
        if (!dadosDaApi || !dadosDaApi.price) {
            console.log("⚠️ A API falhou ou não retornou preço.");
            return null;
        }

        // 5. Mapear os dados de forma limpa e direta
        const titulo = dadosDaApi.title;
        const freteGratis = dadosDaApi.shipping && dadosDaApi.shipping.free_shipping;
        
        let urlImagem = (dadosDaApi.pictures && dadosDaApi.pictures.length > 0) 
            ? dadosDaApi.pictures[0].secure_url 
            : dadosDaApi.secure_thumbnail;

        let precoPorNum = dadosDaApi.price;
        let precoDeNum = dadosDaApi.original_price;
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
        console.error("Erro no fluxo do Proxy/API:", error.message);
        if (browser) await browser.close();
        return null;
    }
}

module.exports = { extrairDadosMercadoLivre };