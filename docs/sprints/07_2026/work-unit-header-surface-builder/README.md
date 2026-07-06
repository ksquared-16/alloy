# Work Unit Header Surface Builder (July 2026)

Configurable Work Unit Header via **Settings → Surfaces → Work Units → Work Unit Header**.

Mirrors the Workspace Header sprint: full-bleed builder, `entity_layouts` persistence (`layout_key=work_unit_header`), shared KPI presenter, atomic runtime reveal on `/workspace/work-unit/:slug`.

## Validation checklist

- [ ] Surfaces → Work Units → Work Unit Header opens full-bleed builder (not three-column shell)
- [ ] Configure title, subtitle, 3 KPIs; publish twice (no duplicate layouts)
- [ ] `/workspace/work-unit/<slug>` — header + KPIs top/right; pills below; queue/focus panel unchanged
- [ ] KPI icons match accent color in builder and runtime

## Screenshots

Add `01-builder.png` and `02-runtime.png` after browser verify.
