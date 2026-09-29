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

/* Aplica a variante sorteada aos preços e ao checkout da landing. */
(function showExperimentPrice() {
  var amount = window.__cjPriceVariant === "b" ? 990 : 1490;
  var checkoutUrl = amount === 1490
    ? "https://pagamentoverificadopt.lovable.app/1490"
    : "https://pagamentoverificadopt.lovable.app/1700";
  document.querySelectorAll("[data-checkout-ab]").forEach(function (link) {
    link.href = checkoutUrl;
  });
  var format = function (cents) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "EUR" }).format(cents / 100);
  };
  var labels = { amount: format(amount), saving: format(4290 - amount), unit: format(Math.round(amount / 11)) };
  document.querySelectorAll("[data-price-ab]").forEach(function (node) {
    node.textContent = labels[node.dataset.priceAb];
  });
  document.documentElement.classList.remove("price-ab-loading");
})();
