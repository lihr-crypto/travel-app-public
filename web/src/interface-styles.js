// Web-only visual rules. Native components retain their native styles and gestures.
export const interfaceStyles = `
:root{--bg:#F3F5F0;--surface:#FFFEFB;--text:#22342C;--muted:#647168;--border:#E2E7DF;--quiet:#F3F5F0;--line:#E8EBE5;--tint:#E8F1EC}
body{font-synthesis:none}button,summary,a,input,select,textarea{touch-action:manipulation}
button,summary,a{transition:background-color .16s ease-out,color .16s ease-out}
button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--green);outline-offset:3px}
.button{min-height:46px;border-radius:12px;font-size:15px;font-weight:600;padding:12px 18px;box-shadow:none}
.button-soft{background:var(--quiet);color:var(--text)}
.button-ghost{background:transparent;border:1px solid var(--border);color:var(--muted)}
.text-button{font-size:14px;font-weight:500}.icon-button{min-width:44px}
.button-soft:hover,.button-ghost:hover{background:var(--tint)}
.modal-layer{background:#172E2547;backdrop-filter:none}
.modal{background:var(--surface);border-radius:22px;box-shadow:0 16px 56px #172E2524}
.modal-header{padding:12px 20px 8px;border-bottom:0;min-height:64px}
.modal .modal-header{padding-left:24px;padding-right:24px}
.modal-header h2{font-size:18px;font-weight:600;letter-spacing:-.3px;line-height:1.4;min-width:0;overflow-wrap:anywhere}
.modal-header .icon-button{width:44px;height:44px;color:var(--muted);font-size:24px}
.modal-content{padding:12px 24px 24px;scroll-padding-block:16px}
.modal-footer{flex-shrink:0;background:var(--surface);border-top:1px solid var(--line);padding:12px 24px calc(12px + var(--safe-bottom))}
.modal label{color:var(--muted);font-size:13px;font-weight:400;line-height:20px}
.modal input:not([type=radio]):not([type=checkbox]),.modal select,.modal textarea{background:var(--quiet);border-color:transparent;border-radius:10px;min-height:48px;padding:12px 14px;color:var(--text);font-size:16px}
.modal input::placeholder,.modal textarea::placeholder{color:var(--muted)}
.modal input:focus,.modal select:focus,.modal textarea:focus{border-color:var(--green);box-shadow:none}
.modal input[type=radio]{accent-color:var(--green)}
.modal p{overflow-wrap:anywhere}
.management-form{gap:24px}.management-form>.field-grid{gap:12px}
.form-save{display:grid;grid-template-columns:76px minmax(0,1fr);gap:16px;border-top:0;padding:12px 0;background:var(--surface);margin-top:0}
.form-save .button{min-width:0}
.form-save .button-ghost{border:0;background:transparent;color:var(--muted);font-weight:500}
.form-section,.modal-content>.form-section{border:0;border-radius:0;background:transparent;padding:0;margin:0 0 28px}
.form-section>h3{font-size:15px;line-height:22px;font-weight:600;margin-bottom:14px}
.form-section p{font-size:14px;line-height:1.65}.form-section label+label{margin-top:16px}
.form-section form+.subtle{margin-top:12px;margin-bottom:0}
.form-section>.cloud-status{margin-right:12px}
.region-field .field-label{font-size:13px;font-weight:400;color:var(--muted);line-height:20px;margin-bottom:8px}
.region-options{padding:4px;border:0;border-radius:12px;background:var(--quiet);gap:4px}
.region-option{background:transparent;border:0;min-height:48px;border-radius:9px;padding:12px;text-align:center;color:var(--muted)}
.region-option strong{font-size:14px;font-weight:500;margin:0}
.region-option.active{background:var(--surface);color:var(--green)}
.region-option.active strong{font-weight:500}
.menu-list button{min-height:58px;padding:16px 0;border-color:var(--line);font-size:15px;line-height:22px;font-weight:500;gap:12px}
.menu-list button>span:last-child{color:var(--muted)}
.menu-list button:hover{color:var(--green)}
.day-choices{gap:4px;margin-inline:-16px}.day-choices button{display:grid;grid-template-columns:64px minmax(0,1fr) auto;align-items:center;text-align:left;border:0;border-bottom:1px solid var(--line);border-radius:0;min-height:60px;padding:14px 16px;gap:12px}
.day-choices button strong{font-size:15px;font-weight:500}.day-choices button>span{font-size:14px;color:var(--muted)}
.day-choices button.active{background:var(--tint);border-color:transparent;border-radius:10px;color:var(--green)}
.day-choices button:has(+button.active){border-bottom-color:transparent}
.day-choices button>span:last-child:not(:nth-child(2)){margin-left:auto;color:var(--green);font-size:12px}
.strategy-options{gap:8px;margin-inline:-16px}.radio-choice{padding:12px 16px;border:0;background:transparent;border-radius:10px;gap:10px;min-height:56px;color:var(--text)!important;font-size:14px!important}
.radio-choice:has(input:checked){background:var(--tint)}.radio-choice small{margin-left:30px;font-size:13px;line-height:20px;color:var(--muted)}
.confirmation p,.inner-confirmation p{font-size:15px;line-height:1.75;color:var(--muted)}
.inner-confirmation{border-color:var(--border);background:var(--surface);padding:20px;border-radius:14px;box-shadow:0 -8px 24px #22342c0d}
.settings-disclosure{border-color:var(--line)}.settings-disclosure summary{min-height:60px;font-size:15px;font-weight:500}
.settings-disclosure[open]>summary{color:var(--green)}.disclosure-content{padding:4px 0 24px;font-size:14px;line-height:1.65}
.settings-status{gap:12px;font-size:13px}.file-choice{font-size:13px}.file-choice input{border:1px solid var(--border)!important;background:var(--quiet)}
.legacy-choice,.version-row,.recovery-list>div,.trash-list>div{border-color:var(--line)!important}
.cloud-status{background:var(--tint)!important;color:var(--green)!important;min-height:44px;padding:10px 12px!important;border-radius:10px!important;font-size:13px!important}
.version-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;min-height:52px;line-height:22px;font-size:14px;color:var(--text)!important;padding-inline:0!important;overflow-wrap:anywhere}
.modal .version-row>span{float:none;white-space:nowrap}
.recovery-list>div{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:12px;row-gap:4px}
.recovery-list strong{min-width:0;overflow-wrap:anywhere;font-size:14px;font-weight:500}
.recovery-list>div>small{grid-column:1;margin-top:0}
.recovery-list>div>.text-button{grid-column:2;grid-row:1 / span 2}
.legacy-choice>span{min-width:0}.legacy-choice strong,.trash-list strong{overflow-wrap:anywhere}
.form-section form{gap:18px!important}.form-section form label{gap:0!important}
.subpage-title{margin-bottom:18px;font-size:13px;color:var(--muted)}.subpage-title .text-button{font-size:14px}
.place-search{gap:10px}.place-search input{background:var(--quiet);border-color:transparent;border-radius:12px}
.place-search .button{min-height:48px;padding-inline:16px}
.search-results{margin-top:12px}.search-results:empty{display:none}.search-result{gap:12px;padding:16px 0;border-color:var(--line);align-items:center;min-height:76px}
.search-result>span:nth-child(2){min-width:0}.search-result strong{font-size:15px;font-weight:500;line-height:22px}.search-result small{font-size:13px;line-height:20px;color:var(--muted)}
.result-icon{padding:0;font-size:20px;color:var(--muted)}.result-icon .editor-icon{width:20px;height:20px}.search-result>span:last-child{color:var(--muted);font-size:22px}
.picker-map-action{margin-top:16px}.picker-map{border-radius:12px}.picked-info{padding-top:18px;gap:14px}
.empty-state{padding:36px 20px}.empty-state h3{font-size:17px;font-weight:500}.empty-state p{font-size:14px}.empty-icon{display:none}
.workspace-toolbar{top:calc(12px + var(--safe-top));left:16px;right:16px}
.glass-button{background:var(--surface);backdrop-filter:none;min-height:44px;padding:10px 16px;border-radius:14px;font-size:14px;font-weight:500;box-shadow:0 2px 12px #22342c12}
.workspace-toolbar>.icon-button{border-radius:50%;padding:0;width:44px}
.overview-heading{padding:4px 4px 8px;gap:12px}.overview-heading h1{font-size:24px;line-height:1.35;font-weight:600;letter-spacing:-.5px;min-width:0;overflow-wrap:anywhere}
.overview-dates{padding:0 4px 8px;font-size:13px;line-height:20px;color:var(--muted)}
.overview-tools{padding:4px 4px 16px;gap:12px;flex-wrap:wrap}.overview-tools .button{font-size:14px;min-height:44px;padding:10px 14px}.overview-tools .text-button{font-size:14px}
.day-card{padding:18px 4px;border-color:var(--line);gap:14px;min-height:80px}
.day-badge{display:none}
.day-card strong{font-size:16px;font-weight:600}.day-card strong small{font-size:13px;font-weight:400;color:var(--muted)}
.day-card p{font-size:13px;line-height:20px;margin-top:6px;color:var(--muted)}.day-card>span:last-child{font-size:22px;color:var(--muted)}
.day-header{padding:0 0 8px;gap:8px}.day-header>button:not(.day-title){font-size:26px;min-width:44px;color:var(--muted)}
.day-title{gap:4px}.day-title strong{font-size:22px;font-weight:600}.day-title>span{font-size:13px;line-height:20px}
.day-tools{padding:0 4px 4px}.day-tools .text-button{font-size:14px}
.sheet-bottom-links{padding:20px 4px calc(12px + var(--safe-bottom));border-top:0;margin-top:12px;gap:12px}.sheet-bottom-links .text-button{color:var(--muted);font-size:13px}
.trip-workspace [data-testid=day-timeline]{padding:0 4px}
.trip-workspace [data-testid^=timeline-row-]{border-color:var(--line);padding:16px 0;min-height:76px}
/* Paint outside the measured row so the time column and drag geometry stay put. */
.trip-workspace [data-testid^=timeline-row-][aria-selected=true]{background-color:transparent;isolation:isolate;overflow:visible;border-bottom-color:transparent}
.trip-workspace [data-testid^=timeline-row-][aria-selected=true]::before{content:'';position:absolute;inset:0 -16px;border-radius:10px;background:#E7EFF0;z-index:-1;pointer-events:none}
.trip-workspace [data-testid^=timeline-row-]:has(+[data-testid^=timeline-row-][aria-selected=true]){border-bottom-color:transparent}
.trip-workspace [data-testid^=timeline-item-]>:first-child{min-width:56px;width:56px;color:var(--muted);font-size:13px;line-height:22px}
.trip-workspace [data-testid^=timeline-secondary-]{font-size:13px;line-height:20px;color:var(--muted)}
.trip-workspace [data-testid^=timeline-item-]>div:nth-child(2)>:first-child{font-size:16px;font-weight:600;line-height:23px}
.trip-workspace [data-testid^=timeline-actions-]{min-width:44px;min-height:44px}
.itinerary-row{margin:0 4px;padding:12px 0;border-color:var(--line);border-radius:10px;min-height:76px}.itinerary-row.selected{background:var(--tint)}
.row-main{gap:12px;padding:6px 0}.row-time{min-width:56px;font-size:13px;line-height:23px;color:var(--muted);font-variant-numeric:tabular-nums}
.row-body strong{font-size:16px;font-weight:600;line-height:23px}.row-body small{display:flex;align-items:center;gap:6px;font-size:13px;line-height:20px;margin-top:3px;color:var(--muted)}
.row-body small .editor-icon{width:15px;height:15px}.row-body small>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.row-note{font-size:13px;line-height:20px}.itinerary-row .icon-button{width:44px;min-width:44px;color:var(--muted)}
.history-items{padding:20px 4px}.history-items h3{font-size:15px;font-weight:500}
.place-occurrences>div{padding:16px 0;border-color:var(--line)}.place-occurrences strong{font-size:17px;font-weight:600}.place-occurrences small{font-size:13px;line-height:20px;color:var(--muted)}
.home-native [data-testid=home-trip-list-sheet]{gap:14px}
.home-native [data-testid=home-trip-list-sheet]>div:first-child>:first-child{font-size:22px;font-weight:600;letter-spacing:-.5px;line-height:30px;color:var(--text)}
.home-native [data-testid=home-trip-list-count]{font-size:13px;color:var(--muted);font-weight:400}
.home-native [data-testid=home-create-trip]{min-width:44px;min-height:44px;border-radius:22px;background:var(--green)}
.home-native [data-testid=home-trip-list-sheet]:has([data-testid=home-trip-list-first-use]) [data-testid=home-create-trip]{align-self:center}
.home-native [data-testid=home-trip-filter]{align-self:stretch;border:0;border-radius:0;background:transparent;box-shadow:none;padding:0;gap:28px;justify-content:flex-start}
.home-native [data-testid=home-trip-filter]>[role=tab]{position:relative;border-radius:0;padding:10px 0;min-height:44px;background:transparent;justify-content:center}
.home-native [data-testid=home-trip-filter]>[role=tab]>div{font-size:14px;font-weight:500;line-height:22px;color:var(--muted)}
.home-native [data-testid=home-trip-filter]>[aria-selected=true]>div{font-weight:500;color:var(--green)}
.home-native [data-testid=home-trip-filter]>[aria-selected=true]:after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;border-radius:2px;background:var(--green)}
/* Year refinement and recap: a quieter tier under the lifecycle tabs, text only and no underline. */
.home-native [data-testid=home-year-filter]{align-self:stretch;gap:0 22px;margin-top:-6px}
.home-native [data-testid=home-year-filter]>[role=tab]{min-height:36px;background:transparent}
.home-native [data-testid=home-year-filter]>[role=tab]>div{font-size:13px;font-weight:500;line-height:20px;color:var(--muted)}
.home-native [data-testid=home-year-filter]>[aria-selected=true]>div{font-weight:600;color:var(--green)}
.home-native [data-testid=home-recap]{gap:2px 18px}
.home-native [data-testid^=home-recap-]{font-size:13px;line-height:22px;color:var(--muted)}
.home-native [data-testid^=home-recap-]>:first-child{font-size:16px;font-weight:600;color:var(--text)}
.home-native [data-testid^=home-trip-row-]{padding:12px 0;min-height:76px}
.home-native [data-testid^=home-trip-row-]>div>:first-child{font-size:17px;font-weight:600;line-height:24px;color:var(--text)}
.home-native [data-testid^=home-trip-row-]>div>:nth-child(2){font-size:13px;line-height:20px;color:var(--muted);margin-top:5px;white-space:pre-line;-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical}
.home-native [data-testid^=home-trip-manage-]{min-width:44px;min-height:44px}
.home-native [data-testid=home-active-trip-card],.home-native [data-testid=home-trip-preview]{background:var(--surface);border:0;border-radius:16px;box-shadow:0 4px 20px #22342c14;padding:16px}
.home-native [data-testid=home-active-trip-title]{font-size:17px;font-weight:600;line-height:24px}
.home-native [data-testid=home-trip-preview-heading]{font-size:18px;font-weight:600;line-height:25px}
.home-native [data-testid=home-trip-preview-close]{min-width:44px;min-height:44px;align-items:center;justify-content:center}
.home-native [data-testid=home-active-trip-continue]{min-height:44px;justify-content:space-between}
.home-native [data-testid=home-trip-preview-enter]{min-height:46px;border-radius:12px}
.notice{border-radius:12px;box-shadow:0 4px 16px #22342c1a;font-size:14px}.update-pill{background:var(--surface);color:var(--green);border:1px solid var(--border);font-size:13px;box-shadow:0 2px 12px #22342c12}
/* Separators belong between peer rows, not around the end of a list. Keep
   the native border width so selection and drag measurements do not change. */
.trip-workspace [data-testid^=timeline-row-]:not(:has(~ [data-testid^=timeline-row-], ~ [data-testid^=timeline-drag-slot-])),
.home-native div:has(>[data-testid^=home-trip-row-]):last-child,
.day-card:not(:has(+.day-card)),.itinerary-row:not(:has(+.itinerary-row)),
.day-choices button:last-child,.search-result:last-child,
.version-row:not(:has(+.version-row)),.legacy-choice:not(:has(+.legacy-choice)),
.recovery-list>div:last-child,.trash-list>div:last-child,.place-occurrences>div:last-child,
.settings-disclosure:last-of-type{border-bottom-color:transparent!important}
/* The accepted editor keeps its title-sized input and dedicated control styling. */
.modal.item-editor-modal .editor-name input{background:transparent;border-radius:0;border-color:var(--editor-line);padding:0 0 10px;min-height:42px;font-size:24px!important}
.item-editor-modal .editor-note textarea{min-height:90px;background:var(--editor-quiet);padding:12px 14px}
.item-editor-modal .editor-section .time-row input{min-height:44px;padding:10px 8px;border-radius:8px}
@media(max-width:600px){.modal{border-radius:22px 22px 0 0}.modal-content{padding:12px 24px 24px}.modal-header{padding:12px 20px 8px}.form-save{bottom:-24px;padding-bottom:calc(12px + var(--safe-bottom))}.form-save .button{min-width:0;flex:1}.form-save .button-ghost{flex:.6}.day-card strong small{display:inline;margin-left:8px}.day-card{padding:16px 4px}.modal-layer{backdrop-filter:none}.item-editor-modal .modal-content{padding:8px 24px 24px}}
@media(max-width:350px){.modal-content{padding-inline:20px}.modal .modal-header{padding-left:20px;padding-right:20px}.field-grid{gap:8px}.modal-header h2{font-size:17px}.region-option{padding:10px 6px}.region-option strong{font-size:13px}.day-card strong small{display:block;margin-left:0}.item-editor-modal .modal-content{padding-inline:20px}}
.app-shell.session-required{display:flex;flex-direction:column}
.app-shell.session-required>.home-native,.app-shell.session-required>.trip-workspace{flex:1;min-height:0;height:auto}
.session-recovery{position:relative;order:-1;flex-shrink:0;align-self:center;width:calc(100% - 32px);z-index:950;max-width:560px;margin:calc(12px + var(--safe-top)) 16px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 4px 20px #22342c14}
.session-recovery strong{font-size:15px;font-weight:600;line-height:22px}.session-recovery p{font-size:13px;line-height:20px;color:var(--muted);margin-top:3px}
.session-recovery .button{min-width:88px;flex-shrink:0;font-size:14px;padding:10px 12px}

.map-candidate{position:absolute;left:12px;right:12px;bottom:calc(16px + var(--safe-bottom));z-index:30;display:grid;grid-template-columns:minmax(0,1fr);gap:10px;max-width:560px;margin-inline:auto;padding:14px 14px 12px 16px;background:#fff;border-radius:18px;box-shadow:0 8px 28px #22342c26,0 0 0 1px #22342c0f}
.map-candidate-head{display:flex;align-items:flex-start;gap:8px;min-width:0}.map-candidate-text{flex:1;min-width:0}
.map-candidate-text strong{display:block;font-size:16px;font-weight:600;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.map-candidate-text small{display:block;font-size:13px;line-height:18px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.map-candidate-close{flex:none;display:grid;place-items:center;width:32px;height:32px;margin:-4px -4px 0 0;border-radius:50%;background:var(--quiet);color:var(--muted);font-size:20px;line-height:1}
.map-candidate-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.map-candidate-target{display:flex;align-items:center;gap:6px;min-width:0;font-size:14px;color:var(--muted);white-space:nowrap}.map-candidate-target>span{flex:none}.map-candidate-target b{color:var(--text);font-weight:600}
.map-candidate-target select{appearance:none;-webkit-appearance:none;width:auto;margin:0;flex:0 1 auto;min-width:0;min-height:36px;max-width:190px;padding:0 28px 0 12px;border:0;border-radius:10px;background:var(--quiet) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23647168' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 11px center;color:var(--text);font-size:16px;font-weight:600}
.map-candidate-add{flex:none;min-height:40px;padding:8px 24px;border-radius:12px;font-size:15px}
.map-search{position:absolute;z-index:9;top:calc(66px + var(--safe-top));left:16px;right:16px;max-width:560px;margin-inline:auto}
.map-search-field{display:flex;align-items:center;gap:4px;min-height:48px;padding:4px 4px 4px 14px;background:#fff;border-radius:14px;box-shadow:0 1px 3px #00000026,0 0 0 1px #0000000f}
.map-search-field input{flex:1;width:auto;min-width:0;height:40px;min-height:40px;margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;font-size:16px;line-height:24px;outline:none;-webkit-appearance:none;appearance:none}.map-search-field input:focus{border:0;box-shadow:none}
.map-search-field input::-webkit-search-cancel-button{display:none}
.map-search-clear{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;color:var(--muted);font-size:20px;line-height:1}
.map-search-go{flex:none;min-height:40px;padding:0 14px;border-radius:10px;background:var(--tint);color:var(--green);font-size:14px;font-weight:600}
.map-search-go:disabled{background:transparent;color:var(--muted);opacity:.7}
.map-search-results{margin-top:8px;max-height:40vh;overflow-y:auto;padding:4px 0;background:#fff;border-radius:14px;box-shadow:0 8px 28px #22342c26,0 0 0 1px #22342c0f}
.map-search-result{display:grid;gap:2px;width:100%;padding:12px 16px;text-align:left;border-bottom:1px solid var(--line);background:transparent}.map-search-result:last-of-type{border-bottom:0}
.map-search-result strong{font-size:15px;font-weight:600;line-height:21px;overflow-wrap:anywhere}.map-search-result small{font-size:13px;line-height:18px;color:var(--muted);overflow-wrap:anywhere}
.map-search-note{padding:14px 16px;font-size:14px;color:var(--muted)}
.map-search-results .provider-attribution{padding:8px 16px 10px;font-size:11px;color:var(--muted)}

@media(prefers-reduced-motion:reduce){button,summary,a{transition:none}}
`;
