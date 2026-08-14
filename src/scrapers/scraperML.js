const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function extrairDadosMercadoLivre(url) {
    let browser;
    try {
        console.log("🤖 Abrindo Chrome Fantasma...");
        browser = await puppeteer.launch({ 
            headless: true, 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-blink-features=AutomationControlled',
                '--window-size=1366,768'
            ] 
        });
        const page = await browser.newPage();
        
        // 🎭 O DISFARCE SUPREMO (SEO BYPASS): Fingindo ser o rastreador oficial do Google
        await page.setUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
        await page.setExtraHTTPHeaders({
            'X-Forwarded-For': '66.249.66.1', // Falsifica a origem simulando um IP real do Google
            'Accept-Language': 'pt-BR,pt;q=0.9'
        });
        await page.setViewport({ width: 1366, height: 768 });

        console.log("📡 Acessando a página como Googlebot...");
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // 1. Resolve links encurtados ou de vitrine
        if (page.url().includes('/social/')) {
            console.log("🎯 Vitrine detectada! Extraindo link do produto...");
            await new Promise(resolve => setTimeout(resolve, 2000));

            const productLink = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const linkComID = links.find(l => l.href.match(/MLB[-_]?\d+/i));
                return linkComID ? linkComID.href : null;
            });

            if (productLink) {
                console.log("🔗 Redirecionando para a página final: " + productLink);
                await page.goto(productLink, { waitUntil: 'domcontentloaded', timeout: 45000 });
            }
        }

        console.log("✅ Página alcançada. Aguardando dados visuais...");
        
        try {
            await page.waitForSelector('.andes-money-amount__fraction', { timeout: 8000 });
        } catch (e) {
            console.log("⚠️ Demora na renderização. Tentando ler mesmo assim...");
        }

        // 2. Extração de Dados
        const dadosPagina = await page.evaluate(() => {
            const getText = (selector) => document.querySelector(selector)?.innerText?.trim();
            
            let title = document.querySelector('meta[property="og:title"]')?.content 
                     || document.title.split(' |')[0] 
                     || getText('h1.ui-pdp-title');
                     
            let image = document.querySelector('meta[property="og:image"]')?.content;
            
            let reais = getText('.ui-pdp-price__second-line .andes-money-amount__fraction') || getText('.andes-money-amount__fraction');
            let centavos = getText('.ui-pdp-price__second-line .andes-money-amount__cents') || getText('.andes-money-amount__cents') || '00';
            
            let origReais = getText('.ui-pdp-price__original-value .andes-money-amount__fraction');
            let origCentavos = getText('.ui-pdp-price__original-value .andes-money-amount__cents') || '00';
            
            let isFree = document.body.innerText.toLowerCase().includes('frete grátis') || document.body.innerText.toLowerCase().includes('grátis');

            return { title, image, reais, centavos, origReais, origCentavos, isFree };
        });

        // 📸 DEBUG VISUAL
        if (!dadosPagina.title || !dadosPagina.reais) {
            console.log("❌ Falha na leitura visual. Tirando print...");
            const screenshotBuffer = await page.screenshot({ fullPage: true });
            await browser.close();
            return { erroDebug: true, imagemPrint: screenshotBuffer }; 
        }

        await browser.close();

        // 3. Formatação
        let precoPorStr = `${dadosPagina.reais},${dadosPagina.centavos}`;
        let precoDeStr = "";
        let descCalculado = "";
        let numDeOriginal = 0;

        if (dadosPagina.origReais) {
            precoDeStr = `${dadosPagina.origReais},${dadosPagina.origCentavos}`;
            numDeOriginal = parseFloat(`${dadosPagina.origReais}.${dadosPagina.origCentavos}`);
            const numPor = parseFloat(`${dadosPagina.reais.replace('.', '')}.${dadosPagina.centavos}`);
            
            if (numDeOriginal > numPor) {
                descCalculado = `-${Math.round(((numDeOriginal - numPor) / numDeOriginal) * 100)}%`;
            }
        }

        return {
            produto: dadosPagina.title,
            precoDe: precoDeStr,
            precoPor: precoPorStr,
            numDeOriginal: numDeOriginal,
            descCalculado: descCalculado,
            freteGratis: dadosPagina.isFree,
            link: url, 
            loja: "Mercado Livre",
            cupom: "",
            imagem: dadosPagina.image
        };

    } catch (error) {
        console.error("❌ Erro fatal no fluxo:", error.message);
        if (browser) await browser.close();
        return null;
    }
}

module.exports = { extrairDadosMercadoLivre };