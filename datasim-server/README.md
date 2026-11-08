# Data Sim: live data server

This folder runs **Data Sim with real data**. When the game is opened from this server, your scouts stop making up numbers. They collect real data on the topics in your Watchlist.

```
 You type "Labubu" in the Watchlist
              │
              ▼
   Data Sim game  ──asks──►  server.js  ──►  Wikipedia page views  (free, no key)
   (public/index.html          │       ──►  YouTube Data API      (free key)
    or NEON HARVEST)           │       ──►  OpenStreetMap places  (free, no key, needs a ZIP)
                               │       ──►  ZIP → town lookup     (free, no key)
              ▲                 │
              └── real rows ◄───┘   (saved for 6 hours so you stay inside the free limits)
```

Players choose with the **SIM data / LIVE data** switch in the top bar.

| Where you open the game | SIM data | LIVE data |
|---|---|---|
| The Claude artifact link | ✓ | ✗ (Claude blocks outside connections) |
| This server (`localhost:3000` or your website) | ✓ | ✓ automatic |
| NEON HARVEST → Data Sim HQ | ✓ | ✓ after entering your server address in the LIVE data box |

## Choosing an area

Each Watchlist topic has a **State** and an optional **ZIP code**. Typing a ZIP fills in the state, and the game warns you if the ZIP and state don't match.

| Source | What the area does |
|---|---|
| OpenStreetMap places | Lists real places within 10 miles of the ZIP whose name, brand or cuisine matches the topic. For Smoke Shop topics it also lists nearby smoke and vape shops. Only runs when a ZIP is set. |
| YouTube | Searches the topic plus the town or state name, for example "birria tacos Orlando Florida". YouTube can't filter by location reliably, so these rows say "searched by name". |
| Wikipedia | Always national, because page views aren't split by place. These rows say "National". |

## What each live row is

- **Wikipedia page views:** one row per topic. It gives views in the last 7 days and growth compared with the 7 days before. This is a good signal for whether interest is rising.
- **YouTube:** up to 10 rows per topic. These are the most-viewed US videos about the topic from the last 7 days, with views, views per day, likes, comments and length. Topics in the *YouTube 10+ Min* category only return videos longer than 20 minutes.
- Every row has a **Link** column, so a company can click through and check it. The **Data** column marks each row as Live, Simulated or Test.

In live mode, scouts only work on Watchlist topics. When they have used every fresh row, they show **Waiting** until the server refreshes (every 6 hours by default).

---

## Step 1: Install Node.js

Download the **LTS** version from https://nodejs.org and install it. You need version 18 or newer.

## Step 2: Get a free YouTube API key (optional, about 5 minutes)

Skip this step and the game will use Wikipedia only.

1. Go to https://console.cloud.google.com and sign in.
2. Create a project. Any name works, for example "Data Sim".
3. Open **APIs & Services → Library**, search **YouTube Data API v3**, and click **Enable**.
4. Open **APIs & Services → Credentials → Create credentials → API key**. Copy the key.
5. Recommended: click the key, then under **API restrictions** limit it to *YouTube Data API v3*.

Free quota is 10,000 units a day. Each new topic search costs about 101 units, so that's roughly 95 fresh topic lookups a day. The 6-hour cache keeps you well under the limit.

## Step 3: Add your settings

1. Make a copy of `.env.example` and name the copy `.env`.
2. Paste your key after `YOUTUBE_API_KEY=`.
3. Put your email after `CONTACT_EMAIL=`. Wikipedia asks tools that pull its data to include a way to contact the owner.

## Step 4: Run it

Open a terminal in this folder and run:

```
node server.js
```

Then open **http://localhost:3000**. The top bar should say **Data LIVE**. Add a topic to the Watchlist and the feed will show "Live: N data points ready".

To test without internet, set `DATASIM_MOCK=1` in `.env`. Every row is then labeled "test row" and shows **Test** in the Data column.

## Use it from NEON HARVEST

NEON HARVEST has a **Data Sim HQ** district on the Metro. To give its players LIVE data:

1. Put this server online (Step 5).
2. In NEON HARVEST, go to Data Sim HQ and open the Data Sim cabinet. Click **LIVE data**, paste your server's address (for example `my-datasim.onrender.com`) and click **Connect**.

The server already allows other websites to call it, so nothing else needs changing.

## Step 5: Put it online with Render (free)

This folder lives in the `LS-city/neon-harvest` repo, so Render can pull it straight from GitHub.

1. Sign up at https://render.com with your GitHub account.
2. Click **New → Web Service** and pick the **neon-harvest** repo.
3. Fill in:
   - **Root Directory:** `datasim-server`
   - **Runtime:** Node
   - **Build Command:** leave blank (or `echo ok`)
   - **Start Command:** `node server.js`
   - **Instance type:** Free
4. Under **Environment Variables**, add `YOUTUBE_API_KEY` (optional) and `CONTACT_EMAIL`. Don't upload a `.env` file.
5. Click **Deploy**. When it says **Live**, your address looks like `https://datasim-xxxx.onrender.com`.
6. Test it: open that address plus `/api/health`. You should see `"ok":true`.

The free plan sleeps after 15 minutes with no visitors, and the first request after that takes about a minute to wake it up.

---

## Good to know

- **Saves are per browser.** Player saves still live in each player's own browser. Real accounts, so players can log in from anywhere, would be the next server feature.
- **Check each source's terms.** Read the YouTube API terms before you sell reports built on YouTube data, and keep the source links in what you share.
- **Watch time isn't available.** YouTube only shares "watched for 10+ minutes" with a video's owner. Live rows use video length plus views instead.
- **Adding sources later.** Write a new function shaped like `wikipedia()` or `youtube()` in `server.js` and add it to `collect()`. Good candidates are Reddit, Google Trends (if you get access) and sales data from partner smoke shops.
