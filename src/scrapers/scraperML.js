const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// 🕷️ Função de Web Scraping (Puppeteer com Bypass Visual)
async function extrairDadosMercadoLivre(url) {
    let browser;
    try {
        let urlFinal = url;
        const headersAxios = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        };

        if (url.includes('meli.la')) {
            try {
                const res = await axios.get(url, { headers: headersAxios });
                urlFinal = res.request.res.responseUrl || url;
            } catch (err) {
                if (err.request && err.request.res && err.request.res.responseUrl) urlFinal = err.request.res.responseUrl;
            }
        }

        console.log("🤖 Abrindo Chrome Fantasma (Stealth Mode)...");
        browser = await puppeteer.launch({ 
            headless: true, 
            defaultViewport: { width: 1366, height: 768 },
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
        });
        
        const page = await browser.newPage();
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });

        console.log("🌐 Acessando URL inicial...");
        await page.goto(urlFinal, { waitUntil: 'networkidle2', timeout: 30000 });
        
        if (page.url().includes('/social/')) {
            console.log("🎯 Vitrine detectada! Procurando o botão 'Ir para produto'...");
            
            const linkProduto = await page.evaluate(() => {
                const botoes = Array.from(document.querySelectorAll('a'));
                const botaoAlvo = botoes.find(b => b.innerText.toLowerCase().includes('ir para produto') || b.innerText.toLowerCase().includes('comprar agora'));
                if (botaoAlvo) return botaoAlvo.href;
                
                const btnPrimario = document.querySelector('a.andes-button--primary');
                return btnPrimario ? btnPrimario.href : null;
            });

            if (linkProduto) {
                console.log("🔗 Link do produto encontrado! Navegando para: " + linkProduto);
                await page.goto(linkProduto, { waitUntil: 'networkidle2', timeout: 30000 });
            } else {
                console.log("⚠️ Não consegui achar o botão na vitrine.");
            }
        }

        try {
            console.log("⏳ Aguardando o título carregar na tela principal...");
            await page.waitForSelector('h1.ui-pdp-title', { timeout: 35000 });
        } catch (e) {
            console.log("⚠️ O título não apareceu! Tirando novo print para investigar...");
            await page.screenshot({ path: 'debug_mercadolivre.png', fullPage: true });
            console.log("✅ Print salvo. Abortando raspagem.");
            await browser.close();
            return null;
        }
        
        const html = await page.content();
        await browser.close(); 
        
        const $ = cheerio.load(html);

        const h1 = $('h1.ui-pdp-title');
        const titulo = h1.text().trim();
        const containerPrincipal = h1.closest('.ui-pdp-main-container').length > 0 ? h1.closest('.ui-pdp-main-container') : $('body');

        let urlImagem = $('meta[property="og:image"]').attr('content');
        if (!urlImagem || !urlImagem.includes('http')) {
            urlImagem = containerPrincipal.find('.ui-pdp-gallery__figure img, img.ui-pdp-image').first().attr('src');
        }

        let blocoPreco = containerPrincipal.find('.ui-pdp-price__main-container').first();
        if (blocoPreco.length === 0) blocoPreco = containerPrincipal.find('.ui-pdp-price').first();

        const pegarPreco = (seletorBase) => {
            const reais = blocoPreco.find(`${seletorBase} .andes-money-amount__fraction`).first().text().trim();
            const centavos = blocoPreco.find(`${seletorBase} .andes-money-amount__cents`).first().text().trim();
            if (!reais) return "";
            return centavos ? `${reais},${centavos}` : `${reais},00`;
        };

        let precoPorStr = pegarPreco('.ui-pdp-price__second-line');
        if (!precoPorStr) precoPorStr = pegarPreco(''); 
        const precoDeStr = pegarPreco('.ui-pdp-price__original-value');
        
        const freteGratis = containerPrincipal.text().toLowerCase().includes('grátis');
        let nomeLoja = containerPrincipal.find('.ui-pdp-seller__link-trigger').first().text().trim() || containerPrincipal.find('.ui-pdp-seller-header__title').first().text().trim();
        
        let descCalculado = "";
        let numDe = 0;
        if (precoDeStr && precoPorStr) {
            numDe = parseFloat(precoDeStr.replace('.', '').replace(',', '.'));
            const numPor = parseFloat(precoPorStr.replace('.', '').replace(',', '.'));
            if (numDe > numPor) {
                descCalculado = `-${Math.round(((numDe - numPor) / numDe) * 100)}%`;
            }
        }

        return {
            produto: titulo,
            precoDe: precoDeStr,
            precoPor: precoPorStr,
            numDeOriginal: numDe,
            descCalculado: descCalculado,
            freteGratis: freteGratis,
            link: url, 
            loja: nomeLoja || "Mercado Livre",
            cupom: "",
            imagem: urlImagem
        };

    } catch (error) {
        console.error("Erro no Web Scraping:", error.message);
        if (browser) await browser.close(); 
        return null;
    }
}

// Exportando a função para o index.js
module.exports = { extrairDadosMercadoLivre };