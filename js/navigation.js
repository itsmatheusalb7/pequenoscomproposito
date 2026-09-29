/* Único ponto de redirecionamento. Não decodifica nem filtra a query atual. */
function redirectWithParams(destination) {
  const currentParams = window.location.search;

  if (!currentParams) {
    window.location.href = destination;
    return;
  }

  // A query precisa vir antes do fragmento para continuar acessível ao destino.
  destination = String(destination);
  const hashIndex = destination.indexOf("#");
  const hash = hashIndex === -1 ? "" : destination.substring(hashIndex);
  if (hashIndex !== -1) destination = destination.substring(0, hashIndex);

  if (destination.includes("?")) {
    window.location.href = destination + "&" + currentParams.substring(1) + hash;
  } else {
    window.location.href = destination + currentParams + hash;
  }
}

// Executa depois dos handlers dos links e dos trackers, respeitando cancelamentos.
window.addEventListener("click", function (event) {
  if (event.defaultPrevented || event.button !== 0) return;
  const link = event.composedPath().find(function (node) {
    return node.matches && node.matches("a[href]");
  });
  if (!link || link.hasAttribute("download")) return;
  const href = link.getAttribute("href");
  // Âncoras apenas rolam a página; mailto/tel não navegam entre páginas do funil.
  if (!href || href.charAt(0) === "#" || !/^https?:$/.test(link.protocol)) return;
  event.preventDefault();
  redirectWithParams(link.href);
});
