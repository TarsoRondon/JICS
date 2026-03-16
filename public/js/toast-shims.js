fei(function() {
    'use strict';

    // Wait for toast to be available
    function initShims() {
        if (typeof window.toast === 'function') {
            window.showToastErro = function(msg) {
                toast(String(msg || 'Erro desconhecido'), 'error');
            };

            window.showToastSucesso = function(msg) {
                toast(String(msg || 'Sucesso!'), 'success');
            };

            // Bonus: object format shim for consistency (used in telao.js etc.)
            window.showToast = function(opts) {
                const type = opts.type || 'info';
                const message = opts.message || opts.title || 'Info';
                toast(message, type);
            };

            console.log('[toast-shims] Shims loaded: showToastErro, showToastSucesso, showToast');
        } else {
            console.warn('[toast-shims] window.toast not found, retrying...');
            setTimeout(initShims, 100);
        }
    }

    // Init immediately or on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initShims);
    } else {
        initShims();
    }
})();