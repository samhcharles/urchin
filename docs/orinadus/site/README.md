# Orinadus Site (Legacy Starter)

Legacy static starter for early messaging exploration.

It is **not** the target Orinadus product architecture. The real direction is:

- Cloudflare at the edge
- Coolify on the VPS
- Next.js full-stack control plane
- Urchin as the sync substrate
- governance and dashboard layers above the substrate

## Run locally

From this folder:

```bash
python3 -m http.server 8080
```

Then open:

`http://localhost:8080`

## Files

- `index.html` - current self-contained homepage starter
- `styles.css` - alternate extracted stylesheet draft
- `assets/urchin-logo.png` - logo asset for later page wiring
- `logo-urchin.svg` - vector fallback logo
