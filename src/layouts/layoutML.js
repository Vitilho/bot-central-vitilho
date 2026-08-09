// 🛠️ Função de Layout Exportável
function montarLayout(dados) {
    let postagem = `✅ ${dados.produto}\n\n`;
    
    if(dados.cupom) postagem += `🏷️ Cupom: *${dados.cupom.toUpperCase()}*\n`;
    if(dados.precoDe) postagem += `💰 De: ~R$ ${dados.precoDe}~\n`;
    
    if(dados.precoPor) {
        let tagDesc = dados.descCalculado ? ` \`${dados.descCalculado}\`` : "";
        postagem += `🔥 Por: *R$ ${dados.precoPor}*${tagDesc}\n`;
    }
    
    if(dados.freteGratis) postagem += `🚚 Frete Grátis\n`;
    
    postagem += `\n🔗 ${dados.link}\n`;
    if(dados.loja) postagem += `> ${dados.loja}`;

    return postagem;
}

// Exportando a função para ser usada no index.js
module.exports = { montarLayout };