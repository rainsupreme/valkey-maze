// ── Shared logo embedding ───────────────────────────────────
//
// Extracts the first <path> from logo SVG source text and emits it
// centered at a target point, scaled to a target height. Pure string
// work -- no XML parser, so it runs in both browser and Node.

/**
 * @param {string} logoSvg - SVG source text
 * @param {object} params
 * @param {string} params.fill
 * @param {number} params.cx - target center x
 * @param {number} params.cy - target center y
 * @param {number} params.height - target rendered height
 * @param {number} [params.stretchY=1] - extra vertical scale factor
 * @returns {string} an SVG <path> element, or '' if no path found
 */
export function embedLogoPath(logoSvg, { fill, cx, cy, height, stretchY = 1 }) {
    const pathMatch = logoSvg.match(/<path[^>]*\bd="([^"]+)"/);
    if (!pathMatch) return '';
    const d = pathMatch[1];

    let logoCx = 32.0;
    let logoCy = 36.5;
    let logoH = 70.0;
    const vbMatch = logoSvg.match(/viewBox="([^"]+)"/);
    if (vbMatch) {
        const vb = vbMatch[1].trim().split(/[\s,]+/).map(Number);
        if (vb.length === 4 && vb.every(Number.isFinite)) {
            logoCx = vb[0] + vb[2] / 2;
            logoCy = vb[1] + vb[3] / 2;
            logoH = vb[3];
        }
    }

    const scale = height / logoH;
    const transform =
        `translate(${cx - logoCx * scale},${cy - logoCy * scale * stretchY})` +
        ` scale(${scale},${scale * stretchY})`;
    return `<path class="logo" d="${d}" fill="${fill}" transform="${transform}"/>`;
}
