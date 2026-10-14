export const THEME_PRESETS = [
  { id: 'editorial', name: 'Editorial', accent: '#a74425' },
  { id: 'courtside', name: 'Courtside', accent: '#9a4b12' },
  { id: 'ocean', name: 'Blue hour', accent: '#24628c' },
  { id: 'forest', name: 'Field study', accent: '#30694d' },
  { id: 'monochrome', name: 'Monochrome', accent: '#5f5f5f' },
];

export function applyAlbumTheme(gallery, mode = 'light') {
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const preset = THEME_PRESETS.find(item => item.id === gallery?.themePreset) || THEME_PRESETS[0];
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  const color = /^#[\da-f]{6}$/i.test(gallery?.themeColor || '') ? gallery.themeColor : preset.accent;
  const palettes = {
    editorial: ['#f5f3ec', '#fcfaf5', '#191c18', '#232620', '#934023', '#ecb299'],
    courtside: ['#f6f1e8', '#fcf8f0', '#231b16', '#2c231d', '#89410f', '#e4b589'],
    ocean: ['#f0f4f5', '#f8fbfc', '#182129', '#202b34', '#24628c', '#9ccbe0'],
    forest: ['#f0f3ed', '#f8faf5', '#19221a', '#222d23', '#30694d', '#b4cfb1'],
    monochrome: ['#f3f3f0', '#fbfbf9', '#1c1c1b', '#282827', '#555555', '#cecec9'],
  };
  const palette = palettes[preset.id];
  root.style.setProperty('--bg', palette[dark ? 2 : 0]);
  root.style.setProperty('--surface', palette[dark ? 3 : 1]);
  // User accents decorate borders/swatches, never determine body/text contrast.
  root.style.setProperty('--album-accent', color);
  root.style.setProperty('--accent', palette[dark ? 5 : 4]);
  root.style.setProperty('--accent-ink', dark ? '#171713' : '#ffffff');
}
