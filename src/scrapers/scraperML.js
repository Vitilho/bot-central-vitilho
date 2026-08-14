const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const formatarPreco = (num) => {
    if (num === null || num === undefined) return "0,00";
    return num.toFixed(2).replace('.', ',');
};

async function extrairDadosMercadoLivre(url) {
    let browser;
    try {
        let urlFinal = url;

        // 1. Usamos o Fantasma APENAS para resolver links encurtados ou vitrines
        if (url.includes('meli.la') || url.includes('/social/')) {
            console.log("🤖 Abrindo Chrome Fantasma apenas para extrair o ID oculto...");
            browser = await puppeteer.launch({ 
                headless: true, 
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
            });
            const page = await browser.newPage();
            
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // Pausa rápida de 2 segundos para o JavaScript da vitrine montar os links na tela
            await new Promise(resolve => setTimeout(resolve, 2000));

            // A SACADA: Varrer a tela inteira atrás de qualquer link que contenha o ID do produto
            urlFinal = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const linkComID = links.find(l => l.href.match(/MLB[-_]?\d+/i));
                return linkComID ? linkComID.href : window.location.href;
            });
            
            await browser.close();
            console.log("✅ Link resolvido para: " + urlFinal);
        }
        
        // 2. Extração Inteligente do ID (Ignorando a armadilha do Hash)
        let idProduto = null;
        
        // Caça o verdadeiro ID (wid ou item_id) em qualquer lugar da URL, mesmo depois da hashtag
        const matchReal = urlFinal.match(/(?:wid=|item_id(?:%3A|=))(MLB\d+)/i);
        
        if (matchReal) {
            idProduto = matchReal[1].toUpperCase();
        } else {
            // Fallback para o primeiro MLB encontrado na estrutura padrão
            const matchMLB = urlFinal.match(/(MLB)[-_]?(\d+)/i);
            if (!matchMLB) {
                console.log("❌ Não achei o ID do produto na URL:", urlFinal);
                return null;
            }
            idProduto = `MLB${matchMLB[2]}`;
        }
        
        console.log(`📡 Consultando a API Oficial do ML para o ID verdadeiro: ${idProduto}`);

        // 3. O XEQUE-MATE: Bater na API pública com Disfarce e Plano de Fuga
        const headersAxios = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' };
        const urlApiML = `https://api.mercadolibre.com/items/${idProduto}`;
        let dados;

        try {
            // Tenta o acesso direto disfarçado de humano
            const apiRes = await axios.get(urlApiML, { headers: headersAxios });
            dados = apiRes.data;
        } catch (err) {
            if (err.response && (err.response.status === 403 || err.response.status === 401)) {
                console.log("⚠️ IP do Render bloqueado na API (403). Acionando rota pelo Proxy...");
                const apiKey = process.env.SCRAPERAPI_KEY;
                if (!apiKey) throw err;
                
                const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(urlApiML)}`;
                const proxyRes = await axios.get(proxyUrl, { headers: headersAxios });
                dados = proxyRes.data;
            } else {
                throw err;
            }
        }

        // 4. Mapear o JSON limpinho
        const titulo = dados.title;
        const precoPorNum = dados.price;
        const precoDeNum = dados.original_price || 0;
        const freteGratis = dados.shipping && dados.shipping.free_shipping;
        
        const urlImagem = (dados.pictures && dados.pictures.length > 0) 
            ? dados.pictures[0].secure_url 
            : dados.thumbnail;

        let precoPorStr = formatarPreco(precoPorNum);
        let precoDeStr = "";
        let descCalculado = "";

        if (precoDeNum > precoPorNum) {
            precoDeStr = formatarPreco(precoDeNum);
            descCalculado = `-${Math.round(((precoDeNum - precoPorNum) / precoDeNum) * 100)}%`;
        }

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
        console.error("❌ Erro no fluxo da API:", error.message);
        if (browser) await browser.close();
        return null;
    }
}

module.exports = { extrairDadosMercadoLivre };