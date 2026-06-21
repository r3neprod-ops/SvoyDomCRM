# CRM24 Premium UI v5 transfer package

This branch stores a lightweight source package for the standalone Premium UI v5 prototype.

File to download:

`premium-ui-v5/crm24-premium-ui-v5-source-only.tar.gz.base64`

Decode it locally:

```bash
base64 -d crm24-premium-ui-v5-source-only.tar.gz.base64 > crm24-premium-ui-v5-source-only.tar.gz
tar -xzf crm24-premium-ui-v5-source-only.tar.gz
cd crm24-premium-ui-v5
```

Expected SHA-256 for the decoded `.tar.gz`:

```text
1857cb52bc5f4df9fee667d68206701c81429afa59b39844366b9e8b85443480
```

The archive contains:

- index.html
- src/styles.css
- src/app.js
- assets/favicon.svg
- docs/CODEX_INTEGRATION_PROMPT.md
- docs/INTEGRATION_GUIDE.md
- docs/FUNCTIONAL_CONTRACT.md
- docs/CHAT_UX_AND_MOTION.md
- docs/VISUAL_ACCEPTANCE_CRITERIA.md
- package.json
- dev-server.mjs
- README.md

Run the standalone prototype:

```bash
npm install
npm run dev
```

Or serve it statically:

```bash
python3 -m http.server 4173
```

Main integration reference: `docs/CODEX_INTEGRATION_PROMPT.md` inside the decoded archive.