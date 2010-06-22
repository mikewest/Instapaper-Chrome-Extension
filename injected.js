// keyboard shortcut
window.addEventListener('keydown', function(e) {
    if ( e.ctrlKey && e.keyCode === 80 ) { // Hard-coding `ctrl-p`.  Thanks NetNewsWire.
        chrome.extension.sendRequest(
            { "action":   "sendToInstapaper" },
            function () {}
        );
    }
}, false);
