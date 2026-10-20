/* 楚漢の章（独立版）の入口。漢文道場の本体なしで物語だけを開く。 */
(function () {
  'use strict';
  function boot() { if (window.Koumon) window.Koumon.open({ standalone: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
