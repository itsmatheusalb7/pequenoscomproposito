Cópia local do componente Cakto de upsell
=======================================

Origem: https://caktoscripts.nyc3.cdn.digitaloceanspaces.com/upsell.js
Consultado em: 2026-09-26.
SHA-256 do arquivo original: 47f258654f60283d95d0b72ddc7da0263d17aabd2eb24d08790cccc972b0bd9f

O arquivo cakto-upsell.js preserva o componente original, com cinco pontos de
redirecionamento substituídos por redirectWithParams. Os dois métodos openLink
foram removidos e suas chamadas passaram a usar diretamente a função global.
Requisições, pagamento, validação, tokens, temporizadores e decisões de funil
permanecem iguais ao original. navigation.js precisa carregar primeiro.

A cópia local é necessária porque o componente remoto possui redirecionamentos
internos que não oferecem um callback de navegação. Atualizações da Cakto devem
ser revisadas e receber as mesmas adaptações antes de substituir este arquivo.
O aviso de licença do fornecedor foi mantido. O endereço indicado pelo fornecedor
para upsell.js.LICENSE.txt retornou AccessDenied na data da consulta.

Verificação local: node --test tests/navigation.test.cjs, na raiz do projeto.
Os testes não efetuam pagamentos. O checkout hospedado em pay.cakto.com.br está
fora deste projeto; a preservação de parâmetros na saída desse checkout precisa
ser verificada também na configuração do funil na Cakto.
