# 💎 MONGODB DATABASE GUIDE & ROADMAP 💎

Denna fil innehåller allt du behöver veta om det nya databassystemet för **Tanks.io**.

---

## 🟢 STATUS: MIGRERING SLUTFÖRD
Spelardata har flyttats från `players.json` till en **MongoDB-kluster** på Railway.
- **Säkerhet**: Data raderas inte längre vid deployments.
- **Hantering**: Du kan ändra allt direkt i Railway-gränssnittet.

---

## 🛠️ SÅ HÄR ÄNDRAR DU PIN / STATS
1. Gå till **Railway Dashboard**.
2. Klicka på **MongoDB**-servicen.
3. Gå till fliken **"Data"**.
4. Hitta tabellen `players`.
5. Klicka på **"Edit"** på en rad för att ändra:
   - `pin`: Radera innehållet helt för att låta spelaren välja en ny vid nästa inloggning.
   - `kills`, `deaths`, `scrap`: Ändra värdena direkt för att ge "boosts" eller nollställa.

---

## 🚀 REKOMMENDERAD ROADMAP (NÄSTA STEG)

### 🥇 1. GLOBAL LEADERBOARD (Hög Prio)
- **Vad**: En topplista i lobbyn som visar de 10 bästa spelarna i världen.
- **Hur**: Vi hämtar data från `Player`-kollektionen sorterat på flest kills.

### 📝 2. FEEDBACK-ARKIV (Medel Prio)
- **Vad**: Spara alla "Send Feedback"-meddelanden i en egen tabell i MongoDB.
- **Hur**: Utöka `/api/feedback` för att även skriva till databasen.

### ⚙️ 3. REMOTE BALANCING (Medel Prio)
- **Vad**: Styr spelets balans (t.ex. hur mycket scrap en drone ger) via databasen.
- **Hur**: Skapa en `Config`-tabell som servern läser in vid start.

---

## ⚠️ VIKTIGT ATT KOMMA IHÅG
- **Lokalt**: Om du kör spelet på din dator utan MongoDB kommer den fortfarande använda `players.json`.
- **Live**: På Railway är det MongoDB som gäller till 100%.

---
*Dokumentet skapat av din AI-pilot – Sov så gott!* 🛰️💤
