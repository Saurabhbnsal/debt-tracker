# Debt Tracker

Personal, phone-first tracker for all my loans: outstanding balances, EMIs, time to close each loan, and an overall debt-free date using the **snowball** method (extra money goes to the smallest balance first; freed-up EMIs roll into the next loan).

Data is stored only in the browser (localStorage). Use the **Backup** tab to export/restore a JSON file.

## Run locally

```
npm install
npx ng serve --host 0.0.0.0
```

Open `http://localhost:4200`, or `http://<PC-IP>:4200` from a phone on the same Wi-Fi.

## Deploy

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.
