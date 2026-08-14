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
                '--window-size=1366,768' // Tamanho de tela real de notebook
            ] 
        });
        const page = await browser.newPage();
        
        // 🎭 O DISFARCE: Fingindo ser um usuário comum no Windows
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });

        console.log("📡 Acessando a página...");
        // Deixamos a página carregar tudo naturalmente (Evita o Captcha!)
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
        
        // Espera o preço aparecer na tela para garantir que o React carregou
        try {
            await page.waitForSelector('.andes-money-amount__fraction', { timeout: 8000 });
        } catch (e) {
            console.log("⚠️ Demora na renderização. Tentando ler mesmo assim...");
        }

        // 2. Extração de Dados direto do HTML visual
        const dadosPagina = await page.evaluate(() => {
            const getText = (selector) => document.querySelector(selector)?.innerText?.trim();
            
            let title = document.querySelector('meta[property="og:title"]')?.content 
                     || document.title.split(' |')[0] 
                     || getText('h1.ui-pdp-title');
                     
            let image = document.querySelector('meta[property="og:image"]')?.content;
            
            // Busca Preço Atual
            let reais = getText('.ui-pdp-price__second-line .andes-money-amount__fraction') || getText('.andes-money-amount__fraction');
            let centavos = getText('.ui-pdp-price__second-line .andes-money-amount__cents') || getText('.andes-money-amount__cents') || '00';
            
            // Busca Preço Original (De)
            let origReais = getText('.ui-pdp-price__original-value .andes-money-amount__fraction');
            let origCentavos = getText('.ui-pdp-price__original-value .andes-money-amount__cents') || '00';
            
            let isFree = document.body.innerText.toLowerCase().includes('frete grátis') || document.body.innerText.toLowerCase().includes('grátis');

            return { title, image, reais, centavos, origReais, origCentavos, isFree };
        });

        // 📸 DEBUG VISUAL: Se não achar o título ou preço, tira print pra gente ver!
        if (!dadosPagina.title || !dadosPagina.reais) {
            console.log("❌ Falha na leitura visual. Tirando print...");
            const screenshotBuffer = await page.screenshot({ fullPage: true });
            await browser.close();
            return { erroDebug: true, imagemPrint: screenshotBuffer }; 
        }

        await browser.close();

        // 3. Formatação Final
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