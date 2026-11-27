// Web-only visual layer: neutral surfaces, one green accent, and a thin route "rail" that links
// the stops of a day. Selectors only paint; no widths, heights or order change on the measured
// timeline rows, so drag, selection and swipe geometry stay put.
export const visualRefreshStyles = `
:root{--bg:#F7F7F6;--surface:#FFFFFF;--text:#171717;--secondary:#525252;--muted:#6E6E6E;--border:#E4E4E2;--line:#ECECEA;--quiet:#F3F3F1;--tint:#F3F3F1;--rail:#D4D4D2}
body{font-variant-numeric:tabular-nums}
/* Bottom sheets: one white surface lifted off the map. */
div:empty:has(~div [data-testid$=sheet-handle]){background:var(--surface)!important;border-radius:20px 20px 0 0!important;box-shadow:0 -8px 24px #00000014,0 -1px 0 #0000000f!important}
[data-testid$=sheet-handle]>div{width:40px!important;height:4px!important;border-radius:2px!important;background:#D4D4D2!important}
/* Floating map controls. */
.glass-button,.workspace-toolbar>.icon-button{background:#fff;border-radius:12px;box-shadow:0 1px 3px #00000026,0 0 0 1px #0000000f;color:var(--text)}
.glass-button{font-weight:500}
/* Map overlays: white like every other surface, with a neutral shadow. */
.map-message{background:#ffffffed}
.map-hint{background:#ffffffef}
.map-empty-label{background:#ffffffbd}
.map-trip-preview{background:#fffffff5;box-shadow:0 8px 24px #0000001f}
.footprint-map .maplibregl-ctrl-attrib{background:#ffffffe6}
/* Titles go back to their base size; only the tight tracking goes. */
.home-native div:has(+[data-testid=home-trip-list-count]),[data-testid=web-overview-sheet-header] h1{letter-spacing:0!important}
.home-native [data-testid=home-create-trip]{border-radius:12px}
.home-native [data-testid^=home-trip-row-]>div>:first-child{font-weight:500}
/* Day actions: adding a stop is the primary move. */
[data-testid=web-day-sheet-header]>div>div:nth-child(2)>button:first-child{background:var(--green)!important;color:#fff!important;border-radius:12px;padding:0 16px;min-height:40px;font-weight:500;font-size:14px}
[data-testid=web-day-sheet-header]>div>div:nth-child(2)>button:first-child *{color:#fff!important}
/* Route rail: a spine through the day, one node per stop. */
.trip-workspace [data-testid=day-timeline]{padding:0 4px 0 28px}
[data-testid=day-timeline] [data-testid^=timeline-row-]{position:relative;border-color:transparent!important}
[data-testid=day-timeline] [data-testid^=timeline-row-]::after{content:'';position:absolute;z-index:-1;left:-19px;top:0;bottom:-1px;width:2px;border-radius:1px;background:var(--rail);pointer-events:none}
[data-testid=day-timeline]>div>div:first-child>[data-testid^=timeline-row-]::after{top:24px}
[data-testid=day-timeline]>div>div:last-child>[data-testid^=timeline-row-]::after{bottom:calc(100% - 24px)}
[data-testid=day-timeline]>div>div:only-child>[data-testid^=timeline-row-]::after{display:none}
[data-testid^=timeline-item-]>:first-child{position:relative;color:var(--secondary)!important;font-weight:500!important}
[data-testid^=timeline-item-]>:first-child::before{content:'';position:absolute;left:-24px;top:5px;width:12px;height:12px;box-sizing:border-box;border-radius:50%;background:var(--surface);border:2px solid var(--green);z-index:1}
[data-testid^=timeline-row-][aria-selected=true] [data-testid^=timeline-item-]>:first-child::before{background:var(--green)}
[data-testid^=timeline-item-]>div:nth-child(2)>:first-child{color:var(--text)!important;font-weight:500!important}
.trip-workspace [data-testid^=timeline-row-][aria-selected=true]::before{z-index:-2;background:var(--quiet);inset:0 -10px 0 -34px;border-radius:10px}
/* Overview: the days of the trip hang on the same rail as the stops of a day. */
[data-testid=web-overview-sheet-content]>div>div:first-child>button:first-child{font-weight:500}
.day-card{position:relative;padding-left:32px!important;border-bottom-color:transparent!important}
.day-card strong{font-weight:500}
.day-card::before{content:'';position:absolute;left:5px;top:25px;width:12px;height:12px;box-sizing:border-box;border-radius:50%;background:var(--surface);border:2px solid var(--green);z-index:1}
.day-card::after{content:'';position:absolute;left:10px;top:0;bottom:-13px;width:2px;border-radius:1px;background:var(--rail)}
div+.day-card::after{top:31px}
.day-card:last-child::after{bottom:calc(100% - 31px)}
div+.day-card:last-child::after{display:none}
/* Dialogs and buttons. */
.modal{border-radius:20px;box-shadow:0 8px 24px #0000001f}
.menu-list button>span:last-child{color:var(--muted)}
.button,.glass-button,.home-native [data-testid=home-create-trip]{transition:background-color .16s cubic-bezier(.22,1,.36,1),color .16s cubic-bezier(.22,1,.36,1),transform .12s cubic-bezier(.22,1,.36,1)}
.button:active,.glass-button:active,.home-native [data-testid=home-create-trip]:active{transform:scale(.97)}
@media(max-width:600px){.modal{border-radius:20px 20px 0 0}}
@media(prefers-reduced-motion:reduce){.button:active,.glass-button:active,.home-native [data-testid=home-create-trip]:active{transform:none}}
`;
