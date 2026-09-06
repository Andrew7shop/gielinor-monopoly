# Gielinor Monopoly

An online, RuneScape-flavored reskin of Monopoly. Same board layout, prices,
and rules as classic Monopoly — original artwork, place names, and card text
inspired by RuneScape. Not affiliated with or endorsed by Jagex.

Play token = a skill icon (⚔️ Attack, 💪 Strength, 🛡️ Defence, 🪓 Woodcutting,
🎣 Fishing, ⛏️ Mining, 🍳 Cooking, ✨ Prayer). Properties are Gielinor
locations grouped like the classic color sets, railroads are "Spirit Tree"
stops, utilities are the Rune Essence Mine and Fishing Guild, Chance is
"Treasure Trail", Community Chest is "Random Event", and jail is Draynor Jail.

## Features

- Full classic Monopoly ruleset: buying, rent (with monopoly double-rent),
  building huts/castles with even-build enforcement, mortgaging, jail (pay /
  card / roll doubles / 3-turn limit), player-to-player trading, real
  ascending auctions when a purchase is declined, and bankruptcy (to another
  player or to the bank).
- Real-time multiplayer over WebSockets (Socket.IO) — up to 8 players per
  room, join with a 4-letter room code.
- No build step: plain HTML/CSS/JS frontend, a small Express + Socket.IO
  server, everything in-memory (no database).

## Run locally

```
npm install
npm start
```

Then open http://localhost:3000 in a few browser tabs/windows to test with
multiple "players". Create a room in one tab, then join with the code in the
others.

## Deploy so friends can play online

This repo is set up for [Render](https://render.com) (free tier, no credit
card required for a basic web service):

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. In the Render dashboard: **New +** → **Blueprint**, point it at the repo.
   Render will read `render.yaml` and provision a free Node web service
   automatically (build: `npm install`, start: `npm start`).
   - Alternatively: **New +** → **Web Service**, connect the repo, and set
     Build Command to `npm install` and Start Command to `npm start` by hand.
3. Once deployed, Render gives you a public URL like
   `https://gielinor-monopoly.onrender.com` — share that with friends.

Render's free web services spin down after a period of inactivity and take
a few seconds to wake back up on the next visit — that's expected and fine
for a casual game night.

## Art credits

Coin-stack, Treasure Trail, and Random Event icons are from
[game-icons.net](https://game-icons.net), licensed
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/):
"Two coins", "Coins", "Coins pile", "Money stack", "Gold stack" by Delapouite;
"Treasure map" by Lorc; "Open treasure chest" by Skoll; "Present" by
Delapouite; "Gift trap" by Lorc.

## Known limitations (v1)

- Rooms live in server memory only — a server restart clears all games in
  progress. There's no persistence/database.
- Refreshing your browser mid-game disconnects you from that seat (it
  becomes "offline" and its turns are skipped); there's no reconnect-by-name
  flow yet.
- Bankruptcy to the bank returns properties to the bank unmortgaged and
  un-auctioned for simplicity, rather than immediately re-auctioning each
  one (a minor deviation from the physical-board rule).
- No bank limit on houses/hotels (32 houses / 12 hotels in the physical
  game) — building is unlimited here.
