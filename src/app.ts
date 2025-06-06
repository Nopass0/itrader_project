import { BybitClient } from "@/bybit/client";

async function main() {
  console.log("=== Bybit P2P Маркет ===\n");
  
  const client = new BybitClient();
  
  try {
    // Добавляем аккаунт
    console.log("Подключение к Bybit...");
    const accountId = await client.addAccount(
      "ysfXg4bN0vRMwlwYuI",
      "aIxbRqs8oqoDoqwGjEQTFsjDg68WsAxOns4n",
      false,
      "Main Account",
    );
    console.log("✅ Подключено\n");
    
    // Проверяем баланс
    console.log("📊 Баланс FUND:");
    const balances = await client.getP2PBalances(accountId);
    balances.forEach((b) => {
      console.log(`   ${b.coin}: ${b.free}`);
    });
    
    // Информация о пользователе
    console.log("\n👤 Пользователь:");
    const userInfo = await client.getP2PUserInfo(accountId);
    console.log(`   Nickname: ${userInfo.nickName}`);
    console.log(`   KYC: ${userInfo.kycVerifyStatus === 1 ? "✅" : "❌"}`);
    
    // Поиск объявлений на маркете
    console.log("\n🔍 Объявления USDT/RUB (продажа):");
    try {
      const ads = await client.searchP2PAds(accountId, {
        tokenId: "USDT",
        currencyId: "RUB",
        side: "1", // продажа
        page: 1,
        size: 3,
      });
      
      if (ads.list && ads.list.length > 0) {
        console.log(`   Найдено: ${ads.count}`);
        ads.list.forEach((ad, i) => {
          console.log(`\n   ${i + 1}. ${ad.nickName}: ${ad.price} RUB`);
          console.log(`      Доступно: ${ad.lastQuantity} USDT`);
        });
      }
    } catch (error: any) {
      console.log(`   Ошибка: ${error.message}`);
    }
    
    // Мои объявления
    console.log("\n\n📢 Мои объявления:");
    const myAds = await client.getMyP2PAds(accountId);
    if (myAds.length > 0) {
      myAds.forEach((ad) => {
        console.log(`   - ${ad.side === "1" ? "Продажа" : "Покупка"} ${ad.quantity} ${ad.tokenId}`);
      });
    } else {
      console.log("   Нет активных объявлений");
    }
    
  } catch (error: any) {
    console.error("\n❌ Ошибка:", error.message);
  }
}

// Запуск
main()
  .then(() => {
    console.log("\n✅ Готово!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Ошибка:", error);
    process.exit(1);
  });
