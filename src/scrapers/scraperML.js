const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios'); // Voltamos com o Axios para a requisição final
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
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log("📡 Acessando a página original...");
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        let urlFinal = page.url();

        // 1. Resolve o redirecionamento da Vitrine
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

        // Já resolvemos o link, não precisamos mais do navegador pesado!
        await browser.close(); 
        console.log("✅ Navegador desligado. Link resolvido para: " + urlFinal);

        // 2. Extração Cirúrgica do ID
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

        console.log(`🎯 ID capturado: ${idProduto}. Iniciando extração remota...`);

        // 3. A CARTADA FINAL: Bater na API Pública usando Proxies Intermediários
        const urlApiML = `https://api.mercadolibre.com/items/${idProduto}`;
        let dados = null;

        // Lista de "laranjas" (Proxies Públicos) para mascarar o IP do Render
        const rotas = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(urlApiML)}`,
            `https://api.codetabs.com/v1/proxy/?quest=${urlApiML}`,
            urlApiML // Último recurso: bater direto do Render
        ];

        for (const rota of rotas) {
            try {
                console.log(`📡 Disparando API via: ${rota.split('/')[2]}`);
                const res = await axios.get(rota, { timeout: 15000 });
                
                if (res.data && res.data.title) {
                    dados = res.data;
                    console.log("✅ JSON da API capturado com sucesso!");
                    break; // Sai do loop de tentativas se deu certo
                }
            } catch (e) {
                console.log(`⚠️ Rota falhou. Tentando a próxima alternativa...`);
            }
        }

        if (!dados) {
            console.log("❌ Todas as rotas foram barradas pelo WAF.");
            return null;
        }

        // 4. Formatação Final dos Dados
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