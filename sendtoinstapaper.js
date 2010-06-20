/**
 *  SendToInstapaper
 */
var SendToInstapaper = ( function() {
    /**
     *  "Global" Constants for Instapaper URLs and HTTP status codes
     */
    var URL_AUTH    =   "https://www.instapaper.com/api/authenticate",
        URL_ADD     =   "https://www.instapaper.com/api/add",

        STATUS_OK           =   200,
        STATUS_CREATED      =   201,
        STATUS_BADREQUEST   =   400,
        STATUS_FORBIDDEN    =   403,
        STATUS_ERROR        =   500;

    /**
     *  Wrapper for the XHR functionality used by `asyncRequest` and
     *  `syncRequest`.
     *
     *  @param  {Object}    options Configuration object, containing the request
     *                              `method`, `url`, `username`, `password`, and
     *                              other `data`.
     *  @return {Object}    The completed XHR object.
     */
    function request( options ) {
        var xhr         = new XMLHttpRequest(),
            postData    = "";

        xhr.open(
            options.method, options.url, options.async
        );

        if ( options.username || options.password ) {
            xhr.setRequestHeader( "Authorization", "Basic " + btoa( options.username + ":" + options.password ) );
        }
        if ( options.method === "POST" ) {
            xhr.setRequestHeader( 'Content-Type', 'application/x-www-form-urlencoded' );
        }
        if ( options.async && options.callback ) {
            xhr.onload  = options.callback;
            xhr.onerror = options.callback;
        }

        try {
            if ( options.data ) {
                for ( var key in options.data ) {
                    if ( options.data.hasOwnProperty( key ) ) {
                        postData += encodeURIComponent( key ) + "=" + encodeURIComponent( options.data[ key ] ) + "&";
                    }
                }
                postData += "1=1";
            }
            xhr.send( postData );
            return xhr;
        } catch ( e ) {
            return {
                'status':       0,
                'exception':    e
            };
        }
    } 
    /**
     *  Make a request via XMLHttpRequest, synchronously.
     *
     *  @param  {Object}    options Configuration object, containing the request
     *                              `method`, `url`, `username`, `password`, and
     *                              other `data`.
     *  @return {Object}    The completed XHR object.
     */
    function syncRequest( options ) {
        options.method = options.method || "GET";
        options.async  = false;
        return request( options );
    }

    /**
     *  Make a request via XMLHttpRequest, asynchronously.
     *
     *  @param  {Object}    options Configuration object, containing the request
     *                              `method`, `url`, `username`, `password`, and
     *                              other `data`.
     *  @return {Object}    The completed XHR object.
     */
    function asyncRequest( options ) {
        options.method = options.method || "GET";
        options.async  = true;
        return request( options );
    }


    /**
     *  Checks the user's authentication status, caching the result in 
     *  `localStorage.authenticated` for future use.
     *
     *  @param  {Boolean}   force   If set, ignore the cached authentication
     *                              status and force a reauth via HTTP.
     *  @return {Boolean}   `true` if authenticated, `false` otherwise.
     */
    function isAuthenticated( force ) {
        if ( option( 'authenticated' ) !== STATUS_ERROR && !force ) {
            return option( 'authenticated' );
        }

        option( 'authenticated', null );
        if (
            option( "username" ) !== undefined &&
            option( "password" ) !== undefined
        ) {
            var req = syncRequest( {
                'url':      URL_AUTH,
                'username': option( "username" ),
                'password': option( "password" )
            } );
            switch ( req.status ) {
                case STATUS_OK:
                    option( "authenticated",    true );
                    break;
                case STATUS_FORBIDDEN:
                    option( "authenticated",    false );
                    break;
                case STATUS_ERROR:
                default:
                    option( "authenticated",    STATUS_ERROR );
                    break;
            }
        }
        return localStorage.authenticated;
    }

    /**
     *  Sends the current tab's URL and title to Instapaper for safe-keeping,
     *  and kicks off the animation for the pageAction's icon.
     *
     *  @param  {Object}    tab         The currently visible tab.
     *  @param  {Function}  callback    A function to be called to handle 
     *                                  load and error events on the XHR
     *                                  object used for the request.  It ought
     *                                  accept a single argument: the XHR
     *                                  object itself.
     *
     *  @private
     */                                
    function sendURL( tab, callback ) {
        animatedIcon.start( tab.id );
        if ( isAuthenticated() ) {
            asyncRequest( {
                'method':   "POST",
                'url':      URL_ADD,
                'username': option( "username" ),
                'password': option( "password" ),
                'callback': function ( e ) { callback( e.target, tab ); },
                'data':     {
                    'url':      tab.url,
                    'title':    tab.title
                }  
            } );
        } else {
            callback( {
                "status":   STATUS_ERROR
            } );
        }
    }

/**************************************************************************
 * Page Initalization
 */
    /**
     *  Initialize the background page to handle tab events
     *  and listen for clicks on the pageAction itself.
     *
     *  @public
     */
    function backgroundInit() {
        option( 'currentTab', null );
        // When Chrome displays any tab, show the pageAction
        // icon in that tab's addressbar.
        var handleTabEvents = function( tab ) {
            option( 'currentTab', tab.id || tab );
            chrome.pageAction.show( tab.id || tab );
            setPopupState();
        };
        chrome.tabs.onSelectionChanged.addListener( handleTabEvents );
        chrome.tabs.onUpdated.addListener( handleTabEvents );
        chrome.tabs.getSelected( null, handleTabEvents );

        var handleClickEvents = function( response, tab ) {
            animatedIcon.stop();
            switch ( response.status ) {
                case STATUS_CREATED:
                    chrome.pageAction.setIcon( {
                        "tabId":    tab.id,
                        "path":     "success.png"
                    } );
                    break;
                case STATUS_BADREQUEST:
                case STATUS_ERROR:
                case STATUS_FORBIDDEN:
                default:
                    chrome.pageAction.setIcon( {
                        "tabId":    tab.id,
                        "path":     "failure.png"
                    } );
                    break;
            }
        };
        chrome.pageAction.onClicked.addListener( function ( tab ) {
            var response = sendURL( tab, handleClickEvents );
        } );

        // Listen for messages from the injected content script
        chrome.extension.onRequest.addListener(
            function( request, sender, sendResponse ) {
                if ( request.action === "sendToInstapaper" ) {
                   sendURL( sender.tab, handleClickEvents );
                }
                sendResponse( {} );
            }
        );
    }

    /**
     *  Initialize the setup/option page's form to properly store a
     *  username and password for future use.
     *  
     *  @public
     */
    function setupInit() {
        var theForm = document.getElementById( 'optionForm' ),
            user    = document.getElementById( 'username' ),
            pass    = document.getElementById( 'password' ),
            auth;

        user.value = option( 'username' );
        pass.value = option( 'password' );

        theForm.addEventListener( 'submit', function ( e ) {
            option( 'username', user.value );
            option( 'password', pass.value );
            auth = isAuthenticated( true );
            if ( auth === true ) {
                theForm.appendChild( document.createTextNode( "Success!" ) );
            } else if ( auth === false ) {
                theForm.appendChild( document.createTextNode( "Invalid username/password." ) );
            } else if ( auth === STATUS_ERROR ) {
                theForm.appendChild( document.createTextNode( "Error communicating with Instapaper.  Are you online?" ) );
            }

            setPopupState();

            e.preventDefault(); e.stopPropagation();
            return false;
        } );
    }


/**************************************************************************
 * Helper Functions
 */
    /**
     *  If the user is authenticated, the `pageAction` shouldn't render a
     *  popup.  If not, it should.  Calling this function ensures that
     *  state of affairs.
     *
     *  @private
     */
    function setPopupState( ) {
        chrome.pageAction.setPopup( {
            'tabId':    option( 'currentTab' ),
            'popup':    ( isAuthenticated() === true ) ? '' : 'setup.html'
        } );
    }

    /**
     *  Wrapper for `localStorage`, handling the little details of JSON
     *  encoding and decoding on store and read.
     *
     *  @param  {String}    key     The key with which the method should work
     *  @param  {Mixed}     value   If present, the value to store for `key`.
     *                              If not, the function returns the current
     *                              value stored.
     *
     *  @return {Mixed}     If `value` is provided, returns nothing, else,
     *                      returns the current value for `key`
     *
     *  @private
     */
    function option( key, value ) {
        if ( typeof( value ) !== "undefined" ) {
            localStorage[ key ] = JSON.stringify( { "value": value } );
        } else {
            if ( typeof( localStorage[ key ] ) !== "undefined" ) {
                return JSON.parse( localStorage[ key ] ).value;
            } else {
                return undefined;
            }
        }
    }

/**************************************************************************
 * Icon Animation
 */
    var animatedIcon = ( function() {
        var iconAnimationInterval   = null,
            canvas                  = null,
            context                 = null,
            iconAnimationState      = 0;

        function startIconAnimation( tabId ) {
            if ( ! canvas ) {
                canvas   =   document.getElementById( 'canvas' );
                context  =   canvas.getContext('2d');
            }
            if ( ! tabId ) {
                return;
            }
            iconAnimationInterval = window.setInterval( function () {
                chrome.pageAction.setIcon( {
                    "tabId":        tabId,
                    "imageData":    drawIcon( iconAnimationState )
                } );
                iconAnimationState += 1;
            }, 25 );
        }
            function drawIcon( state ) {
                var MAXANGLE        =   Math.PI * 4 / 2,
                    NUM_IN_CYCLE    =   75,
                    INTERVAL        =   MAXANGLE / NUM_IN_CYCLE;

                context.clearRect(0, 0, 19, 19);
                var x           = 9,
                    y           = 9,
                    radius      = 5,
                    startAngle, endAngle;

                if ( Math.floor( state / NUM_IN_CYCLE ) % 2 ) {
                    startAngle  = 0;
                    endAngle    = ( INTERVAL * state ) % MAXANGLE;
                } else {
                    startAngle  = ( INTERVAL * state ) % MAXANGLE;
                    endAngle    = 0;
                }

                context.beginPath();
                context.arc( x, y, radius, startAngle, endAngle, false );
                context.stroke();
                
                return context.getImageData(0, 0, 19, 19);
            }
        function stopIconAnimation() {
            clearInterval( iconAnimationInterval );
            iconAnimationInterval = null;
        }

        return {
            "start":    startIconAnimation,
            "stop":     stopIconAnimation
            // ,
            // "start":    function() {},
            // "stop":     function() {}
        };
    }() );

    return {
        'backgroundInit':   backgroundInit,
        'setupInit':        setupInit,
        'option':           option
    };
}() );
