// keyboard shortcut
window.addEventListener('keydown', function(e) {
    console.log( e, e.ctrlKey, e.keyCode );
    if ( e.ctrlKey && e.keyCode === 80 ) { // Hard-coding `ctrl-p`.  Thanks NetNewsWire.
        chrome.extension.sendRequest(
            { "action":   "sendToInstapaper" },
            function () {}
        );
    }
}, false);
