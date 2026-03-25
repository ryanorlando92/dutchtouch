import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { register } from '@tauri-apps/plugin-global-shortcut';
import { invoke } from '@tauri-apps/api/core';

document.getElementById('launchBtn').addEventListener('click', async () => {
    const pin = document.getElementById('managerPin').value;
    
    // Basic validation
    if (!pin.match(/^\d{4,6}$/)) {
        alert("Please enter a valid 4 to 6 digit numerical PIN.");
        return;
    }

    // 1. Create the new Dutchie Window
    const dutchieWin = new WebviewWindow('dutchie', {
        url: 'https://verano.pos.dutchie.com/guestlist',
        title: 'Dutchie POS - DutchTouch Link',
        width: 1200,
        height: 800
    });

    // Wait for the window to successfully spin up
    dutchieWin.once('tauri://created', async () => {
        console.log("Window created, registering hotkeys...");

        try {
            await register('Alt+B', async () => {
                const payload = `
                    (function(){
                        const el = Array.from(document.querySelectorAll('input,textarea')).find(i => i.placeholder === 'Find guest...');
                        if(el) { el.focus(); } else { alert('Field not found'); }
                    })();
                `;
            });

            await register('Alt+C', async () => {
                // The exact JS payload from your AHK script
                const payload = `
                    (async function(){
                        const f = (t) => Array.from(document.querySelectorAll('button,span,div')).find(i => i.innerText && i.innerText.trim() === t && i.offsetParent !== null);
                        const btn1 = f('Cancel'); 
                        if(btn1) { (btn1.closest('button') || btn1).click(); }
                        
                        await new Promise(r => setTimeout(r, 100));
                        
                        const btn2 = f('Close'); 
                        if(btn2) { (btn2.closest('button') || btn2).click(); }
                    })();
                `;
                // Fire the Rust command to inject the payload
                await invoke('inject_dutchie_js', { script: payload });
            });

            await register('Alt+M', async () => {
                const payload = `
                    (function(){
                        const card = document.querySelector(``div[class^='OrderKanbanCard']``);
                        if(card) { card.click(); }
                    })();
                `;
            });

            await register('Alt+Space', async () => {
                const payload = `
                    (function(){
                    const f = (t) => {
                    const e = Array.from(document.querySelectorAll('button,span,div')).find(b => b.innerText.trim() === t);
                    if(e) e.click();
                    return e;
                        };
                    if(f('Release')) { setTimeout(() => f('Confirm'), 100); }
                    })();
                `;
            });

            await register('Alt+Q', async () => {
                const payload = `
                    (function(){
                        const el = document.querySelector(``[data-testid='navigation-sidebar-logo-link']``);
                        if(el){
                            const target = el.closest('div') || el.closest('a') || el;
                            target.click();
                        }
                    })();
                `;
            });

            await register('Alt+R', async () => {
                const payload = `
                    (async function(){
                        const f = (s) => document.querySelector(s);
                        const anchor = f(``[data-testid='guest-card_overflow_menu_anchor']``);
                        if (anchor) {
                            anchor.click();
                            await new Promise(r => setTimeout(r, 100));
                            const release = f(``[data-testid='guest-card_overflow_menu_menu-option_Release']``);
                            if (release) {
                                release.click();
                                await new Promise(r => setTimeout(r, 100));
                                const confirm = f(``[data-testid='confirmation-popup_confirm-button_confirm']``);
                                if (confirm) confirm.click();
                            }
                        }
                    })();
                `;
            });

            await register('Alt+I', async () => {
                // We dynamically insert the `pin` variable captured from the form into the script
                const payload = `
                    (function(){
                        const sV = (e,v) => {
                            const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                            s.call(e, v);
                            e.dispatchEvent(new Event('input', {bubbles:true}));
                        };
                        const fE = (t,x) => Array.from(document.querySelectorAll(t)).find(e => e.innerText?.trim() === x || e.placeholder === x || e.name === x || e.getAttribute('aria-label') === x);
                        
                        const bA = fE('button,span,div', 'Add items');
                        if(bA) {
                            bA.click();
                            setTimeout(() => {
                                const pF = fE('input', 'Manager PIN');
                                if(pF) {
                                    sV(pF, '${pin}'); // PIN is injected securely here
                                    setTimeout(() => {
                                        const bC = fE('button,span,div', 'Continue');
                                        if(bC) bC.click();
                                    }, 250);
                                }
                            }, 250);
                        }
                    })();
                `;
                await invoke('inject_dutchie_js', { script: payload });
            });

        } catch (error) {
            console.error("Failed to register shortcuts:", error);
        }
    });
});