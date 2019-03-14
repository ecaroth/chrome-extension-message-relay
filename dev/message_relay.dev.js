// IMPORTANT NOTE!
// DO NOT use this version of the script in production, this is the dev/build version that exposes internal 
// functions for testing. Use the modified, minified version in /dist/message_relay.prod.js

// NOTE - lines that include /*REM*/ are stripped when building production version of this script

(() => {
    "use strict";

    const relay = function( namespace, relay_level, debug ){

        const _debug = debug || false,

            LEVELS = Object.freeze({                // available levels msg relay can be used at
                extension:  'extension',            // relay running in chrome extension
                content:    'content',              // relay running in content script
                page:       'page',                 // relay running on web page
                iframe:     'iframe',               // relay running in iframe
                iframe_shim:'iframe_shim',          // relay running in an iframe shim (see readme)
                test:       'test'                  // relay for unit testing
            }),
            LEVEL_ORDER = Object.freeze({           // ordering of levels (indicitive of how messages can bubble up/down)
                extension:      4,
                content:        3,
                page:           2,
                iframe_shim:    1,
                iframe:         0,
                test:           -1
            }),
            level = relay_level;                    // relay level (one of 'content','page','iframe','extension') - the level that THIS relay is listening at
        
        let received_messages = {},                     // digest of all received messages by msg_id, which is cleaned out every 2 mins to keep memory usage down
            received_msg_clean_tmo = null,              // tmo for setTimeout call used to clean received_messages digest every 2 minutes
            received_msg_clean_interval_secs = 2*60,    // 2 mins between digest cleaning intervals
            msg_namespace = namespace,                  // the namespace for your msg relay - used to capture and identify relay msgs from other postMsg traffic "docalytics.message";   //
            last_sender_info = null,                    // info about the last message sender
            last_msg_type = null,                       // the last received message type
            listeners = {},                             // bound listeners for the relay (at this level)
            content_scripts_ready = {},                 // used by extension level only, to track what content scripts in tab_ids are ready
            content_script_connect_port = null;         // used by content script level only, to hold variable for chrome.rumtime port to extension

        
        // =============== START OF TEST-ONLY VARIABLE DEFS ====================

        let test_response = null;  //Response function used to validate tests in a few circumstances        /*REM*/ 
            
        // =============== END OF TEST-ONLY VARIABLE DEFS ====================

        //this function allows you to bind any msg type as a listener, and will ping the callback when the message comes to this level (exposed as <instance>.on)
        //you can also namespace msg types with msg_type.namespace, or specify no namespace
        function _bind( msg_types, cb ){
            if( typeof msg_types === 'string' ) msg_types = [msg_types];

            msg_types.forEach((msg_type) =>{
                let mtype_info = _get_mtype_info(msg_type);
                if(!(mtype_info.type in listeners)) listeners[mtype_info.type] = [];
                listeners[mtype_info.type].push({ 'fn': cb, 'ns': mtype_info.namespace});
            });
        }

        //this function allows you to unbind any msg type as a listener (with a sepcified namespace or ALL events of this type(s) if no namespace is supplied)
        function _unbind(msg_types){
            if( typeof msg_types === 'string' ) msg_types = [msg_types];

            msg_types.forEach((msg_type) => {
                let mtype_info = _get_mtype_info(msg_type);

                if(mtype_info.type in listeners){
                    if(!mtype_info.namespace){
                        //unbind ALL listeners on this message type
                        delete listeners[mtype_info.type];
                    }else{
                        //find only messages bound on this namespace/type
                        _unbind_namspace_listeners_for_message_type( mtype_info.type, mtype_info.namespace );
                    }
                }
            });
        }

        //this function parses message type into component parts (type && namespace)
        function _get_mtype_info(msg_type){
            let parts = msg_type.split(".");
            return {
                type: parts.splice(0,1)[0],
                namespace: parts.length > 0 ? parts.join(".") : null
            };
        }

        //utility function to unbind all namespaced listeners for supplied message type
        function _unbind_namspace_listeners_for_message_type( msg_type, namespace ){
            if(!(msg_type in listeners)) return;

            for( let i = listeners[msg_type].length-1; i>=0; i--){
                if(listeners[msg_type][i].ns === namespace) listeners[msg_type].splice(i,1);
            }
        }

        //this function unbinds ALL listeners, or all listeners for a specific namespace
        function _unbind_all( namespace ){
            if( !namespace){
                listeners = {};
            }else{
                for(let msg_type in listeners){
                    _unbind_namspace_listeners_for_message_type(msg_type, namespace);
                }
            }
        }

        //get the base msg object used for relaying
        function _get_msg( type, dest, up, data ){
            //type = string, message type (specified when calling send_up or send_down)
            //dest = detination level (one of LEVELS) - NOTE: can specific a specific tab.id to use only by specifying a @tab.id
            //up = boolean, is this message going upwards (else going down)
            //data = javascript variable to pass with message
            if(!data) data = {};
            let msg_id = ('msg_id' in data) ? data.msg_id : `${dest}:${type}:${new Date().getTime()}`;
            data.msg_id = msg_id;
            let msg_obj = {
                msg_type:           type,
                msg_from:           level,
                msg_destination:    dest,
                msg_up:             up,
                msg_namespace:      msg_namespace,
                msg_data:           data,
                msg_id:             msg_id,
                msg_tab_id:         null
            };
            let _dest = _parse_destination(dest);
            if( _dest.tab_id ){
                msg_obj.msg_destination = _dest.level;
                msg_obj.msg_tab_id = _dest.tab_id;
            }
            return msg_obj;
        }

        //send a message to the specified level(s) - NOTE destinations can be a string or array of destination strings
        function _send_msg( msg_type, destinations, data ){
            if( typeof destinations === 'string' ) destinations = [destinations];

            destinations.forEach((dest) => {
                if( !_is_valid_destination(dest) ){
                    return _log(`NOTICE - invalid level specified as destination (${dest})`);
                }

                let _dest_level = _parse_destination(dest).level;

                if (LEVEL_ORDER[_dest_level] < LEVEL_ORDER[level]) {
                    _send_down(msg_type, dest, data);
                } else {
                    _send_up(msg_type, dest, data);
                }

            });
        }

        //send a message DOWN the listening stack (exposed as <instance>.send_down)
        function _send_down( msg_type, destination, data ){
            let msg = _get_msg( msg_type, destination, false, data );
            _log( `Send msg DOWN from ${level} to ${destination} : ${msg_type} - ${JSON.stringify(data)}`);
            _relay( msg );
        }

        //send a message UP the listening stack (exposed as <instance>.send_up)
        function _send_up( msg_type, destination, data ){
            let msg = _get_msg( msg_type, destination, true, data );
            _log( `Send msg UP from ${level} to ${destination} : ${msg_type} - ${JSON.stringify(data)}`);
            _relay( msg );
        }

        //fn to relay a message from this_level either up/down (using appropriate method baesd on data.msg_destination)
        function _relay_from_to_level( this_level, data ){

            if( this_level === LEVELS.extension){
                //broadcasting DOWN from extension to content script - percolate it to each tab using chrome.runtime port
                //UNLESS a specific tab id is included on the request destination
                
                if(level === LEVELS.test){                                                              /*REM*/
                    if(typeof test_response === 'function') test_response("extension_down", data );     /*REM*/
                }else{                                                                                  /*REM*/
                    if(data.msg_tab_id){
                        content_scripts_ready[data.msg_tab_id] = content_scripts_ready[data.msg_tab_id] || [];
                        content_scripts_ready[data.msg_tab_id].push(data);
                    }else{
                        // assuming no msg id is included, send message to all ports
                        for(var tab_id in content_scripts_ready){
                            content_scripts_ready[tab_id].push(data);
                        }
                    }
                }                                                                                       /*REM*/
            }else if( (this_level === LEVELS.content && data.msg_destination === LEVELS.extension) || this_level === LEVELS.extension ){
                //going UP form content script to extension.. use connected runtime port
                        
                if(level === LEVELS.test){                                                              /*REM*/
                    if(typeof test_response === 'function') test_response("content_up", data);          /*REM*/
                }else{                                                                                  /*REM*/
                    console.log("SENDING UP", content_script_connect_port);
                    content_script_connect_port.postMessage( data );
                }                                                                                       /*REM*/
            }else{
                //no interaction with extension background, broadcast UP w/ postmessage so content/page can receive
                if( this_level === LEVELS.iframe || this_level === LEVELS.iframe_shim ) { 
                    if(level === LEVELS.test){                                                          /*REM*/
                        if(typeof test_response === 'function') test_response("iframe_up", data);       /*REM*/
                    }else{                                                                              /*REM*/
                        window.parent.postMessage(data, "*");
                    }                                                                                   /*REM*/
                }else if( (this_level === LEVELS.page || this_level === LEVELS.content) && data.msg_destination === LEVELS.iframe){
                    //going DOWN from page or content to iframe, so postMessage to iframe(s) directly
                    //TODO: add support for targetting a specific iframe domain or DOM elem?
                    
                    if(level === LEVELS.test){                                                          /*REM*/
                        if(typeof test_response === 'function') test_response("iframe_down", data);     /*REM*/
                    }else{                                                                              /*REM*/
                        let iframes = document.getElementsByTagName('iframe');
                        for(let i=0; i<iframes.length; i++){
                            try{
                                iframes[i].contentWindow.postMessage(data, "*");
                            }catch(e){}
                        }
                    }                                                                                   /*REM*/
                }else{
                    //communication between content and page directly (UP or DOWN) or from content to iframe_shim
                    if(level === LEVELS.test){                                                          /*REM*/
                        if(typeof test_response === 'function'){                                        /*REM*/
                            test_response("page_content_"+(data.msg_up ? 'up' : 'down'), data);         /*REM*/
                        }                                                                               /*REM*/
                    }else{                                                                              /*REM*/
                        window.postMessage(data, "*");
                    }                                                                                   /*REM*/
                }
            }
        }

        //This function is used by both send_up and send_down to relay a message the proper direction
        function _relay( data ){
            _relay_from_to_level( level, data );
        }

        // Used for extension level only, marking content script as ready so we know if we can send messages or must wait
        // (aka port closed, page reloading, etc);
        function _mark_content_script_ready( port ){
            let tab_id = port.sender.tab.id;
            let pending_cbs =  Array.isArray(content_scripts_ready[tab_id]) ? content_scripts_ready[tab_id].slice() : [];
            
            port.onDisconnect.addListener(info => {
                delete content_scripts_ready[info.sender.tab.id];
            });
            port.onMessage.addListener((msg) => {
                _incoming_message(msg, port.sender);
            });

            content_scripts_ready[tab_id] = {
                push: (data) => {
                    port.postMessage(data);
                }
            };
            pending_cbs.forEach(data => content_scripts_ready[tab_id].push(data));
        }

        //This function is called for every incoming message to this level and determines if the messsage is intended for this level
        //(and calls needed listeners) or continues relaying it upwards/downwards
        function _incoming_message( msg, sender ){
            //searialize/unserialize msg object so we don't end up with closure memory leaks, then assign
            let {msg_data, msg_from, msg_up, msg_destination, msg_type, msg_id} = JSON.parse( JSON.stringify(msg) );

            //set last sender & last message type
            if(sender) last_sender_info = sender;
            last_msg_type = msg_type;

            let _msg_reception_id = `${msg_id}:${msg_destination}`;

            if(msg_from === level || (_msg_reception_id in received_messages)){
                //message already received - need this because page scripts and content scripts listen at same 
                //postMessage level and we don't want to relay it twice if it's a pass-through
                return false;
            }

            if( msg_destination === level ){
                //message intended for this level, call any bound listeners
                _log( `Msg (${msg_type}) received from ${msg_from} to ${msg_destination} - ${JSON.stringify(msg_data)}` );
                received_messages[_msg_reception_id] = 0;

                if(level === LEVELS.test && typeof test_response === 'function'){                      /*REM*/
                    test_response("call_listener", msg);                                                /*REM*/
                }else{                                                                                  /*REM*/
                    _call_bound_listeners( msg_type, msg_data );
                }                                                                                       /*REM*/
            }else{
                //message still bubbling up/down.. just relay if needed
                msg.msg_from = level;

                if(level === LEVELS.test && typeof test_response === 'function'){                      /*REM*/
                    test_response("bubble", msg);                                                       /*REM*/
                }else{                                                                                  /*REM*/
                    if(msg_up && LEVEL_ORDER[level] > LEVEL_ORDER[msg_from]){
                        _relay( msg );
                        _log( `Msg (${msg_type}) relaying UP from ${msg_from} to ${msg_destination} - ${JSON.stringify(msg_data)}` );
                    }else if(!msg_up && LEVEL_ORDER[level] < LEVEL_ORDER[msg_from]){
                        _relay( msg );
                        _log( `Msg (${msg_type}) relaying DOWN ${msg_from} to ${msg_destination} - ${JSON.stringify(msg_data)}` );
                    }
                }                                                                                       /*REM*/    
            }
        }

        //call all bound listeners for this message type at this level
        function _call_bound_listeners( msg_type, msg_data ){
            if(!(msg_type in listeners)) return;

            listeners[msg_type].forEach((listener) => {
                listener.fn.call( listener, msg_data );
            });
        }

        //check if a level is an actual context level (or level w/ tab.id)
        function _is_valid_destination(dest){
            if(!dest) return false;
            let _level = _parse_destination(dest).level;
            return (_level in LEVELS);
        }

        //function to parse a destination address and return level (and optionally set tab.id)
        function _parse_destination(dest){
            let parts = dest.split("@");
            return {
                level:      parts[0],
                tab_id:     parts.length > 0 ? parseInt(parts[1],10) : null
            };
        }

        //function to direct a message through channels via specific tab.id
        function _level_via_tab_id( level, tab_id ){
            return `${level}@${tab_id}`;
        }

        //log function (that fires only if debug is enabled)
        function _log( msg ){
            if(!_debug) return;
            console.log(`::MSG-RELAY (${level}):: ${msg}`);
        }

        //fn to mock an incoming message to the relay (as if incoming from a different level) - useful for testing 
        //funcitonality tied to bound listeners in applications that use the relay
        function _local_send_msg( msg_type, data ){
            let _msg = _get_msg( msg_type, level, true, data );
            _msg.msg_from = 'mock';
            _incoming_message( _msg, {tabId: 999} );
        }


        //setup received_messages clear interval, where we clean 2 intervals ago IDs up and mark this batches
        //for deletion in the next interval
        function _setup_received_msg_clean_interval(){
            const   DELETE = 1, 
                    MARK_FOR_NEXT_ROUND_DELETE = 0;

            received_msg_clean_tmo = setInterval(function(){
                for(let _msg_id in received_messages){
                    if(received_messages[_msg_id] === MARK_FOR_NEXT_ROUND_DELETE){
                        received_messages[_msg_id] = DELETE;
                    }else{
                        delete received_messages[_msg_id];
                    }
                }    
            }, (received_msg_clean_interval_secs * 1000) );
        }
        _setup_received_msg_clean_interval();


        // =============== START OF TEST-ONLY FUNCTIONALITY ====================

        
        //fn to check current env and throw error if we are NOT in test env
        function _is_test(){                                                                                            /*REM*/
            if(level !== LEVELS.test){                                                                                  /*REM*/
                throw new ChromeExtensionMessageRelayError("Cannot call test methods @ this level!");                   /*REM*/
            }                                                                                                           /*REM*/
            return true;                                                                                                /*REM*/
        }                                                                                                               /*REM*/

        //fn to pass in an internal token, check that we are in a test ENV, and return reference to token
        function _test( token ){                                                                                        /*REM*/
            _is_test();                                                                                                 /*REM*/
            return token;                                                                                               /*REM*/
        }                                                                                                               /*REM*/

        const test_functions = {                                                                                        /*REM*/
            getListeners:   () => { return _test(listeners); }, //get internal listeners obj                            /*REM*/
            setListeners:   (v) => { _is_test(); listeners=v; }, //set internal listeners obj                           /*REM*/
            clearTMO:       () => { clearInterval(received_msg_clean_tmo); }, //clear currently running tmo             /*REM*/
            setTMOsecs:     (v) => { received_msg_clean_interval_secs = v; }, //set the tmo interval seconds            /*REM*/
            setRecMsg:      (v) => { received_messages = v; }, //set the received_messages msg_obj                      /*REM*/
            setResponseFn:  (fn) => { _is_test(); test_response=fn; }, //set test fn that is called for responses       /*REM*/
            token:          (token) => {                                                                                /*REM*/
                                _is_test();                                                                             /*REM*/
                                return eval(token);                                                                     /*REM*/ // jshint ignore:line
            } //get exposed reference to an internal fn/var                                                             /*REM*/
        };                                                                                                              /*REM*/


        //create custom error class
        function ChromeExtensionMessageRelayError(message) {                                                            /*REM*/
            this.name = 'ChromeExtensionMessageRelayError';                                                             /*REM*/
            this.message = message || 'Error in chrome extension message relay';                                        /*REM*/
            this.stack = (new Error()).stack;                                                                           /*REM*/
        }                                                                                                               /*REM*/
        ChromeExtensionMessageRelayError.prototype = Object.create(Error.prototype);                                    /*REM*/
        ChromeExtensionMessageRelayError.prototype.constructor = ChromeExtensionMessageRelayError;                      /*REM*/

        if(level !== LEVELS.test){                                                                                      /*REM*/
            let msg = "ERROR - you are using a version of the script intended only for dev and testing! ";              /*REM*/
            msg += "Please use the version in /dist/message_relay.prod.js";                                             /*REM*/
            throw new ChromeExtensionMessageRelayError(msg);                                                            /*REM*/
        }                                                                                                               /*REM*/
            

        // =============== END OF TEST-ONLY FUNCTIONALITY ====================

        if( level !== LEVELS.test ){
            //if NOT in test ENV, bind needed listeners for appropriate ENV to wire things up
        
            if( [LEVELS.page, LEVELS.content, LEVELS.iframe, LEVELS.iframe_shim].includes(level)){
                //this relay is in the page, content, or iframe level so setup listener for postmessage calls
                window.addEventListener('message', function(event){
                    // IGNORE stuff that isn't part of relay traffic, for this namespace
                    if(typeof event.data === 'object' && 'msg_namespace' in event.data && (event.data.msg_namespace === msg_namespace)){
                        _incoming_message( event.data );
                    }
                });
            }
            if(level === LEVELS.content){
                _log('Alerting extension of ready');
                content_script_connect_port = chrome.runtime.connect({name: namespace});
                content_script_connect_port.onMessage.addListener((msg) => {
                    _incoming_message(msg);
                });
            }
            if(level === LEVELS.extension){
                // every time a content script conencts, mark the channel as ready!
                chrome.runtime.onConnect.addListener((port) => {
                    if(port.name !== namespace) return;
                    _mark_content_script_ready(port);
                });
            }
        }


        return {
            levels: LEVELS,             // Get list of available levels
            on: _bind,                  // Bind listener for msg event
            off: _unbind,               // Unbind listener for msg event
            offAll: _unbind_all,        // Unbind all listeners at this level
            send: _send_msg,            // Send message to specific level(s)
            levelViaTabId: _level_via_tab_id,   // Send message to specific level (on tabId channel only)
            getLastMsgSenderInfo: () => {       // Get the sender info for last received message
                return last_sender_info; 
            },
            getLastMsgType: () => {             // Get the msg type for last received message
                return last_msg_type; 
            },
            mockSend: _local_send_msg,   // Mock an incoming message to this level, useful for testing apps that use script
            localSend: _local_send_msg   // Fire event to a local listener (on this level)
            , test: test_functions      // Functionality exposed only for testing purposes                               /*REM*/

            };
    };

    if (('undefined' !== typeof module) && module.exports) {
       //publish for node
       module.exports = relay;
    }else{
        //publish for browser/extension
        window.chrome_extension_message_relay = relay;
    }

})();