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
        console.log("🤖 Abrindo Chrome Fantasma...");
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
        });
        const page = await browser.newPage();
        
        // 🛡️ OTIMIZAÇÃO EXTREMA: Bloqueia imagens, CSS e fontes para poupar muita RAM do Render
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`📡 Navegando para: ${url}`);
        // domcontentloaded carrega apenas a estrutura da página, ignorando a espera por scripts demorados
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // 1. Lida com o redirecionamento da vitrine (/social/)
        if (page.url().includes('/social/')) {
            console.log("🎯 Vitrine detectada! Aguardando redirecionamento...");
            try {
                await page.waitForNavigation({ timeout: 4000, waitUntil: 'domcontentloaded' }).catch(() => {});
            } catch (e) { }

            // Se ainda não redirecionou, localiza o botão de compra e clica
            if (page.url().includes('/social/')) {
                const linkProduto = await page.evaluate(() => {
                    const btn = document.querySelector('a.andes-button--primary');
                    if (btn) return btn.href;
                    const links = Array.from(document.querySelectorAll('a'));
                    const btnAlvo = links.find(b => b.innerText.toLowerCase().includes('ir para produto'));
                    return btnAlvo ? btnAlvo.href : null;
                });

                if (linkProduto) {
                    console.log("🔗 Indo para a página final do produto...");
                    await page.goto(linkProduto, { waitUntil: 'domcontentloaded', timeout: 45000 });
                }
            }
        }

        console.log("✅ Página alcançada! Copiando o HTML...");
        const html = await page.content();
        await browser.close(); // Fecha o Chrome rapidamente para aliviar o servidor

        // 2. Extração com Cheerio baseada no HTML real que o navegador enxergou
        const $ = cheerio.load(html);
        
        const titulo = $('meta[property="og:title"]').attr('content') || $('h1.ui-pdp-title').text().trim();
        const urlImagem = $('meta[property="og:image"]').attr('content');
        const freteGratis = html.toLowerCase().includes('frete grátis') || html.toLowerCase().includes('grátis');
        
        let precoPorStr = "";
        let precoDeStr = "";
        let descCalculado = "";

        const blocoPreco = $('.ui-pdp-price__second-line');
        const reais = blocoPreco.find('.andes-money-amount__fraction').first().text().trim();
        const centavos = blocoPreco.find('.andes-money-amount__cents').first().text().trim() || '00';
        
        if (reais) precoPorStr = `${reais},${centavos}`;

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
            console.log("⚠️ HTML carregado, mas o preço não foi encontrado. O layout pode ser diferente ou bloqueado.");
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
        console.error("❌ Erro fatal no Puppeteer:", error.message);
        if (browser) await browser.close();
        return null;
    }
}

module.exports = { extrairDadosMercadoLivre };