// Files Express serves publicly. Never publish the repository root.
module.exports = {
  files: ['index.html', 'admin.html', 'style.css', 'manifest.json', 'service-worker.js',
    'logo.png', 'apple-touch-icon.png', 'favicon.ico', 'favicon-16x16.png',
    'favicon-32x32.png', 'robots.txt', 'sitemap.xml', 'data/menu.json', 'data/menu_default.json'],
  directories: ['assets', 'images', 'icons', 'admin', 'yonetici']
};
