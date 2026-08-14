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
        
        let urlFinal = url;

        // 1. Resolve links encurtados ou de vitrine
        if (url.includes('meli.la') || url.includes('/social/')) {
            console.log("📡 Resolvendo link da vitrine...");
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 2000));

            urlFinal = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const linkComID = links.find(l => l.href.match(/MLB[-_]?\d+/i));
                return linkComID ? linkComID.href : window.location.href;
            });
            console.log("✅ Link resolvido para: " + urlFinal);
        }

        // 2. Extração Cirúrgica do ID
        let idProduto = null;
        const matchReal = urlFinal.match(/(?:wid=|item_id(?:%3A|=))(MLB\d+)/i);
        
        if (matchReal) {
            idProduto = matchReal[1].toUpperCase();
        } else {
            const matchMLB = urlFinal.match(/(MLB)[-_]?(\d+)/i);
            if (!matchMLB) {
                console.log("❌ Não achei o ID do produto na URL:", urlFinal);
                await browser.close();
                return null;
            }
            idProduto = `MLB${matchMLB[2]}`;
        }
        
        console.log(`📡 Consultando a API Oficial via AJAX nativo para o ID: ${idProduto}`);

        // 3. O CAVALO DE TROIA: Disparar um Fetch por debaixo dos panos na página atual!
        const dados = await page.evaluate(async (id) => {
            try {
                const res = await fetch(`https://api.mercadolibre.com/items/${id}`);
                const data = await res.json();
                return data;
            } catch (err) {
                return { error_interno: err.message };
            }
        }, idProduto);

        await browser.close(); 

        // 🛡️ Blindagem contra retornos inesperados
        if (!dados || dados.error_interno || dados.error) {
            console.log("❌ Erro retornado pela API ou Fetch:", dados);
            return null;
        }

        // 4. Mapear o JSON
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
        console.error("❌ Erro fatal no fluxo:", error.message);
        if (browser) await browser.close();
        return null;
    }
}

module.exports = { extrairDadosMercadoLivre };