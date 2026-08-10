const axios = require('axios');
const cheerio = require('cheerio');
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
        const headersAxios = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' };

        // 1. Desencurtador rápido
        if (url.includes('meli.la')) {
            try {
                const res = await axios.get(url, { headers: headersAxios });
                urlFinal = res.request.res.responseUrl || url;
            } catch (err) {
                if (err.request && err.request.res && err.request.res.responseUrl) urlFinal = err.request.res.responseUrl;
            }
        }

        // 2. Bypass da Vitrine (/social/) com Puppeteer
        if (urlFinal.includes('/social/')) {
            console.log("🤖 Abrindo Chrome Fantasma para passar a vitrine...");
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

            if (linkProduto) urlFinal = linkProduto;
            await browser.close(); 
        }

        // 3. Extrair ID para montar a URL Limpa
        const matchMLB = urlFinal.match(/(MLB[-_]?\d+)/i);
        if (!matchMLB) {
            console.log("❌ Não achei o ID do produto.");
            return null;
        }
        
        const idProduto = matchMLB[1].replace(/[-_]/g, '');
        const urlProdutoLimpa = `https://produto.mercadolivre.com.br/MLB-${idProduto}`;
        console.log(`📡 Buscando HTML da página via Proxy para o ID: ${idProduto}`);

        // 4. ScraperAPI buscando o HTML puro da página (Rota SEO)
        const apiKey = process.env.SCRAPERAPI_KEY;
        let html;

        if (apiKey) {
            const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(urlProdutoLimpa)}`;
            const apiRes = await axios.get(proxyUrl);
            html = apiRes.data;
        } else {
            const apiRes = await axios.get(urlProdutoLimpa, { headers: headersAxios });
            html = apiRes.data;
        }

        // 5. Cheerio recorta os dados das tags do Google
        const $ = cheerio.load(html);
        
        const titulo = $('meta[property="og:title"]').attr('content') || $('h1.ui-pdp-title').text().trim();
        const urlImagem = $('meta[property="og:image"]').attr('content');
        const freteGratis = html.toLowerCase().includes('frete grátis') || html.toLowerCase().includes('grátis');
        
        // Recortando o preço pelo código visual
        let precoPorStr = "";
        let precoDeStr = "";
        let descCalculado = "";

        const blocoPreco = $('.ui-pdp-price__second-line');
        const reais = blocoPreco.find('.andes-money-amount__fraction').first().text().trim();
        const centavos = blocoPreco.find('.andes-money-amount__cents').first().text().trim() || '00';
        
        if (reais) precoPorStr = `${reais},${centavos}`;

        // Tentativa de pegar o preço antigo para calcular desconto
        const blocoDe = $('.ui-pdp-price__original-value');
        if (blocoDe.length > 0) {
            const reaisDe = blocoDe.find('.andes-money-amount__fraction').first().text().trim();
            const centavosDe = blocoDe.find('.andes-money-amount__cents').first().text().trim() || '00';
            if (reaisDe) {
                precoDeStr = `${reaisDe},${centavosDe}`;
                const numDe = parseFloat(`${reaisDe}.${centavosDe}`);
                const numPor = parseFloat(`${reais.replace('.', '')}.${centavos}`);
                if (numDe > numPor) {
                    descCalculado = `-${Math.round(((numDe - numPor) / numDe) * 100)}%`;
                }
            }
        }

        if (!precoPorStr) {
            console.log("⚠️ HTML carregado, mas o preço não foi encontrado nas classes esperadas.");
            return null;
        }

        return {
            produto: titulo,
            precoDe: precoDeStr,
            precoPor: precoPorStr,
            numDeOriginal: precoDeStr ? parseFloat(precoDeStr.replace('.', '').replace(',', '.')) : 0,
            descCalculado: descCalculado,
            freteGratis: freteGratis,
            link: url, 
            loja: "Mercado Livre",
            cupom: "",
            imagem: urlImagem
        };

    } catch (error) {
        console.error("Erro no fluxo do HTML/Cheerio:", error.message);
        if (browser) await browser.close();
        return null;
    }
}

module.exports = { extrairDadosMercadoLivre };