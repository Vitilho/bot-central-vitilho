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
        
        // 🛡️ OTIMIZAÇÃO: Bloqueia recursos pesados para poupar RAM
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`📡 Navegando para: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // 1. Lida com o redirecionamento da vitrine (/social/)
        if (page.url().includes('/social/')) {
            console.log("🎯 Vitrine detectada! Aguardando redirecionamento...");
            try {
                await page.waitForNavigation({ timeout: 4000, waitUntil: 'domcontentloaded' }).catch(() => {});
            } catch (e) { }

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

        // 2. Extração com Cheerio
        const $ = cheerio.load(html);
        
        const titulo = $('meta[property="og:title"]').attr('content') || $('h1.ui-pdp-title').text().trim();
        const urlImagem = $('meta[property="og:image"]').attr('content');
        const freteGratis = html.toLowerCase().includes('frete grátis') || html.toLowerCase().includes('grátis');
        
        let precoPorStr = "";
        let precoDeStr = "";
        let descCalculado = "";

        // 🎯 BUSCA AGRESSIVA DE PREÇO (3 TENTATIVAS)
        let reais = $('.ui-pdp-price__second-line .andes-money-amount__fraction').first().text().trim();
        let centavos = $('.ui-pdp-price__second-line .andes-money-amount__cents').first().text().trim() || '00';
        
        if (!reais) {
            // Tentativa 2: Busca genérica na primeira tag de preço da tela
            reais = $('.ui-pdp-price .andes-money-amount__fraction').first().text().trim() || $('.andes-money-amount__fraction').first().text().trim();
            centavos = $('.ui-pdp-price .andes-money-amount__cents').first().text().trim() || $('.andes-money-amount__cents').first().text().trim() || '00';
        }

        if (!reais) {
            // Tentativa 3: Tag meta estruturada de SEO
            const metaPreco = $('meta[itemprop="price"]').attr('content');
            if (metaPreco) {
                const partes = metaPreco.split('.');
                reais = partes[0];
                centavos = partes[1] || '00';
            }
        }

        if (reais) precoPorStr = `${reais},${centavos}`;

        // Desconto
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

        // 📸 O MODO DEBUG (TIRA PRINT SE FALHAR)
        if (!precoPorStr) {
            console.log("⚠️ Preço não encontrado. Tirando print da tela para enviar no Telegram...");
            const screenshotBuffer = await page.screenshot({ fullPage: true });
            await browser.close();
            return { erroDebug: true, imagemPrint: screenshotBuffer }; 
        }

        await browser.close(); // Tudo certo, fecha o navegador

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