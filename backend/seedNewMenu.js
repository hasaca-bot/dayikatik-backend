const fs = require('fs');
const path = require('path');
const { db } = require('./db');

const parsedMenu = [
  {
    "id": "et-iskender",
    "name": "Et İskender",
    "category": "et",
    "price": 350,
    "description": "Muhteşem sos, et, biber ve yoğurt ile",
    "calories": 750,
    "protein": 40,
    "carbs": 55,
    "fat": 40,
    "name_en": "Beef Iskender",
    "description_en": "Served with special sauce, beef, peppers and yogurt"
  },
  {
    "id": "et-beyti",
    "name": "Et Beyti",
    "category": "et",
    "price": 310,
    "description": "Muhteşem et döner ile",
    "calories": 700,
    "protein": 35,
    "carbs": 60,
    "fat": 35,
    "name_en": "Beef Beyti",
    "description_en": "Served with delicious beef doner"
  },
  {
    "id": "beyti-tavuk",
    "name": "Beyti Tavuk",
    "category": "et",
    "price": 250,
    "description": "Muhteşem tavuk döner ile",
    "calories": 600,
    "protein": 30,
    "carbs": 60,
    "fat": 25,
    "name_en": "Chicken Beyti",
    "description_en": "Served with delicious chicken doner"
  },
  {
    "id": "katik-et-durum",
    "name": "Katık Et Dürüm",
    "category": "et",
    "price": 220,
    "description": "Muhteşem sos ve etin eşsiz lezzeti",
    "calories": 600,
    "protein": 30,
    "carbs": 55,
    "fat": 28,
    "name_en": "Katik Beef Wrap",
    "description_en": "Unique taste of special sauce and beef"
  },
  {
    "id": "katik-et-ekmek-arasi",
    "name": "Katık Et Ekmek Arası",
    "category": "et",
    "price": 260,
    "description": "Muhteşem sos ve etin eşsiz lezzeti",
    "calories": 650,
    "protein": 30,
    "carbs": 75,
    "fat": 25,
    "name_en": "Katik Beef Sandwich",
    "description_en": "Unique taste of special sauce and beef"
  },
  {
    "id": "zurna-katik-et-durum",
    "name": "Zurna Katık Et Dürüm",
    "category": "et",
    "price": 250,
    "description": "Muhteşem 40 cm katık et dürüm lezzeti",
    "calories": 850,
    "protein": 45,
    "carbs": 80,
    "fat": 40,
    "name_en": "Zurna Katik Beef Wrap",
    "description_en": "Delicious 40 cm Katik beef wrap"
  },
  {
    "id": "katik-et-menu-1",
    "name": "Katık Et Menü 1",
    "category": "et",
    "price": 300,
    "description": "Et dürüm, ayran, cips ve tatlı",
    "calories": 1100,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Katik Beef Menu 1",
    "description_en": "Beef wrap served with ayran, french fries and dessert"
  },
  {
    "id": "katik-et-menu-2",
    "name": "Katık Et Menü 2",
    "category": "et",
    "price": 340,
    "description": "Et dürüm, kutu içecek, cips ve tatlı",
    "calories": 1150,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Katik Beef Menu 2",
    "description_en": "Beef wrap served with canned soft drink, french fries and dessert"
  },
  {
    "id": "combo-et-menu-1",
    "name": "Combo Et Menü 1",
    "category": "et",
    "price": 370,
    "description": "Et dürüm, kutu içecek, cips ve tatlı (Ekstra büyük)",
    "calories": 1300,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Combo Beef Menu 1",
    "description_en": "Beef wrap served with canned soft drink, french fries and dessert (Extra large)"
  },
  {
    "id": "combo-et-menu-2",
    "name": "Combo Et Menü 2",
    "category": "et",
    "price": 350,
    "description": "Et dürüm, kutu içecek, cips ve tatlı (Ekstra büyük)",
    "calories": 1250,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Combo Beef Menu 2",
    "description_en": "Beef wrap served with canned soft drink, french fries and dessert (Extra large)"
  },
  {
    "id": "zurna-et-menu-1",
    "name": "Zurna Et Menü 1",
    "category": "et",
    "price": 340,
    "description": "Et dürüm, kutu içecek, cips ve tatlı",
    "calories": 1350,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Zurna Beef Menu 1",
    "description_en": "Beef wrap served with canned soft drink, french fries and dessert"
  },
  {
    "id": "zurna-et-menu-2",
    "name": "Zurna Et Menü 2",
    "category": "et",
    "price": 360,
    "description": "Et dürüm, kutu içecek, cips ve tatlı",
    "calories": 1400,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Zurna Beef Menu 2",
    "description_en": "Beef wrap served with canned soft drink, french fries and dessert"
  },
  {
    "id": "katik-tavuk",
    "name": "Katık Tavuk",
    "category": "tavuk",
    "price": 160,
    "description": "Muhteşem sos ve tavuk etinin eşsiz lezzeti",
    "calories": 500,
    "protein": 25,
    "carbs": 55,
    "fat": 20,
    "name_en": "Katik Chicken",
    "description_en": "Unique taste of special sauce and chicken"
  },
  {
    "id": "ekmek-arasi-tavuk",
    "name": "Ekmek Arası Tavuk",
    "category": "tavuk",
    "price": 200,
    "description": "Muhteşem sos ve tavuk etinin eşsiz lezzeti",
    "calories": 550,
    "protein": 25,
    "carbs": 75,
    "fat": 18,
    "name_en": "Chicken Sandwich",
    "description_en": "Unique taste of special sauce and chicken"
  },
  {
    "id": "katik-kasarli-tavuk",
    "name": "Katık Kaşarlı Tavuk",
    "category": "tavuk",
    "price": 210,
    "description": "Muhteşem sos, kaşar ve tavuk etinin eşsiz lezzeti",
    "calories": 600,
    "protein": 32,
    "carbs": 56,
    "fat": 28,
    "name_en": "Katik Chicken with Kashar",
    "description_en": "Unique taste of special sauce, kashar cheese and chicken"
  },
  {
    "id": "katik-cedarli-tavuk",
    "name": "Katık Çedarlı Tavuk",
    "category": "tavuk",
    "price": 210,
    "description": "Muhteşem sos, çedar peynirinin ve tavuk etinin eşsiz lezzeti",
    "calories": 610,
    "protein": 30,
    "carbs": 56,
    "fat": 30,
    "name_en": "Katik Chicken with Cheddar",
    "description_en": "Unique taste of special sauce, cheddar cheese and chicken"
  },
  {
    "id": "katik-kasarli-mantarli",
    "name": "Katık Kaşarlı Mantarlı",
    "category": "tavuk",
    "price": 240,
    "description": "40 cm katık tavuk dürüm, kaşarın eşsiz lezzeti",
    "calories": 850,
    "protein": 40,
    "carbs": 80,
    "fat": 40,
    "name_en": "Katik Chicken with Kashar and Mushroom",
    "description_en": "40 cm Katik chicken wrap, unique taste of kashar cheese"
  },
  {
    "id": "zurna-tavuk",
    "name": "Zurna Tavuk",
    "category": "tavuk",
    "price": 190,
    "description": "40 cm katık tavuk dürüm lezzeti",
    "calories": 750,
    "protein": 38,
    "carbs": 80,
    "fat": 30,
    "name_en": "Zurna Chicken",
    "description_en": "40 cm Katik chicken wrap"
  },
  {
    "id": "zurna-katik-kasarli",
    "name": "Zurna Katık Kaşarlı",
    "category": "tavuk",
    "price": 240,
    "description": "40 cm katık tavuk dürüm, kaşarın eşsiz lezzeti",
    "calories": 850,
    "protein": 45,
    "carbs": 82,
    "fat": 38,
    "name_en": "Zurna Katik Chicken with Kashar",
    "description_en": "40 cm Katik chicken wrap, unique taste of kashar cheese"
  },
  {
    "id": "zurna-katik-cedarli",
    "name": "Zurna Katık Çedarlı",
    "category": "tavuk",
    "price": 240,
    "description": "40 cm katık tavuk dürüm, çedar peynirinin eşsiz lezzeti",
    "calories": 860,
    "protein": 43,
    "carbs": 82,
    "fat": 40,
    "name_en": "Zurna Katik Chicken with Cheddar",
    "description_en": "40 cm Katik chicken wrap, unique taste of cheddar cheese"
  },
  {
    "id": "zurna-barbeku-soslu",
    "name": "Zurna Barbekü Soslu",
    "category": "tavuk",
    "price": 220,
    "description": "40 cm katık tavuk dürüm, barbekünün eşsiz lezzeti",
    "calories": 800,
    "protein": 38,
    "carbs": 95,
    "fat": 30,
    "name_en": "Zurna Chicken with BBQ Sauce",
    "description_en": "40 cm Katik chicken wrap, unique taste of BBQ sauce"
  },
  {
    "id": "zurna-katik-mantarli",
    "name": "Zurna Katık Mantarlı",
    "category": "tavuk",
    "price": 220,
    "description": "40 cm katık tavuk dürüm ve mantarın eşsiz lezzeti",
    "calories": 770,
    "protein": 40,
    "carbs": 83,
    "fat": 31,
    "name_en": "Zurna Katik Chicken with Mushroom",
    "description_en": "40 cm Katik chicken wrap and the unique taste of mushrooms"
  },
  {
    "id": "katik-tavuk-menu-1",
    "name": "Katık Tavuk Menü 1",
    "category": "tavuk",
    "price": 240,
    "description": "Tavuk dürüm, ayran, cips ve tatlı",
    "calories": 1000,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Katik Chicken Menu 1",
    "description_en": "Chicken wrap served with ayran, french fries and dessert"
  },
  {
    "id": "katik-tavuk-menu-2",
    "name": "Katık Tavuk Menü 2",
    "category": "tavuk",
    "price": 260,
    "description": "Tavuk dürüm, kutu içecek, cips ve tatlı",
    "calories": 1050,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Katik Chicken Menu 2",
    "description_en": "Chicken wrap served with canned soft drink, french fries and dessert"
  },
  {
    "id": "combo-tavuk-menu-1",
    "name": "Combo Tavuk Menü 1",
    "category": "tavuk",
    "price": 280,
    "description": "Tavuk dürüm, ayran, cips ve tatlı (Ekstra büyük)",
    "calories": 1200,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Combo Chicken Menu 1",
    "description_en": "Chicken wrap served with ayran, french fries and dessert (Extra large)"
  },
  {
    "id": "combo-tavuk-menu-2",
    "name": "Combo Tavuk Menü 2",
    "category": "tavuk",
    "price": 300,
    "description": "Tavuk dürüm, ayran, cips ve tatlı (Ekstra büyük)",
    "calories": 1250,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Combo Chicken Menu 2",
    "description_en": "Chicken wrap served with ayran, french fries and dessert (Extra large)"
  },
  {
    "id": "zurna-tavuk-menu-1",
    "name": "Zurna Tavuk Menü 1",
    "category": "tavuk",
    "price": 270,
    "description": "Tavuk dürüm, ayran, cips and tatlı",
    "calories": 1250,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Zurna Chicken Menu 1",
    "description_en": "Chicken wrap served with ayran, french fries and dessert"
  },
  {
    "id": "zurna-tavuk-menu-2",
    "name": "Zurna Tavuk Menü 2",
    "category": "tavuk",
    "price": 290,
    "description": "Tavuk dürüm, ayran, cips ve tatlı",
    "calories": 1300,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Zurna Chicken Menu 2",
    "description_en": "Chicken wrap served with ayran, french fries and dessert"
  },
  {
    "id": "tavuk-tantuni-lavas",
    "name": "Tavuk Tantuni Lavaş",
    "category": "tantuni",
    "price": 180,
    "description": "Tavuk eti ve baharatlı tantuni lavaş",
    "calories": 450,
    "protein": 25,
    "carbs": 45,
    "fat": 18,
    "name_en": "Chicken Tantuni in Lavash",
    "description_en": "Chicken meat and spiced tantuni in lavash wrap"
  },
  {
    "id": "ekmek-arasi-tavuk-tantuni",
    "name": "Ekmek Arası Tavuk Tantuni",
    "category": "tantuni",
    "price": 200,
    "description": "Tavuk eti ve baharatlı tantuni ekmek",
    "calories": 550,
    "protein": 25,
    "carbs": 65,
    "fat": 18,
    "name_en": "Chicken Tantuni Sandwich",
    "description_en": "Chicken meat and spiced tantuni in bread"
  },
  {
    "id": "yogurtlu-tavuk-tantuni",
    "name": "Yoğurtlu Tavuk Tantuni",
    "category": "tantuni",
    "price": 230,
    "description": "Tavuk tantuni, yoğurt ve sos",
    "calories": 550,
    "protein": 30,
    "carbs": 50,
    "fat": 22,
    "name_en": "Chicken Tantuni with Yogurt",
    "description_en": "Chicken tantuni served with yogurt and sauce"
  },
  {
    "id": "et-tantuni-lavas",
    "name": "Et Tantuni Lavaş",
    "category": "tantuni",
    "price": 300,
    "description": "Dana eti ve baharatlı tantuni lavaş",
    "calories": 550,
    "protein": 30,
    "carbs": 45,
    "fat": 25,
    "name_en": "Beef Tantuni in Lavash",
    "description_en": "Beef and spiced tantuni in lavash wrap"
  },
  {
    "id": "ekmek-arasi-et-tantuni",
    "name": "Ekmek Arası Et Tantuni",
    "category": "tantuni",
    "price": 320,
    "description": "Dana eti ve baharatlı tantuni ekmek",
    "calories": 650,
    "protein": 30,
    "carbs": 65,
    "fat": 25,
    "name_en": "Beef Tantuni Sandwich",
    "description_en": "Beef and spiced tantuni in bread"
  },
  {
    "id": "yogurtlu-et-tantuni",
    "name": "Yoğurtlu Et Tantuni",
    "category": "tantuni",
    "price": 350,
    "description": "Et tantuni, yoğurt ve sos",
    "calories": 680,
    "protein": 35,
    "carbs": 50,
    "fat": 30,
    "name_en": "Beef Tantuni with Yogurt",
    "description_en": "Beef tantuni served with yogurt and sauce"
  },
  {
    "id": "pepsi-kutu",
    "name": "Pepsi (Kutu)",
    "category": "diger",
    "price": 70,
    "description": "Kutu İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Pepsi (Can)",
    "description_en": "Canned Soft Drink"
  },
  {
    "id": "pepsi-sise",
    "name": "Pepsi (Şişe)",
    "category": "diger",
    "price": 50,
    "description": "Şişe İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Pepsi (Bottle)",
    "description_en": "Bottled Soft Drink"
  },
  {
    "id": "yedigun-kutu",
    "name": "Yedigün (Kutu)",
    "category": "diger",
    "price": 70,
    "description": "Kutu İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Yedigun (Can)",
    "description_en": "Canned Soft Drink"
  },
  {
    "id": "yedigun-sise",
    "name": "Yedigün (Şişe)",
    "category": "diger",
    "price": 50,
    "description": "Şişe İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Yedigun (Bottle)",
    "description_en": "Bottled Soft Drink"
  },
  {
    "id": "baglar-gazoz",
    "name": "Bağlar Gazoz",
    "category": "diger",
    "price": 50,
    "description": "Şişe İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Baglar Soda",
    "description_en": "Bottled local soda"
  },
  {
    "id": "seven-up",
    "name": "Seven Up",
    "category": "diger",
    "price": 70,
    "description": "Kutu İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Seven Up (Can)",
    "description_en": "Canned Soft Drink"
  },
  {
    "id": "eksi-ayran",
    "name": "Ekşi Ayran",
    "category": "diger",
    "price": 60,
    "description": "Ayran",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Sour Ayran",
    "description_en": "Ayran"
  },
  {
    "id": "lipton-cesitleri",
    "name": "Lipton (Çeşitleri)",
    "category": "diger",
    "price": 70,
    "description": "Kutu İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Lipton Ice Tea (Varieties)",
    "description_en": "Canned Soft Drink"
  },
  {
    "id": "tropicana-meyve-suyu",
    "name": "Tropicana (Meyve suyu)",
    "category": "diger",
    "price": 70,
    "description": "Kutu İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Tropicana Juice",
    "description_en": "Canned Soft Drink"
  },
  {
    "id": "salgam",
    "name": "Şalgam",
    "category": "diger",
    "price": 50,
    "description": "İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Shalgam (Turnip Juice)",
    "description_en": "Beverage"
  },
  {
    "id": "meyveli-soda",
    "name": "Meyveli Soda",
    "category": "diger",
    "price": 40,
    "description": "İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Fruit Flavored Mineral Water",
    "description_en": "Beverage"
  },
  {
    "id": "ayran",
    "name": "Ayran",
    "category": "diger",
    "price": 50,
    "description": "İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Ayran",
    "description_en": "Beverage"
  },
  {
    "id": "soda",
    "name": "Soda",
    "category": "diger",
    "price": 30,
    "description": "İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Mineral Water",
    "description_en": "Beverage"
  },
  {
    "id": "su",
    "name": "Su",
    "category": "diger",
    "price": 16,
    "description": "İçecek",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Water",
    "description_en": "Beverage"
  },
  {
    "id": "eker-tatli",
    "name": "Eker Tatlı",
    "category": "diger",
    "price": 45,
    "description": "Tatlı",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Eker Dessert",
    "description_en": "Dessert"
  },
  {
    "id": "patates-cips",
    "name": "Patates Cips",
    "category": "diger",
    "price": 30,
    "description": "Atıştırmalık",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "French Fries",
    "description_en": "Snack"
  },
  {
    "id": "kasarli-ekstra-sos",
    "name": "Kaşarlı (Ekstra Sos)",
    "category": "diger",
    "price": 50,
    "description": "Peynir İlavesi",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Kashar Cheese (Extra)",
    "description_en": "Cheese Addition"
  },
  {
    "id": "cedarli-ekstra-sos",
    "name": "Çedarlı (Ekstra Sos)",
    "category": "diger",
    "price": 50,
    "description": "Peynir İlavesi",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "Cheddar Cheese (Extra)",
    "description_en": "Cheese Addition"
  },
  {
    "id": "barbeku-ekstra-sos",
    "name": "Barbekü (Ekstra Sos)",
    "category": "diger",
    "price": 30,
    "description": "Sos İlavesi",
    "calories": null,
    "protein": null,
    "carbs": null,
    "fat": null,
    "name_en": "BBQ Sauce (Extra)",
    "description_en": "Sauce Addition"
  }
];

