const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Muda o local de cache do Chrome para dentro do nosso projeto
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};