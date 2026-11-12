/* Eigene Pixel-Schrift: 5 × 7 Raster pro Buchstabe, als SVG aus Quadraten.
   Nutzung: <span data-pixel>VALERIIA</span>
   Der echte Text bleibt für Screenreader und Suchmaschinen erhalten.
   Ohne JavaScript steht einfach der normale Text da. */
(function () {
  const G = {
    A: ['01110','10001','10001','11111','10001','10001','10001'],
    B: ['11110','10001','10001','11110','10001','10001','11110'],
    C: ['01110','10001','10000','10000','10000','10001','01110'],
    D: ['11110','10001','10001','10001','10001','10001','11110'],
    E: ['11111','10000','10000','11110','10000','10000','11111'],
    F: ['11111','10000','10000','11110','10000','10000','10000'],
    G: ['01110','10001','10000','10111','10001','10001','01111'],
    H: ['10001','10001','10001','11111','10001','10001','10001'],
    I: ['01110','00100','00100','00100','00100','00100','01110'],
    J: ['00111','00010','00010','00010','00010','10010','01100'],
    K: ['10001','10010','10100','11000','10100','10010','10001'],
    L: ['10000','10000','10000','10000','10000','10000','11111'],
    M: ['10001','11011','10101','10101','10001','10001','10001'],
    N: ['10001','10001','11001','10101','10011','10001','10001'],
    O: ['01110','10001','10001','10001','10001','10001','01110'],
    P: ['11110','10001','10001','11110','10000','10000','10000'],
    Q: ['01110','10001','10001','10001','10101','10010','01101'],
    R: ['11110','10001','10001','11110','10100','10010','10001'],
    S: ['01111','10000','10000','01110','00001','00001','11110'],
    T: ['11111','00100','00100','00100','00100','00100','00100'],
    U: ['10001','10001','10001','10001','10001','10001','01110'],
    V: ['10001','10001','10001','10001','10001','01010','00100'],
    W: ['10001','10001','10001','10101','10101','10101','01010'],
    X: ['10001','10001','01010','00100','01010','10001','10001'],
    Y: ['10001','10001','01010','00100','00100','00100','00100'],
    Z: ['11111','00001','00010','00100','01000','10000','11111'],
    '0': ['01110','10001','10011','10101','11001','10001','01110'],
    '1': ['00100','01100','00100','00100','00100','00100','01110'],
    '2': ['01110','10001','00001','00010','00100','01000','11111'],
    '3': ['11110','00001','00001','01110','00001','00001','11110'],
    '4': ['00010','00110','01010','10010','11111','00010','00010'],
    '5': ['11111','10000','11110','00001','00001','10001','01110'],
    '6': ['00110','01000','10000','11110','10001','10001','01110'],
    '7': ['11111','00001','00010','00100','01000','01000','01000'],
    '8': ['01110','10001','10001','01110','10001','10001','01110'],
    '9': ['01110','10001','10001','01111','00001','00010','01100'],
    '-': ['000','000','000','111','000','000','000'],
    ',': ['00','00','00','00','01','01','10'],
    '.': ['0','0','0','0','0','0','1'],
    '%': ['11001','11010','00010','00100','01000','01011','10011'],
    '+': ['00000','00100','00100','11111','00100','00100','00000'],
    ' ': ['000','000','000','000','000','000','000']
  };
  const NS = 'http://www.w3.org/2000/svg';

  // Liefert die gesetzten Rasterzellen eines Textes und seine Breite in Zellen
  function cellsFor(text) {
    const chars = text.toUpperCase().replace(/[–—]/g, '-').split('');
    let x = 0; const cells = [];
    chars.forEach((ch, n) => {
      const g = G[ch] || G[' '];
      g.forEach((row, y) => [...row].forEach((bit, cx) => {
        if (bit === '1') cells.push([x + cx, y]);
      }));
      x += g[0].length + (n < chars.length - 1 ? 1 : 0);
    });
    return { cells, width: x };
  }

  // opt.dots = n: jede Zelle als n × n kleine Punkte mit Lücken (Look wie „DESIGN + CODE + AI“ auf der Startseite)
  function svgFor(text, opt) {
    const { cells: rects, width: x } = cellsFor(text);
    const n = opt && opt.dots ? opt.dots : 0;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + x + ' 7');
    // Eigene Größe angeben: sonst setzt Safari für die Grafik 300 px Breite ein und verschiebt das Layout
    svg.setAttribute('width', x); svg.setAttribute('height', 7);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('shape-rendering', n ? 'geometricPrecision' : 'crispEdges');
    svg.classList.add('px');
    if (n) svg.classList.add('px-dots');
    const path = document.createElementNS(NS, 'path');
    let d;
    if (n) {
      const sub = 1 / n, dot = +(sub * 0.74).toFixed(3);   // Punkt füllt ¾ seines Feldes, der Rest ist Lücke
      d = rects.map(([a, b]) => {
        let s = '';
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += 'M' + (a + i * sub).toFixed(3) + ' ' + (b + j * sub).toFixed(3) + 'h' + dot + 'v' + dot + 'h-' + dot + 'z';
        return s;
      }).join('');
    } else d = rects.map(([a, b]) => 'M' + a + ' ' + b + 'h1v1h-1z').join('');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  function render(el) {
    const text = el.textContent.trim();
    const sr = document.createElement('span');
    sr.className = 'px-sr';
    sr.textContent = text;
    el.textContent = '';
    el.appendChild(sr);
    el.appendChild(svgFor(text));
  }

  window.PixelFont = { svgFor, cellsFor, render };
  document.querySelectorAll('[data-pixel]').forEach(render);
})();
