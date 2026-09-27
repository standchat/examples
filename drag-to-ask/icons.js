// Molehill's pixel icons, drawn from 16×16 text maps. One letter is one pixel;
// "." is transparent. The same map makes a 16 px title-bar icon and a 48 px
// desktop icon, and stays crisp because every pixel is a rectangle.

const PALETTE = {
  k: '#151515', // outline
  w: '#FFFFFF',
  p: '#FDFDF8', // paper
  g: '#E4E5DE',
  G: '#A9ABA1',
  K: '#2A2C35', // screen
  o: '#F54E00', // orange
  O: '#FF8A4C',
  y: '#F7A501', // yellow
  Y: '#C98300',
  b: '#1D4AFF', // blue
  B: '#8FA4FF',
  r: '#E03E3E', // red
  R: '#FF8C8C',
  e: '#2F9E44', // green
  E: '#8AD49A',
  n: '#8A5A3B', // soil
  N: '#5E3A22',
};

const MAPS = {
  analytics: [
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kwwwwwwwwwwwwkG',
    '.kwwwwwwwwwwkwkG',
    '.kwwwwwwwyykkkkG',
    '.kwwwwwwwyywkwkG',
    '.kwwwwoowyywwwkG',
    '.kwwwwoowyywwwkG',
    '.kwwwwoowyywwwkG',
    '.kwbbwoowyywwwkG',
    '.kwbbwoowyywwwkG',
    '.kwbbwoowyywwwkG',
    '.kwkkkkkkkkkwwkG',
    '.kwwwwwwwwwwwwkG',
    '.kkkkkkkkkkkkkkG',
    '..GGGGGGGGGGGGGG',
  ],
  replay: [
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kyyyyyyyyykrkkG',
    '.kkkkkkkkkkkkkkG',
    '.kKKKKKKKKKKKKkG',
    '.kKKKKwKKKKKKKkG',
    '.kKKKKwwKKKKKKkG',
    '.kKKKKwwwKKKKKkG',
    '.kKKKKwwwwKKKKkG',
    '.kKKKKwwwKKKKKkG',
    '.kKKKKwwKKKKKKkG',
    '.kKKKKwKKKKKKKkG',
    '.kKKKKKKKKKKKKkG',
    '.kooooorrGGGGGkG',
    '.kkkkkkkkkkkkkkG',
    '..GGGGGGGGGGGGGG',
  ],
  flags: [
    '................',
    '..kk............',
    '..kkkkkkkk.kkk..',
    '..kkrrrrrrkkrrk.',
    '..kkrRRrrrrrrrk.',
    '..kkrRrrrrrrrrk.',
    '..kkrrrrrrrrrrk.',
    '..kkrrrkkkrrrrk.',
    '..kkkkk...kkkkk.',
    '..kk............',
    '..kk............',
    '..kk............',
    '..kk............',
    '.kkkk...........',
    'kkkkkk..........',
    '................',
  ],
  experiments: [
    '................',
    '.....kkkkkk.....',
    '.....kwwwwk.....',
    '......kwwk......',
    '......kwwk......',
    '......kwwk......',
    '.....kwwwwk.....',
    '....kwwwwwwk....',
    '...kwwwwwwwwk...',
    '...keeeeeeeek...',
    '..keewEeeeeeek..',
    '..keeeeeeweeek..',
    '.keEeeeeeeeeeek.',
    '.keeeeeeeeeeeek.',
    '.kkkkkkkkkkkkkk.',
    '................',
  ],
  surveys: [
    '................',
    '......kkkk......',
    '..kkkkkyykkkkk..',
    '..knnkkkkkknnkG.',
    '..knwwwwwwwwnkG.',
    '..knkkkwwwwwnkG.',
    '..knkekwkkkwnkG.',
    '..knkkkwwwwwnkG.',
    '..knwwwwwwwwnkG.',
    '..knkkkwwwwwnkG.',
    '..knkwkwkkkwnkG.',
    '..knkkkwwwwwnkG.',
    '..knwwwwwwwwnkG.',
    '..knnnnnnnnnnkG.',
    '..kkkkkkkkkkkkG.',
    '...GGGGGGGGGGGG.',
  ],
  warehouse: [
    '................',
    '....kkkkkkkk....',
    '..kkyyyyyyyykk..',
    '.kyyyyyyyyyyyyk.',
    '.kkyyyyyyyyyykk.',
    '.kYkkkkkkkkkkYk.',
    '.kYyyyyyyyyyyYk.',
    '.kkYyyyyyyyyYkk.',
    '.kYkkkkkkkkkkYk.',
    '.kYyyyyyyyyyyYk.',
    '.kkYyyyyyyyyYkk.',
    '.kYkkkkkkkkkkYk.',
    '.kYyyyyyyyyyyYk.',
    '..kkYyyyyyyYkk..',
    '....kkkkkkkk....',
    '................',
  ],
  sheet: [
    '................',
    '..kkkkkkkkk.....',
    '..kwwwwwwwkk....',
    '..kwwwwwwwkwk...',
    '..kwwwwwwwkkkk..',
    '..keeeeeeeeeekG.',
    '..kwwwGwwwGwwkG.',
    '..kwwwGwwwGwwkG.',
    '..kGGGGGGGGGGkG.',
    '..kwwwGwwwGwwkG.',
    '..kwwwGwwwGwwkG.',
    '..kGGGGGGGGGGkG.',
    '..kwwwGwwwGwwkG.',
    '..kwwwGwwwGwwkG.',
    '..kkkkkkkkkkkkG.',
    '...GGGGGGGGGGGG.',
  ],
  txt: [
    '................',
    '..kkkkkkkkk.....',
    '..kwwwwwwwkk....',
    '..kwwwwwwwkwk...',
    '..kwoGGGGwkkkk..',
    '..kwwwwwwwwwwkG.',
    '..kwoGGGGGGwwkG.',
    '..kwwwwwwwwwwkG.',
    '..kwoGGGGGwwwkG.',
    '..kwwwwwwwwwwkG.',
    '..kwoGGGGGGGwkG.',
    '..kwwwwwwwwwwkG.',
    '..kwoGGGGwwwwkG.',
    '..kwwwwwwwwwwkG.',
    '..kkkkkkkkkkkkG.',
    '...GGGGGGGGGGGG.',
  ],
  doc: [
    '................',
    '..kkkkkkkkk.....',
    '..kwwwwwwwkk....',
    '..kwwwwwwwkBk...',
    '..kwbbbbbwkkkk..',
    '..kwwwwwwwwwwkG.',
    '..kwGGGGGGGGwkG.',
    '..kwGGGGGGGGwkG.',
    '..kwGGGGGGwwwkG.',
    '..kwwwwwwwwwwkG.',
    '..kwGGGGGGGGwkG.',
    '..kwGGGGGGGGwkG.',
    '..kwGGGGwwwwwkG.',
    '..kbbbbbbbbbbkG.',
    '..kkkkkkkkkkkkG.',
    '...GGGGGGGGGGGG.',
  ],
  md: [
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kgggggggggggkkG',
    '.kkkkkkkkkkkkkkG',
    '.kKKKKKKKKKKKKkG',
    '.kKeKKKKKKKKKKkG',
    '.kKKeKKKKKKKKKkG',
    '.kKKKeKKKKKKKKkG',
    '.kKKeKKKKKKKKKkG',
    '.kKeKKKeeeeKKKkG',
    '.kKKKKKKKKKKKKkG',
    '.kKKKKKKKKKKKKkG',
    '.kKKKKKKKKKKKKkG',
    '.kKKKKKKKKKKKKkG',
    '.kkkkkkkkkkkkkkG',
    '..GGGGGGGGGGGGGG',
  ],
  chat: [
    '................',
    '...kkkkkkkkkk...',
    '..kyyyyyyyyyyk..',
    '.kyyyyyyyyyyyyk.',
    '.kyyyyyyyyyyyykG',
    '.kyyyyyyyyyyyykG',
    '.kyykkykkykkyykG',
    '.kyykkykkykkyykG',
    '.kyyyyyyyyyyyykG',
    '.kyyyyyyyyyyyykG',
    '..kyyyyyyyyyykGG',
    '...kkyykkkkkkGG.',
    '....kyykGGGGG...',
    '....kykG........',
    '....kkG.........',
    '................',
  ],
  trash: [
    '................',
    '......kkkk......',
    '..kkkkkggkkkkk..',
    '..kggggggggggkG.',
    '..kkkkkkkkkkkkG.',
    '...kgGggGggGgkG.',
    '...kgGggGggGgkG.',
    '...kgGggGggGgkG.',
    '...kgGggGggGgkG.',
    '...kgGggGggGgkG.',
    '...kgGggGggGgkG.',
    '...kgGggGggGgkG.',
    '...kgGggGggGgkG.',
    '...kkkkkkkkkkkG.',
    '....GGGGGGGGGGG.',
    '................',
  ],
  zip: [
    '................',
    '..kkkkkkkkk.....',
    '..kyyykyyykk....',
    '..kyyykyyykyk...',
    '..kyyyykyykkkk..',
    '..kyyykyyyyyykG.',
    '..kyyyykyyyyykG.',
    '..kyyykyyyyyykG.',
    '..kyyykkkyyyykG.',
    '..kyyykwkyyyykG.',
    '..kyyykkkyyyykG.',
    '..kyyyyyyyyyykG.',
    '..kyyyyyyyyyykG.',
    '..kyyyyyyyyyykG.',
    '..kkkkkkkkkkkkG.',
    '...GGGGGGGGGGGG.',
  ],
  file: [
    '................',
    '..kkkkkkkkk.....',
    '..kwwwwwwwkk....',
    '..kwwwwwwwkwk...',
    '..kwwwwwwwkkkk..',
    '..kwwwwwwwwwwkG.',
    '..kwGGGGGGGwwkG.',
    '..kwwwwwwwwwwkG.',
    '..kwGGGGGGwwwkG.',
    '..kwwwwwwwwwwkG.',
    '..kwGGGGGGGGwkG.',
    '..kwwwwwwwwwwkG.',
    '..kwwwwwwwwwwkG.',
    '..kwwwwwwwwwwkG.',
    '..kkkkkkkkkkkkG.',
    '...GGGGGGGGGGGG.',
  ],
  setup: [
    '................',
    '....kkkkkkkk....',
    '...knnnnnnnnk...',
    '..knnNnnnnNnnk..',
    '..knnnnnnnnnnk..',
    '.kkkkkkkkkkkkkk.',
    '.kyyyyyyyyyyyyk.',
    '.kyyyyykkyyyyyk.',
    '.kyyyyykkyyyyyk.',
    '.kYYYYYYYYYYYYk.',
    '.kyyyyyyyyyyyyk.',
    '.kyyyyyyyyyyyyk.',
    '.kyyyyyyyyyyyyk.',
    '.kYYYYYYYYYYYYk.',
    '.kkkkkkkkkkkkkk.',
    '................',
  ],
};

const cache = new Map();

/** An SVG string for an icon: one <path> per colour, one rectangle per run of pixels. */
export function iconSvg(name) {
  if (cache.has(name)) return cache.get(name);
  const map = MAPS[name] ?? MAPS.file;
  const runs = {};
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (PALETTE[ch]) (runs[ch] ??= []).push(`M${x} ${y}h${end - x}v1h${x - end}z`);
      x = end;
    }
  });
  const paths = Object.entries(runs).map(([ch, d]) => `<path fill="${PALETTE[ch]}" d="${d.join('')}"/>`).join('');
  const svg = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">${paths}</svg>`;
  cache.set(name, svg);
  return svg;
}

/** Fills every <i class="px" data-icon="…"> under root that hasn't been drawn yet. */
export function drawIcons(root = document) {
  for (const el of root.querySelectorAll('i.px[data-icon]:not([data-drawn])')) {
    el.innerHTML = iconSvg(el.dataset.icon);
    el.dataset.drawn = '';
  }
}

export function icon(name, className = '') {
  const el = document.createElement('i');
  el.className = `px ${className}`.trim();
  el.dataset.icon = name;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = iconSvg(name);
  el.dataset.drawn = '';
  return el;
}
