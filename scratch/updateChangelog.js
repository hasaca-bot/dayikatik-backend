const fs = require('fs');
const path = require('path');

const changelogPath = path.join(__dirname, '..', 'logs', 'changelog.md');
const content = fs.readFileSync(changelogPath, 'utf8');

const newEntry = `
## [2026-07-12 22:25 +03:00] — Otomatik Dil Seçimi ve Vazgeç Buton Güncellemesi

### 📝 Düzenlenen Dosyalar
- \`index.html\` — Tarayıcı diline göre otomatik Türkçe/İngilizce dil tespiti eklendi. Ürün düzenleme modülündeki "Vazgeç" butonu Turkish dilinde "Tamam" olarak güncellendi (İngilizce'de "Cancel" olarak kaldı).
- \`admin.html\` — \`index.html\` ile uyumlu dil algılama algoritması ve ürün düzenleme modülü "Vazgeç" -> "Tamam" buton metni güncellemesi yapıldı.

### ⚙️ Açıklama
- Tarayıcı dili \`tr\` veya \`tr-TR\` olan kullanıcılar için sitenin ilk açılışta otomatik Türkçe, diğer diller için ise otomatik İngilizce açılması sağlandı. Dil tercihi ilk tespitten sonra localStorage ile kalıcı hale getirildi.
- Ürün düzenleme formundaki ikincil eylem butonu (vazgeç/kapat) metni Türkçe dilinde "Tamam" olarak değiştirildi. Mevcut işlevsel davranışlar ve diğer "Vazgeç" butonları bu değişiklikten etkilenmemiştir.

---`;

// Find where the first '## [' or '---' after the header is
const searchMarker = '---';
const markerIndex = content.indexOf(searchMarker);

if (markerIndex !== -1) {
  const insertPos = markerIndex + searchMarker.length;
  const updatedContent = content.slice(0, insertPos) + '\n' + newEntry.trim() + '\n' + content.slice(insertPos);
  fs.writeFileSync(changelogPath, updatedContent, 'utf8');
  console.log("Successfully updated changelog.md with the new entry.");
} else {
  console.error("Marker not found in changelog.md");
}
