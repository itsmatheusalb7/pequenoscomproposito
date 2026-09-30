/* Carrossel de depoimentos (mobile) — bolinhas de navegação */
document.querySelectorAll('[data-carousel]').forEach(function (carousel) {
  var track = carousel.querySelector('[data-track]');
  var dotsBox = carousel.querySelector('[data-dots]');
  var slides = Array.prototype.slice.call(track.children);
  if (!slides.length) return;

  slides.forEach(function (_, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Ir para o depoimento ' + (i + 1));
    b.addEventListener('click', function () {
      track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft, behavior: 'smooth' });
    });
    dotsBox.appendChild(b);
  });

  var dots = Array.prototype.slice.call(dotsBox.children);

  function sync() {
    var center = track.scrollLeft + track.clientWidth / 2;
    var active = 0;
    var best = Infinity;
    slides.forEach(function (s, i) {
      var d = Math.abs(s.offsetLeft - track.offsetLeft + s.clientWidth / 2 - center);
      if (d < best) { best = d; active = i; }
    });
    dots.forEach(function (d, i) { d.classList.toggle('is-active', i === active); });
  }

  var ticking = false;
  track.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { sync(); ticking = false; });
  });
  sync();
});

/* FAQ — abre um item de cada vez */
document.querySelectorAll('.faq details').forEach(function (item) {
  item.addEventListener('toggle', function () {
    if (!item.open) return;
    document.querySelectorAll('.faq details').forEach(function (other) {
      if (other !== item) other.open = false;
    });
  });
});

/* Mantém a origem do anúncio tanto no checkout antigo quanto no da Cakto. */
(function preserveCheckoutTracking() {
  var params = new URLSearchParams(window.location.search);
  var allowed = ["src", "sck", "utm_source", "utm_campaign", "utm_medium", "utm_content", "utm_term"];
  var checkout = new URLSearchParams();
  allowed.forEach(function (key) {
    var value = params.get(key);
    if (value) checkout.set(key, value.slice(0, 500));
  });
  var query = checkout.toString();
  if (!query) return;
  document.querySelectorAll('a[href="/checkout/"], a[href^="https://pay.cakto.com.br/"]').forEach(function (link) {
    var url = new URL(link.href, window.location.origin);
    checkout.forEach(function (value, key) { url.searchParams.set(key, value); });
    link.href = url.toString();
  });
})();
