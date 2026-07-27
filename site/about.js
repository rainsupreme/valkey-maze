// ── About panel (top-left), shared across pages ────────────
//
// Injects the "Check out Valkey!" panel with the hover-expand blurb.
// One script include per page, like site/nav.js.

const ABOUT_HTML = `
  <div id="about-panel">
    <a href="https://valkey.io" target="_blank" rel="noopener" class="about-trigger">
      <svg class="about-logo" width="28" height="32" viewBox="1.07 1.53 60.17 69.48" xmlns="http://www.w3.org/2000/svg">
        <path fill="#6983ff" fill-rule="evenodd" d="M 13.482285 60.805337 L 1.072337 53.640450 L 1.072337 18.900520 L 31.157999 1.530556 L 61.243660 18.900520 L 61.243660 53.640450 L 31.157999 71.010414 L 20.548372 64.884944 L 20.548372 50.731296 L 20.548372 48.809864 L 14.993765 45.602910 L 14.993765 26.938060 L 31.157998 17.605635 L 47.322232 26.938060 L 47.322232 45.602910 L 34.703495 52.888341 L 34.703495 45.880508 C 39.359237 44.162831 42.114086 39.354893 41.241659 34.469690 C 40.369233 29.584486 36.120492 26.027288 31.157998 26.027288 C 26.195505 26.027288 21.946764 29.584486 21.074338 34.469690 C 20.201911 39.354893 22.956760 44.162831 27.612502 45.880508 L 27.612502 60.093515 L 31.157998 62.140509 L 53.562096 49.205497 L 53.562096 23.335473 L 31.157998 10.400461 L 8.753901 23.335473 L 8.753901 49.205497 L 13.482285 51.935431 L 13.482285 60.805337 Z M 31.157998 31.768045 C 33.644628 31.768045 35.660439 33.783856 35.660439 36.270485 C 35.660439 38.757114 33.644628 40.772925 31.157998 40.772925 C 28.671369 40.772925 26.655558 38.757114 26.655558 36.270485 C 26.655558 33.783856 28.671369 31.768045 31.157998 31.768045 Z" />
      </svg>
      <span class="about-link-text">Check out Valkey!</span>
    </a>
    <div class="about-content">
      <p class="about-text">
        Made by Rain Valentine 🌧️
        <br><br>
        Usually Rain works on optimizing data structures in Valkey, so that's where she gets serious. It's a fast open-source in-memory database - You should check it out! 😁
      </p>
    </div>
  </div>
`;

export function initAbout() {
    if (document.getElementById('about-panel')) return;
    document.body.insertAdjacentHTML('afterbegin', ABOUT_HTML);
}

initAbout();
