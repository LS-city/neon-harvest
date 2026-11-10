# NEON HARVEST

A social 2D cyberpunk world. Collect and build PC parts, work shifts at The Glitch, Cyber Buys & More and The Third Eye, duel in The Grid, play Companion Clash (an original JRPG starring you and your companion), hang out in the Gamers Den (an anime & gamer bar with booths, a themed menu, a jukebox, event boards and Den Crew shifts) and fight in The Void cabinet inside it, show off cars at the Car Display, and redeem real-life rewards at Smacked Shop.

**Play:** https://ls-city.github.io/neon-harvest/

Multiplayer, accounts and saving run on [Firebase](https://firebase.google.com) (free plan). Until a Firebase project is connected, the game runs in solo mode.

## Connect Firebase (one time, about 10 minutes)

1. **Create the project.** Go to <https://console.firebase.google.com>, click **Create a project**, name it (for example `neon-harvest`), and finish the wizard. Google Analytics is optional.
2. **Add a web app.** On the project home page click the **</>** (Web) icon, give it a nickname, skip Hosting, and click **Register app**. Copy the `firebaseConfig` values it shows.
3. **Turn on sign-in.** Go to **Build → Authentication → Get started → Sign-in method** and enable **Google** and **Email/Password**.
4. **Allow this website.** Still in Authentication, open **Settings → Authorized domains → Add domain** and add `ls-city.github.io`.
5. **Create Firestore.** Go to **Build → Firestore Database → Create database**, pick a location, start in **production mode**. Then open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
6. **Create Realtime Database.** Go to **Build → Realtime Database → Create database**, pick a location, start in **locked mode**. Open the **Rules** tab, replace everything with [`database.rules.json`](database.rules.json), and click **Publish**. Copy the database URL shown at the top (it ends in `firebasedatabase.app` or `firebaseio.com`).
7. **Paste the config.** Edit [`firebase-config.js`](firebase-config.js) and replace the `YOUR_...` values with your web app config, including `databaseURL` from step 6. Commit the change. GitHub Pages updates within a minute or two.

The config values are safe to publish. Access is controlled by the security rules.

## Adults only (21+)

After signing in, each new account confirms its date of birth once. Only "confirmed 21+" and the time are saved (in `data/users/{uid}/agecheck`, private to that player), never the birth date. Anyone under 21 is shown a message and can only sign out. This is a self-confirmation, so also check a photo ID at every Smacked Shop pickup.

## Owner powers

`NH_OWNER_EMAIL` in `firebase-config.js` is the only account that can stock Smacked Shop, verify pickup codes, and claim the name **Rassir**. Sign in with **Continue with Google** using that address. Email/password accounts don't count until their email is verified, so nobody can register your address and take over the shop.

## MyDex

MyDex Hub is a Metro stop. Players get a card, 100 animated badges, encounters, the Badge Vault and the Badge Forge. Everything lives in the `md*` collections in Firestore, and the rules that protect it are in `firestore.rules`. **After updating the game, publish `firestore.rules` again** or MyDex will show a setup notice. Partners can request Neon Row Specials (digital items the owner designs in Admin → Neon Row) and list them as rewards that land in a player's Stash instantly; this needs the `rowdigi` and `rowreqs` rules. Neon Row partners get a 📊 Insights tab (anonymous visit counts, busiest hours, most-redeemed rewards), and Data Sim can hire Neon Row Store scouts that turn those numbers into Data Boxes and reports; this needs the `rowvisits` rules in `firestore.rules`. Players can customize forged badges from their Vault (name, color, frame, trim, animations); the rules keep each badge's item art, rarity and category locked. The customize fee is set in MyDex admin → Forge.

The owner account gets an Admin tab inside MyDex (also on the board at MyDex Hub and in Admin Panel). It controls players, suspensions, pictures, official badges, Forge prices, venues, spots, reports and the notice banner.

## Files

| File | What it is |
|---|---|
| `index.html` | The game |
| `mydex.html` | MyDex, opened inside the game |
| `nh-firebase.js` | Connects the game to Firebase: sign-in screen, saves, live multiplayer, shop photo uploads |
| `firebase-config.js` | Your Firebase project settings and owner email |
| `firestore.rules` | Who can read and write saves, shops, trades and duels |
| `database.rules.json` | Rules for live player positions and multiplayer events |
| `build.py` | Rebuilds `index.html` from the claude.ai version of the game |

## Smacked Shop rewards and profit

- **Reward Points (RP)** are the only way to pay at Smacked Shop. Only Data Collectors Club members earn them, and only from work: bar, store, club and noodle shifts, the assembly line, Courier Hub package runs, story quests and Story Mode. Parts orders, rig commissions and credits from miners, duels, the Void, gifts, trades and selling parts never turn into points, and points can't be traded or gifted.
- **Monthly reward limit.** When you stock an item, enter what it costs you in dollars. Each member can redeem at most $14 of real cost per calendar month (UTC) by default. This limit is checked by the Firestore rules, not just the game, so even a player who cheats their point balance can't take more than the limit.
- **Profit settings** (Smacked Shop → Owner tools → Profit settings) let you change the monthly limit, how many points equal $1, and the daily point limit. Membership is donate-what-you-want (players see "Donate what you want to help the creator"); the price field there is only the typical donation you expect, used to estimate your worst-case profit per member. Keep the monthly limit well below what members usually donate.
- Items stocked before this update have no cost yet and show "Not priced yet" until you edit them and enter what they cost you.
- Cancelled redemptions refund the points but still count toward that month's limit.

**After updating, paste the new [`firestore.rules`](firestore.rules) into Firebase (Firestore Database → Rules → Publish).** Until you do, the monthly limit is only checked by the game.

## Notes

- Each player's game runs in their own browser, so combat damage, balances and trades are checked by the players' games rather than a server. The rules stop players from editing each other's saves, but a determined cheater could still inflate their own numbers, including Reward Points. The monthly limit caps what that can cost you; still review Smacked Shop redemptions before handing over real items.
- Firebase's free plan covers roughly 100 players online at once and 50,000 database reads a day, which is plenty for a community game. The console shows usage under **Usage and billing**.
- This `index.html` is now the main version of the game. `build.py` rebuilds it from the older claude.ai copy, which doesn't have Reward Points, so don't run it unless that copy is updated first.

## Next step: automatic memberships (needs Firebase's pay-as-you-go plan)

Members donate what they want through Cash App or PayPal, and memberships are still switched on by hand in the Admin Panel. To make them automatic and to move balances onto a server:

1. Upgrade the Firebase project to the **Blaze** (pay-as-you-go) plan and set a budget alert.
2. Create a **Stripe** account and a pay-what-you-want donation link (Stripe Payment Links support "customer chooses price").
3. Add a Cloud Function that receives Stripe's payment events and writes `dcc/{uid}` (on, and `until` set one month after the donation).
4. Move Reward Point earning and redemption into Cloud Functions so the server, not the browser, keeps the balance.
