(function () {
  // revela os blocos ao rolar a página
  var alvos = document.querySelectorAll('.rev');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); }
      });
    }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
    alvos.forEach(function (el) { io.observe(el); });
  } else {
    alvos.forEach(function (el) { el.classList.add('on'); });
  }

  // player da amostra de áudio
  var audio = document.getElementById('amostra');
  var btnPlay = document.getElementById('btnPlay');
  var advPlayer = document.getElementById('advPlayer');
  if (audio && btnPlay && advPlayer) {
    btnPlay.addEventListener('click', function () {
      if (audio.paused) {
        audio.play().catch(function () {});
        advPlayer.classList.add('is-playing');
        btnPlay.setAttribute('aria-label', 'Pausar a amostra');
      } else {
        audio.pause();
        advPlayer.classList.remove('is-playing');
        btnPlay.setAttribute('aria-label', 'Ouvir a amostra');
      }
    });
    audio.addEventListener('ended', function () {
      advPlayer.classList.remove('is-playing');
      btnPlay.setAttribute('aria-label', 'Ouvir a amostra');
    });
  }

  // barra fixa inferior aparece depois do hero (mobile)
  var barra = document.getElementById('barraBaixo');
  if (barra) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 420) { barra.classList.add('vis'); }
      else { barra.classList.remove('vis'); }
    }, { passive: true });
  }
})();
