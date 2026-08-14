const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
puppeteer.use(StealthPlugin());

const formatarPreco = (num) => {
    if (num === null || num === undefined) return "0,00";
    return num.toFixed(2).replace('.', ',');
};

async function extrairDadosMercadoLivre(url) {
    let browser;
    try {
        console.log("🤖 Abrindo Chrome Fantasma apenas para mapear o link...");
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        let urlFinal = page.url();

        if (urlFinal.includes('/social/')) {
            console.log("🎯 Vitrine detectada! Aguardando redirecionamento interno...");
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const productLink = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const linkComID = links.find(l => l.href.match(/MLB[-_]?\d+/i));
                return linkComID ? linkComID.href : null;
            });
            if (productLink) urlFinal = productLink;
        }

        await browser.close(); 
        console.log("✅ Navegador desligado. Link resolvido para: " + urlFinal);

        let idProduto = null;
        const matchReal = urlFinal.match(/(?:wid=|item_id(?:%3A|=))(MLB\d+)/i);
        
        if (matchReal) {
            idProduto = matchReal[1].toUpperCase();
        } else {
            const matchMLB = urlFinal.match(/(MLB)[-_]?(\d+)/i);
            if (matchMLB) idProduto = `MLB${matchMLB[2]}`;
        }

        if (!idProduto) {
            console.log("❌ Falha ao encontrar a assinatura do ID no link.");
            return null;
        }

        console.log(`🎯 ID capturado: ${idProduto}. Iniciando extração remota agressiva...`);

        const urlApiML = `https://api.mercadolibre.com/items/${idProduto}`;
        let dados = null;

        // 🛡️ O Batalhão de Proxies e Rotas
        const rotas = [];
        
        // 1ª Opção: Se a chave estiver no .env, usa IPs residenciais Premium
        if (process.env.SCRAPERAPI_KEY) {
            rotas.push({ nome: "ScraperAPI (Premium)", url: `http://api.scraperapi.com?api_key=${process.env.SCRAPERAPI_KEY}&url=${encodeURIComponent(urlApiML)}`, tipo: 'direto' });
        }
        
        // 2ª Opção: CorsProxy (Rede alternativa)
        rotas.push({ nome: "CorsProxy.io", url: `https://corsproxy.io/?${encodeURIComponent(urlApiML)}`, tipo: 'direto' });
        
        // 3ª Opção: AllOrigins Wrapper (Bypassa bloqueios profundos envelopando o JSON)
        rotas.push({ nome: "AllOrigins (Wrapper)", url: `https://api.allorigins.win/get?url=${encodeURIComponent(urlApiML)}`, tipo: 'wrapper' });
        
        // 4ª Opção: ThingProxy (CORS Anyhwere)
        rotas.push({ nome: "ThingProxy", url: `https://thingproxy.freeboard.io/fetch/${urlApiML}`, tipo: 'direto' });
        
        // 5ª Opção: Acesso Direto Render
        rotas.push({ nome: "Acesso Direto", url: urlApiML, tipo: 'direto' });

        // O Disfarce Obrigatório
        const headersAxios = { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        };

        for (const rota of rotas) {
            try {
                console.log(`📡 Disparando API via: ${rota.nome}`);
                const res = await axios.get(rota.url, { headers: headersAxios, timeout: 15000 });
                
                let dadosJson = res.data;
                
                // Desempacota o JSON se foi usado o modo Wrapper do AllOrigins
                if (rota.tipo === 'wrapper' && res.data.contents) {
                    dadosJson = JSON.parse(res.data.contents);
                }

                if (dadosJson && dadosJson.title) {
                    dados = dadosJson;
                    console.log(`✅ JSON capturado com sucesso via ${rota.nome}!`);
                    break; // Sucesso! Interrompe o loop
                }
            } catch (e) {
                console.log(`⚠️ Falha na rota ${rota.nome}. Alternando...`);
            }
        }

        if (!dados) {
            console.log("❌ WAF bloqueou todas as rotas.");
            return null;
        }

        // 4. Formatação Final
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
        let numDeOriginal = precoDeNum;

        if (precoDeNum > precoPorNum) {
            precoDeStr = formatarPreco(precoDeNum);
            descCalculado = `-${Math.round(((precoDeNum - precoPorNum) / precoDeNum) * 100)}%`;
        }

        return {
            produto: titulo,
            precoDe: precoDeStr,
            precoPor: precoPorStr,
            numDeOriginal: numDeOriginal,
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