const categoryData = [
  { id: 'et', name_tr: 'Et Ürünleri', name_en: 'Meat Products', sort_order: 1, icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 3h2v18h-2z"/><path d="M6 6c0-.5.5-1 1-1h6c.5 0 1 .5 1 1v1c0 .5-.5 1-1 1H7c-.5 0-1-.5-1-1V6zM6.5 8c0-.5.5-1 1-1h5c.5 0 1 .5 1 1v1.5c0 .5-.5 1-1 1h-5c-.5 0-1-.5-1-1V8zM7 11.5c0-.5.5-1 1-1h4c.5 0 1 .5 1 1V13c0 .5-.5 1-1 1H8c-.5 0-1-.5-1-1v-1.5zM7.5 14.5c0-.5.5-1 1-1h3c.5 0 1 .5 1 1v1.5c0 .5-.5 1-1 1h-3c-.5 0-1-.5-1-1v-1.5zM8 17.5c0-.5.5-1 1-1h2c.5 0 1 .5 1 1v1c0 .5-.5 1-1 1H9c-.5 0-1-.5-1-1v-1z"/><path d="M15.5 10c0 0 .5-1.5 1-2.5.2-.4.6-.7 1-.7.5 0 .8.3.9.7.1.5-.1 1-.4 1.5h1c.6 0 1 .4 1 1v2c0 1.1-.9 2-2 2h-1c-.5.8-1.3 1.3-2.3 1.3-1.5 0-2.2-.8-2.2-1.8 0-.5.2-1 .5-1.3l-1.5-1.2v-1z"/><path d="M5.5 19.5c-3-2.5-4-6.5-2.5-10.5C4.5 5 8.5 2.5 12.5 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' },
  { id: 'tavuk', name_tr: 'Tavuk Ürünleri', name_en: 'Chicken Products', sort_order: 2, icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 3h2v18h-2z"/><path d="M6 6c0-.5.5-1 1-1h6c.5 0 1 .5 1 1v1c0 .5-.5 1-1 1H7c-.5 0-1-.5-1-1V6zM6.5 8c0-.5.5-1 1-1h5c.5 0 1 .5 1 1v1.5c0 .5-.5 1-1 1h-5c-.5 0-1-.5-1-1V8zM7 11.5c0-.5.5-1 1-1h4c.5 0 1 .5 1 1V13c0 .5-.5 1-1 1H8c-.5 0-1-.5-1-1v-1.5zM7.5 14.5c0-.5.5-1 1-1h3c.5 0 1 .5 1 1v1.5c0 .5-.5 1-1 1h-3c-.5 0-1-.5-1-1v-1.5zM8 17.5c0-.5.5-1 1-1h2c.5 0 1 .5 1 1v1c0 .5-.5 1-1 1H9c-.5 0-1-.5-1-1v-1z"/><path d="M15.5 13.5c0 0 .5-1.5 1.5-2 .5-.2.5-.5.5-.8 0-.5-.3-.7-.7-.7-.3 0-.6.1-.9.3-.3-1 .2-2.3.8-2.8.3-.3.8-.5 1.2-.4s.7.4.8.8c.2.8.2 1.6-.2 2.3.3.5.7.8 1 .8.5 0 1.2-.5 1.5-.8.2.5.3 1.1.2 1.7-.2.8-.7 1.3-1.3 1.5-.6.2-1.3.1-1.8-.2-.3.3-.6.7-1 .9-.3.2-.6.3-.9.3-.7 0-1.2-.6-1.2-1.4z"/><path d="M5.5 19.5c-3-2.5-4-6.5-2.5-10.5C4.5 5 8.5 2.5 12.5 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' },
  { id: 'tantuni', name_tr: 'Tantuni Ürünleri', name_en: 'Tantuni Products', sort_order: 3, icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 5.5l-9 9c-.8.8-.8 2 0 2.8l2.2 2.2c.8.8 2 .8 2.8 0l9-9c.8-.8.8-2 0-2.8l-2.2-2.2c-.8-.8-2-.8-2.8 0z" /><path d="M14 6.5l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M17.5 16.5c-1-1-2.5-.5-3 1-.3.8-.2 1.8.3 2.5.5.7 1.5 1.2 2.2.8.8-.4.8-1.5.5-2.3-.3-.8 0-1.5 0-2z" /><path d="M6.5 18.5c-3-2.5-4-6.5-2.5-10.5C5.5 4 9.5 1.5 13.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' },
  { id: 'diger', name_tr: 'İçecekler ve Yan Ürünler', name_en: 'Drinks & Sides', sort_order: 4, icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>' }
];

const fallbackImages = {
  et: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=500&q=80',
  tavuk: 'https://images.unsplash.com/photo-1561651823-34feb02250e4?auto=format&fit=crop&w=500&q=80',
  tantuni: 'https://images.unsplash.com/photo-1624697257428-87cc14260b2b?auto=format&fit=crop&w=500&q=80',
  diger: 'https://images.unsplash.com/photo-1543257580-7269da773bf5?auto=format&fit=crop&w=500&q=80',
  ayran: 'https://images.unsplash.com/photo-1527018601619-a508a2be00cd?auto=format&fit=crop&w=500&q=80',
  su: 'https://images.unsplash.com/photo-1548839140-29a88648f138?auto=format&fit=crop&w=500&q=80',
  tatli: 'https://images.unsplash.com/photo-1579372786545-d24232daf58c?auto=format&fit=crop&w=500&q=80',
  cips: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=500&q=80'
};

async function seed() {
  try {
    console.log('[SEED] Fetching existing products to preserve images...');
    const oldProducts = await db.all('SELECT id, image FROM products');
    const imageMap = {};
    for (const p of oldProducts) {
      if (p.image) {
        imageMap[p.id] = p.image;
      }
    }

    console.log('[SEED] Clearing categories and products tables...');
    await db.exec('DELETE FROM products');
    await db.exec('DELETE FROM categories');

    console.log('[SEED] Seeding new categories...');
    const isPg = db.type === 'pg';
    for (const cat of categoryData) {
      if (isPg) {
        await db.run(
          'INSERT INTO categories (id, name_tr, name_en, sort_order, icon) VALUES ($1,$2,$3,$4,$5)',
          [cat.id, cat.name_tr, cat.name_en, cat.sort_order, cat.icon]
        );
      } else {
        await db.run(
          'INSERT INTO categories (id, name_tr, name_en, sort_order, icon) VALUES (?,?,?,?,?)',
          [cat.id, cat.name_tr, cat.name_en, cat.sort_order, cat.icon]
        );
      }
    }

    console.log('[SEED] Seeding parsed products...');
    const menuJsonOutput = [];

    for (const prod of parsedMenu) {
      let image = imageMap[prod.id];
      
      if (!image) {
        if (prod.id.includes('ayran')) {
          image = imageMap['ayran'] || fallbackImages.ayran;
        } else if (prod.id.includes('su')) {
          image = imageMap['su'] || fallbackImages.su;
        } else if (prod.id.includes('tatli')) {
          image = fallbackImages.tatli;
        } else if (prod.id.includes('cips')) {
          image = fallbackImages.cips;
        } else if (prod.category === 'tantuni') {
          image = imageMap['tavuk-tantuni-durum'] || imageMap['et-tantuni-durum'] || fallbackImages.tantuni;
        } else if (prod.category === 'tavuk') {
          image = imageMap['katik-tavuk-doner-durum'] || imageMap['zurna-tavuk-doner-durum'] || fallbackImages.tavuk;
        } else if (prod.category === 'et') {
          image = imageMap['katik-et-doner-durum'] || imageMap['zurna-katik-et-doner-durum'] || fallbackImages.et;
        } else {
          image = fallbackImages[prod.category] || fallbackImages.diger;
        }
      }

      const portionTr = '1 Porsiyon';
      const portionEn = '1 Portion';
      
      const paramValues = [
        prod.id,
        prod.name, // name_tr
        prod.name_en || prod.name, // name_en
        prod.description, // description_tr
        prod.description_en || prod.description, // description_en
        prod.category,
        prod.price,
        image,
        portionTr,
        portionEn,
        '', // ingredients_tr
        '', // ingredients_en
        prod.calories,
        prod.protein,
        prod.carbs,
        prod.fat,
        0, // saturated_fat
        0, // sugars
        0, // fiber
        0, // salt
        '[]', // allergens
        0 // katki_maddesi_icermez
      ];

      if (isPg) {
        await db.run(`
          INSERT INTO products (
            id, name_tr, name_en, description_tr, description_en, category, price, image,
            portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
            saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        `, paramValues);
      } else {
        await db.run(`
          INSERT INTO products (
            id, name_tr, name_en, description_tr, description_en, category, price, image,
            portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
            saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, paramValues);
      }

      menuJsonOutput.push({
        id: prod.id,
        name: prod.name,
        name_en: prod.name_en || prod.name,
        category: prod.category,
        price: prod.price,
        description: prod.description,
        description_en: prod.description_en || prod.description,
        image: image,
        besin_degerleri: {
          porsiyon: portionTr,
          enerji: prod.calories,
          yag: prod.fat,
          doymus_yag: 0,
          karbonhidrat: prod.carbs,
          sekerler: 0,
          lif: 0,
          protein: prod.protein,
          tuz: 0
        },
        makrolar: {
          protein: { deger: prod.protein, yuzde: 0 },
          karbonhidrat: { deger: prod.carbs, yuzde: 0 },
          yag: { deger: prod.fat, yuzde: 0 }
        },
        alerjenler: [],
        icindekiler: '',
        katki_maddesi_icermez: false
      });
    }

    const menuPath = path.join(__dirname, '..', 'data', 'menu.json');
    fs.writeFileSync(menuPath, JSON.stringify(menuJsonOutput, null, 2), 'utf8');
    console.log('[SEED] Successfully updated data/menu.json');

    console.log('[SEED] Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('[SEED ERROR] Seeding failed:', err);
    process.exit(1);
  }
}

seed();
