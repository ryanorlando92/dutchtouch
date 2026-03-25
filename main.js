import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';

let store;

async function loadSavedSettings() {
    try {
        store = await load('settings.json');
        
        const osUser = await invoke('get_os_username');

        const savedLocation = await store.get('location');
        if (savedLocation) document.getElementById('location').value = savedLocation;

        const savedPin = await store.get('pin');
        if (savedPin) document.getElementById('managerPin').value = savedPin;

        const savedUsername = await store.get('username');
        if (savedUsername) document.getElementById('username').value = savedUsername;

        const savedEncryptedPassword = await store.get('password');
        if (savedEncryptedPassword) {
            const decrypted = await SecureStore.decrypt(savedEncryptedPassword, osUser);
            document.getElementById('password').value = decrypted;
        }
    } catch (error) {
        console.error("Failed to load settings:", error);
    }
}

loadSavedSettings();

const SecureStore = {
    // Converts the OS username into a valid cryptographic key
    async getKey(usernameSeed) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(usernameSeed), { name: "PBKDF2" }, false, ["deriveKey"]
        );
        return await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: enc.encode("dutch_touch_salt"), iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
    },

    async encrypt(plainText, usernameSeed) {
        if (!plainText) return "";
        const key = await this.getKey(usernameSeed);
        const iv = crypto.getRandomValues(new Uint8Array(12)); // Random initialization vector
        const enc = new TextEncoder();
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plainText));
        
        // Package the IV and encrypted data together into a Base64 string to save in JSON
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    },

    async decrypt(cipherText, usernameSeed) {
        if (!cipherText) return "";
        try {
            const key = await this.getKey(usernameSeed);
            const combined = new Uint8Array(atob(cipherText).split('').map(c => c.charCodeAt(0)));
            const iv = combined.slice(0, 12);
            const data = combined.slice(12);
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.warn("Could not decrypt password. Username may have changed.");
            return ""; 
        }
    }
};

document.getElementById('launchBtn').addEventListener('click', async () => {
    const pin = document.getElementById('managerPin').value;
    
    if (!pin.match(/^\d{4,6}$/)) {
        alert("Please enter a valid 4 to 6 digit numerical PIN.");
        return;
    }

    try {
        const osUser = await invoke('get_os_username');
        const rawPassword = document.getElementById('password').value;
        const encryptedPassword = await SecureStore.encrypt(rawPassword, osUser);

        await store.set('location', document.getElementById('location').value);
        await store.set('pin', document.getElementById('managerPin').value);
        await store.set('username', document.getElementById('username').value);
        await store.set('password', encryptedPassword);
        
        await store.save(); 
        console.log("Settings safely encrypted and saved.");
    } catch (saveError) {
        console.error("Failed to save settings:", saveError);
    }

    console.log("Attempting to spawn Dutchie window...");

    const dutchieWin = new WebviewWindow('dutchie', {
        url: 'https://verano.pos.dutchie.com/guestlist',
        title: 'Dutchie POS - DutchTouch Link',
        width: 1200,
        height: 800
    });

    dutchieWin.once('tauri://created', async () => {
        console.log("Window created successfully");

        const registerHotkeys = async () => {
            try {
                await register('Alt+B', async () => {
                    const payload = `
                        (function(){
                            const el = Array.from(document.querySelectorAll('input,textarea')).find(i => i.placeholder === 'Find guest...');
                            if(el) { el.focus(); } else { alert('Field not found'); }
                        })();
                    `;
                    await invoke('inject_dutchie_js', { script: payload });
                });

                await register('Alt+C', async () => {

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
                    await invoke('inject_dutchie_js', { script: payload });
                });

                await register('Alt+M', async () => {
                    const payload = `
                        (function(){
                            const card = document.querySelector("div[class^='OrderKanbanCard']");
                            if(card) { card.click(); }
                        })();
                    `;
                    await invoke('inject_dutchie_js', { script: payload });
                });

                await register('Alt+Space', async () => {
                    const payload = `
                        (function(){
                        const f = (t) => {
                        const e = Array.from(document.querySelectorAll('button,span,div')).find(b => b.innerText && b.innerText.trim() === t);
                        if(e) e.click();
                        return e;
                            };
                        if(f('Release')) { setTimeout(() => f('Confirm'), 100); }
                        })();
                    `;
                    await invoke('inject_dutchie_js', { script: payload });
                });

                await register('Alt+Q', async () => {
                    const payload = `
                        (function(){
                            const el = document.querySelector("[data-testid='navigation-sidebar-logo-link']");
                            if(el){
                                const target = el.closest('div') || el.closest('a') || el;
                                target.click();
                            }
                        })();
                    `;
                    await invoke('inject_dutchie_js', { script: payload });
                });

                await register('Alt+R', async () => {
                    const payload = `
                        (async function(){
                            const f = (s) => document.querySelector(s);
                            const anchor = f("[data-testid='guest-card_overflow_menu_anchor']");
                            if (anchor) {
                                anchor.click();
                                await new Promise(r => setTimeout(r, 100));
                                const release = f("[data-testid='guest-card_overflow_menu_menu-option_Release']");
                                if (release) {
                                    release.click();
                                    await new Promise(r => setTimeout(r, 100));
                                    const confirm = f("[data-testid='confirmation-popup_confirm-button_confirm']");
                                    if (confirm) confirm.click();
                                }
                            }
                        })();
                    `;
                    await invoke('inject_dutchie_js', { script: payload });
                });

                await register('Alt+I', async () => {
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

                console.log("Hotkeys registered (Window focused)");
            } catch (error) {
                console.error("Failed to register hotkeys:", error);
            }
        };

        const releaseHotkeys = async () => {
            try {
                await unregisterAll();
                console.log("Hotkeys released")
            } catch (error) {
                console.error("Failed to release hotkeys to OS:", error);
            }
        };

        await registerHotkeys();

        dutchieWin.onFocusChanged(async ({ payload: isFocused }) => {
            if (isFocused) {
                await registerHotkeys();
            } else {
                await releaseHotkeys();
            }
        });

        dutchieWin.onCloseRequested(async () => {
            await releaseHotkeys();
        });
    });
});