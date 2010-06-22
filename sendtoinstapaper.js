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
     *  @param  {Object}    config Configuration object, containing the request
     *                              `method`, `url`, `username`, `password`, and
     *                              other `data`.
     *  @return {Object}    The completed XHR object.
     */
    function request( config ) {
        var xhr         = new XMLHttpRequest(),
            postData    = "";

        xhr.open(
            config.method, config.url, config.async
        );

        if ( config.username || config.password ) {
            xhr.setRequestHeader( "Authorization", "Basic " + btoa( config.username + ":" + config.password ) );
        }
        if ( config.method === "POST" ) {
            xhr.setRequestHeader( 'Content-Type', 'application/x-www-form-urlencoded' );
        }
        if ( config.async && config.callback ) {
            xhr.onload  = config.callback;
            xhr.onerror = config.callback;
        }

        try {
            if ( config.data ) {
                for ( var key in config.data ) {
                    if ( config.data.hasOwnProperty( key ) ) {
                        postData += encodeURIComponent( key ) + "=" + encodeURIComponent( config.data[ key ] ) + "&";
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
     *  Make a request via XMLHttpRequest, asynchronously.
     *
     *  @param  {Object}    config Configuration object, containing the request
     *                              `method`, `url`, `username`, `password`, and
     *                              other `data`.
     *  @return {Object}    The completed XHR object.
     */
    function asyncRequest( config ) {
        config.method = config.method || "GET";
        config.async  = true;
        return request( config );
    }


    /**
     *  Checks the user's authentication status, caching the result in 
     *  `localStorage.authenticated` for future use.  Three callbacks are
     *  available to cover the possible responses:
     *
     *  @param  {Object}    config  The call's configuration.
     *
     *  @return {Boolean}   `true` if authenticated, `false` otherwise.
     */
    function isAuthenticated( config ) {
        config = {
            'force':        config.force        || false,
            'isAuthed':     config.isAuthed     || function () {},
            'notAuthed':    config.notAuthed    || function () {},
            'error':        config.error        || function () {}
        };

        if ( !config.force && storage( 'authenticated' ) !== STATUS_ERROR ) {
            if ( storage( 'authenticated' ) ) {
                return config.isAuthed();
            } else {
                return config.notAuthed();
            } 
        }

        storage( 'authenticated', STATUS_ERROR );
        if (
            storage( "username" ) !== undefined &&
            storage( "password" ) !== undefined
        ) {
            var req = asyncRequest( {
                'url':      URL_AUTH,
                'username': storage( "username" ),
                'password': storage( "password" ) || "null",
                'callback': function ( e ) {
                    switch ( req.status ) {
                        case STATUS_OK:
                            storage( "authenticated", true );
                            config.isAuthed();
                            break;
                        case STATUS_FORBIDDEN:
                            storage( "authenticated", false );
                            config.notAuthed();
                            break;
                        case STATUS_ERROR:
                            config.error();
                            break;
                    }
                }
            } );
        }
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
        var authedCallback = function () {
                asyncRequest( {
                    'method':   "POST",
                    'url':      URL_ADD,
                    'username': storage( "username" ),
                    'password': storage( "password" ) || "null",
                    'callback': function ( e ) { callback( e.target, tab ); },
                    'data':     {
                        'url':      tab.url,
                        'title':    tab.title
                    }  
                } );
            },
            notAuthedCallback   = function () {
                callback( {
                    "status":   STATUS_ERROR
                } );
            };
        isAuthenticated( {
            'isAuthed':     authedCallback,
            'notAuthed':    notAuthedCallback,
            'error':        notAuthedCallback
        } );
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
        storage( 'currentTab', null );
        // When Chrome displays any tab, show the pageAction
        // icon in that tab's addressbar.
        var handleTabEvents = function( tab ) {
            storage( 'currentTab', tab.id || tab );
            chrome.pageAction.show( tab.id || tab );
            isAuthenticated( {
                'isAuthed':     function () { clearPopup(); },
                'notAuthed':    function () { setPopup(); },
                'error':        function () { setPopup(); }
            } );
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

        user.value = storage( 'username' ) || "";
        pass.value = storage( 'password' ) || "";

        theForm.addEventListener( 'submit', function ( e ) {
            storage( 'username', user.value );
            storage( 'password', pass.value );
            isAuthenticated( {
                'force':        true,
                'isAuthed':     function () {
                    notify( {
                        'el':       theForm,
                        'msg':      "Success!",
                        'type':     "success",
                        'callback': function () { window.close(); }
                    } );
                    clearPopup();
                },
                'notAuthed':    function () {
                    notify( {
                        'el':       theForm,
                        'msg':      "Username/password failure!",
                        'type':     "failure"
                    } );
                    setPopup();
                },
                'error':        function () {
                    notify( {
                        'el':       theForm,
                        'msg':      "Couldn't connect to Instapaper!",
                        'type':     "failure"
                    } );
                    setPopup();
                }
            } );
            e.preventDefault(); e.stopPropagation();
            return false;
        } );
    }

    /**
     *  Generate a notification div, append it somewhere useful
     *  with a helpful message, then remove it after a set timeout.
     *
     *  @param  {DOMElement}    The node to which to append the notification
     *  @param  {String}        The message.
     *  @param  {String}        The message type (success/failure)
     *  @param  {Int}           The timeout (in ms) after which to remove the notification
     *  @param  {Function}      Callback to trigger on removal
     */
    function notify( config ) {
        console.log( "Notification: %o", config );
        config = {
            'el':       config.el       || null,
            'msg':      config.msg      ||  "",
            'type':     config.type     ||  "",
            'timeout':  config.timeout  || 1000,
            'callback': config.callback || function () {}
        };
        var notification = document.createElement( "div" );
        notification.innerText = config.msg;
        notification.className = "notification " + config.type;
        config.el.appendChild( notification );
        setTimeout(
            function () {
                notification.style.opacity = 0;
                notification.addEventListener(
                    'webkitTransitionEnd',
                    function( event ) {
                        config.el.removeChild( notification );
                        config.callback();
                    },
                    false
                );

            },
            1000
        );
    }

/**************************************************************************
 * Helper Functions
 */
    /**
     *  If the user is not authenticated, the `pageAction` should render a
     *  popup.  Calling this function ensures that state of affairs.
     *
     *  @private
     */
    function setPopup() {
        chrome.pageAction.setPopup( {
            'tabId':    storage( 'currentTab' ),
            'popup':    'setup.html'
        } );
    }
    /**
     *  If the user is authenticated, the `pageAction` shouldn't render a
     *  popup.  Calling this function ensures that state of affairs.
     *
     *  @private
     */
    function clearPopup() {
        chrome.pageAction.setPopup( {
            'tabId':    storage( 'currentTab' ),
            'popup':    ''
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
    function storage( key, value ) {
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
        };
    }() );

    return {
        'backgroundInit':   backgroundInit,
        'setupInit':        setupInit
    };
}() );
