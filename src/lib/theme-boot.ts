/*
 * The theme lives in the synced preferences, which arrive only after the server answers.
 * The last theme shown is also kept in this browser, and a tiny script in <head> applies it before the
 * first paint, so a light-theme user no longer sees the dark default flash first.
 */
export const themeStorageKey = 'woong-hub:theme';

const themeColors = { dark: '#1b1512', light: '#eee6da' } as const;

export function rememberTheme(theme: string) {
  try { localStorage.setItem(themeStorageKey, theme); } catch { /* storage unavailable: the next load waits for sync as before */ }
}

export const themeBootScript = `try{var t=localStorage.getItem(${JSON.stringify(themeStorageKey)});if(t==='light'||t==='dark'){var d=document.documentElement;d.dataset.theme=t;var c=${JSON.stringify(themeColors)}[t],m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',c);}}catch(e){}`;
