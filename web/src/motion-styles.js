export const motionStyles = `
:root{view-transition-name:none;--travel-motion-ease:cubic-bezier(.22,1,.36,1);--travel-dialog-offset:16px}
/* Snapshots belong to UI panels. Maps and their WebGL canvases stay live. */
html[data-travel-motion] .modal-layer{view-transition-name:travel-overlay}
html[data-travel-motion] .modal{view-transition-name:travel-dialog}
html[data-travel-motion] .modal-layer:has(.picker-map),html[data-travel-motion] .modal:has(.picker-map){view-transition-name:none}
html[data-travel-motion] .modal-content>.inner-confirmation:not(:has(~.inner-confirmation)){view-transition-name:travel-confirmation}
html[data-travel-motion] [data-testid=home-trip-preview]{view-transition-name:travel-preview}
html[data-travel-motion=route] :is([data-testid=web-home-sheet-header],[data-testid=web-overview-sheet-header],[data-testid=web-day-sheet-header]){view-transition-name:travel-heading}
html[data-travel-motion=route] :is([data-testid=web-home-sheet-content],[data-testid=web-overview-sheet-content],[data-testid=web-day-sheet-content]){view-transition-name:travel-content}
::view-transition{pointer-events:none}
::view-transition-group(*){animation-duration:240ms;animation-timing-function:var(--travel-motion-ease)}
::view-transition-old(*),::view-transition-new(*){mix-blend-mode:normal}
::view-transition-old(travel-dialog),::view-transition-old(travel-confirmation){animation:travel-fade-out 140ms ease-out both}
::view-transition-new(travel-dialog),::view-transition-new(travel-confirmation){animation:travel-fade-in 200ms var(--travel-motion-ease) both}
::view-transition-new(travel-dialog):only-child,::view-transition-new(travel-confirmation):only-child{animation:travel-dialog-in 240ms var(--travel-motion-ease) both}
::view-transition-old(travel-dialog):only-child,::view-transition-old(travel-confirmation):only-child{animation:travel-dialog-out 160ms ease-out both}
::view-transition-old(travel-heading),::view-transition-old(travel-content){animation:travel-fade-out 120ms ease-out both}
::view-transition-new(travel-heading),::view-transition-new(travel-content){animation:travel-content-in 220ms var(--travel-motion-ease) both}
::view-transition-old(travel-overlay){animation:travel-fade-out 160ms ease-out both}
::view-transition-new(travel-overlay){animation:travel-fade-in 220ms ease-out both}
::view-transition-old(travel-preview){animation:travel-fade-out 140ms ease-out both}
::view-transition-new(travel-preview){animation:travel-content-in 220ms var(--travel-motion-ease) both}
/* Older browsers still get a light entrance and immediate, usable dismissal. */
@supports not (view-transition-name:travel-dialog){
 .modal{animation:travel-dialog-in 220ms var(--travel-motion-ease)}
 .inner-confirmation{animation:travel-content-in 180ms var(--travel-motion-ease)}
}
@keyframes travel-fade-in{from{opacity:0}to{opacity:1}}
@keyframes travel-fade-out{from{opacity:1}to{opacity:0}}
@keyframes travel-dialog-in{from{opacity:0;transform:translateY(var(--travel-dialog-offset))}to{opacity:1;transform:none}}
@keyframes travel-dialog-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(12px)}}
@keyframes travel-content-in{from{opacity:.45;transform:translateY(6px)}to{opacity:1;transform:none}}
@media(max-width:600px){:root{--travel-dialog-offset:24px}}
@media(prefers-reduced-motion:reduce){
 .modal,.inner-confirmation{animation:none!important}
 ::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}
}
`;
